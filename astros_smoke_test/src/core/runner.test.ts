import { describe, it, expect } from 'vitest';
import { ScenarioRunner, type Scenario, type Step, type RunnerEvent } from './runner.js';
import { FakeTransport } from './transport.js';

function okStep(name: string, trace: string[]): Step {
  return {
    name,
    run: async () => {
      trace.push(name);
      return { ok: true, durationMs: 1 };
    },
  };
}

function failStep(name: string, trace: string[]): Step {
  return {
    name,
    run: async () => {
      trace.push(name);
      return { ok: false, detail: 'forced', durationMs: 1 };
    },
  };
}

function timeoutStep(name: string, trace: string[]): Step {
  return {
    name,
    run: async () => {
      trace.push(name);
      return { ok: false, timedOut: true, detail: 'timeout', durationMs: 5000 };
    },
  };
}

function throwingStep(name: string, trace: string[]): Step {
  return {
    name,
    run: async () => {
      trace.push(name);
      throw new Error('boom');
    },
  };
}

function collectEvents(runner: ScenarioRunner): RunnerEvent[] {
  const events: RunnerEvent[] = [];
  runner.on('event', (ev: RunnerEvent) => events.push(ev));
  return events;
}

describe('ScenarioRunner', () => {
  it('walks phases in order when every step succeeds', async () => {
    const trace: string[] = [];
    const scenario: Scenario = {
      id: 'happy',
      description: 'all phases ok',
      setup: [okStep('s1', trace)],
      arrange: [okStep('a1', trace), okStep('a2', trace)],
      act: [okStep('act1', trace)],
      verify: [okStep('v1', trace)],
      teardown: [okStep('t1', trace)],
    };

    const runner = new ScenarioRunner(new FakeTransport());
    const events = collectEvents(runner);

    const result = await runner.run(scenario);

    expect(result.ok).toBe(true);
    expect(trace).toEqual(['s1', 'a1', 'a2', 'act1', 'v1', 't1']);
    expect(events.at(-1)).toEqual({ kind: 'scenarioDone', ok: true });
    expect(events.filter((e) => e.kind === 'stepOk')).toHaveLength(6);
  });

  it('short-circuits remaining phases on failure but still runs teardown', async () => {
    const trace: string[] = [];
    const scenario: Scenario = {
      id: 'fail-in-arrange',
      description: 'arrange fails',
      setup: [okStep('s1', trace)],
      arrange: [failStep('a-bad', trace), okStep('a-skipped', trace)],
      act: [okStep('act-skipped', trace)],
      verify: [okStep('verify-skipped', trace)],
      teardown: [okStep('t1', trace), okStep('t2', trace)],
    };

    const runner = new ScenarioRunner(new FakeTransport());
    const events = collectEvents(runner);

    const result = await runner.run(scenario);

    expect(result.ok).toBe(false);
    expect(trace).toEqual(['s1', 'a-bad', 't1', 't2']);
    expect(events.filter((e) => e.kind === 'stepFail')).toHaveLength(1);
    expect(events.at(-1)).toEqual({ kind: 'scenarioDone', ok: false });
  });

  it('treats a timeout as failure and emits stepTimeout', async () => {
    const trace: string[] = [];
    const scenario: Scenario = {
      id: 'timeout',
      description: 'act times out',
      act: [timeoutStep('act-slow', trace)],
      teardown: [okStep('t1', trace)],
    };

    const runner = new ScenarioRunner(new FakeTransport());
    const events = collectEvents(runner);

    const result = await runner.run(scenario);

    expect(result.ok).toBe(false);
    expect(trace).toEqual(['act-slow', 't1']);
    expect(events.some((e) => e.kind === 'stepTimeout' && e.step === 'act-slow')).toBe(true);
  });

  it('catches thrown errors and reports them as failures', async () => {
    const trace: string[] = [];
    const scenario: Scenario = {
      id: 'throwing',
      description: 'step throws',
      act: [throwingStep('act-throw', trace)],
      teardown: [okStep('t1', trace)],
    };

    const runner = new ScenarioRunner(new FakeTransport());
    const events = collectEvents(runner);

    const result = await runner.run(scenario);

    expect(result.ok).toBe(false);
    expect(trace).toEqual(['act-throw', 't1']);
    const failEv = events.find((e) => e.kind === 'stepFail');
    expect(failEv).toBeDefined();
    if (failEv && failEv.kind === 'stepFail') {
      expect(failEv.result.detail).toBe('boom');
    }
  });

  it('continues teardown even if a teardown step fails', async () => {
    const trace: string[] = [];
    const scenario: Scenario = {
      id: 'teardown-fail',
      description: 'teardown step fails',
      act: [okStep('act1', trace)],
      teardown: [failStep('t-bad', trace), okStep('t-good', trace)],
    };

    const runner = new ScenarioRunner(new FakeTransport());
    const events = collectEvents(runner);

    const result = await runner.run(scenario);

    expect(result.ok).toBe(false);
    expect(trace).toEqual(['act1', 't-bad', 't-good']);
    expect(
      events.filter((e) => e.kind === 'stepFail').map((e) => e.kind === 'stepFail' && e.step),
    ).toEqual(['t-bad']);
  });

  it('forwards transport tx and rx as txBytes / rxBytes events', async () => {
    const transport = new FakeTransport();
    const runner = new ScenarioRunner(transport);
    const events = collectEvents(runner);

    const scenario: Scenario = {
      id: 'io',
      description: 'writes and reads',
      act: [
        {
          name: 'write-and-read',
          run: async (ctx) => {
            await ctx.transport.write('hello\n');
            (ctx.transport as FakeTransport).emitLine('world');
            return { ok: true, durationMs: 1 };
          },
        },
      ],
    };

    await runner.run(scenario);

    const tx = events.find((e) => e.kind === 'txBytes');
    const rx = events.find((e) => e.kind === 'rxBytes');
    expect(tx && tx.kind === 'txBytes' && tx.bytes).toBe('hello\n');
    expect(rx && rx.kind === 'rxBytes' && rx.bytes).toBe('world');
  });

  it('skips empty phases cleanly', async () => {
    const trace: string[] = [];
    const scenario: Scenario = {
      id: 'only-act',
      description: 'just an act phase',
      act: [okStep('only', trace)],
    };

    const runner = new ScenarioRunner(new FakeTransport());
    const result = await runner.run(scenario);

    expect(result.ok).toBe(true);
    expect(trace).toEqual(['only']);
  });
});
