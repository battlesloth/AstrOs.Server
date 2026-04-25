import { describe, it, expect } from 'vitest';
import { FakeTransport } from '../transport.js';
import {
  buildBenchConfigSync,
  buildMasterControlModule,
  buildPadawanControlModule,
} from '../fixtures/demo-location.js';
import { getScenarioFactory, listScenarioIds, scenarios, type SessionContext } from './index.js';

function makeSession(): SessionContext {
  const transport = new FakeTransport();
  const padawan = buildPadawanControlModule('aa:bb:cc:dd:ee:ff');
  return {
    transport,
    configSync: buildBenchConfigSync({ padawanAddress: padawan.address }),
    master: buildMasterControlModule(),
    padawan,
  };
}

describe('scenario registry', () => {
  it('exposes all eight scenarios by id', () => {
    expect(listScenarioIds().sort()).toEqual(
      [
        'sync-only',
        'format-and-sync',
        'config-only',
        'full-happy-path',
        'direct-command-sweep',
        'servo-test-sweep',
        'panic-drill',
        'heads-curious-duet',
      ].sort(),
    );
  });

  it('throws on unknown ids', () => {
    expect(() => getScenarioFactory('nope')).toThrow(/Unknown scenario/);
  });

  it('tags scenarios with the right severity', () => {
    const session = makeSession();
    const bySeverity = (level: 'safe' | 'caution' | 'destructive') =>
      Object.values(scenarios)
        .map((f) => f(session))
        .filter((s) => (s.severity ?? 'safe') === level)
        .map((s) => s.id)
        .sort();

    expect(bySeverity('destructive')).toEqual(['format-and-sync', 'full-happy-path'].sort());
    expect(bySeverity('caution')).toEqual(
      ['panic-drill', 'servo-test-sweep', 'heads-curious-duet'].sort(),
    );
    expect(bySeverity('safe')).toEqual(['config-only', 'direct-command-sweep', 'sync-only'].sort());
  });
});

describe('scenario composition', () => {
  const session = makeSession();

  it('sync-only is act-only with a single registrationSync step', () => {
    const s = scenarios['sync-only'](session);
    expect(s.setup ?? []).toHaveLength(0);
    expect(s.act).toEqual([expect.objectContaining({ name: 'registrationSync' })]);
    expect(s.teardown ?? []).toHaveLength(0);
  });

  it('full-happy-path walks format → sync → deployConfig → deployScript → run → panic', () => {
    const s = scenarios['full-happy-path'](session);
    expect(s.setup?.map((x) => x.name)).toEqual(['formatSd']);
    expect(s.arrange?.map((x) => x.name)).toEqual([
      'registrationSync',
      'deployConfig',
      'deployScript',
    ]);
    expect(s.act?.map((x) => x.name)).toEqual(['runScript', 'let-servo-move']);
    expect(s.teardown?.map((x) => x.name)).toEqual(['panicStop']);
  });

  it('panic-drill runs long-runner then panics during execution', () => {
    const s = scenarios['panic-drill'](session);
    expect(s.arrange?.map((x) => x.name)).toEqual([
      'registrationSync',
      'deployConfig',
      'deployScript',
    ]);
    expect(s.act?.map((x) => x.name)).toEqual(['runScript', 'let-it-run', 'panicStop']);
  });

  it('direct-command-sweep fires four RUN_COMMAND ops interleaved with waits', () => {
    const s = scenarios['direct-command-sweep'](session);
    const names = s.act?.map((x) => x.name) ?? [];
    const directCmds = names.filter((n) => n === 'directCommand');
    expect(directCmds).toHaveLength(4);
  });

  it('servo-test-sweep hits three positions separated by hold windows', () => {
    const s = scenarios['servo-test-sweep'](session);
    const names = s.act?.map((x) => x.name) ?? [];
    expect(names.filter((n) => n === 'servoTest')).toHaveLength(3);
    expect(names.filter((n) => n.startsWith('hold'))).toHaveLength(2);
  });

  it('heads-curious-duet has the standard single-script shape', () => {
    const s = scenarios['heads-curious-duet'](session);
    expect(s.arrange?.map((x) => x.name)).toEqual([
      'registrationSync',
      'deployConfig',
      'deployScript',
    ]);
    expect(s.act?.map((x) => x.name)).toEqual(['runScript', 'let-script-play']);
  });
});
