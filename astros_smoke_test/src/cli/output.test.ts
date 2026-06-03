import { describe, it, expect } from 'vitest';
import type { RunnerEvent } from '../core/runner.js';
import { formatJsonLine, formatPlainLine } from './output.js';

describe('formatPlainLine', () => {
  it('renders stepOk with phase, name, status, id, and duration', () => {
    const ev: RunnerEvent = {
      kind: 'stepOk',
      phase: 'arrange',
      step: 'registrationSync',
      result: { ok: true, messageId: 'abcdefgh-1234', durationMs: 12 },
    };
    const line = formatPlainLine(ev);
    expect(line).toMatch(/\[arrange\]/);
    expect(line).toMatch(/registrationSync/);
    expect(line).toMatch(/ok/);
    expect(line).toMatch(/msg=abcdefgh/);
    expect(line).toMatch(/12ms/);
  });

  it('renders stepFail with detail tail', () => {
    const ev: RunnerEvent = {
      kind: 'stepFail',
      phase: 'act',
      step: 'runScript',
      result: { ok: false, detail: 'boom', durationMs: 7 },
    };
    const line = formatPlainLine(ev);
    expect(line).toMatch(/fail/);
    expect(line).toMatch(/boom/);
  });

  it('renders stepTimeout with timeout marker', () => {
    const ev: RunnerEvent = {
      kind: 'stepTimeout',
      phase: 'arrange',
      step: 'deployConfig',
      result: { ok: false, timedOut: true, detail: 'No ACK', durationMs: 5000 },
    };
    expect(formatPlainLine(ev)).toMatch(/timeout/);
  });

  it('returns null for suppressed kinds (start/tx/rx)', () => {
    expect(formatPlainLine({ kind: 'stepStart', phase: 'act', step: 's' })).toBeNull();
    expect(formatPlainLine({ kind: 'txBytes', bytes: 'hello' })).toBeNull();
    expect(formatPlainLine({ kind: 'rxBytes', bytes: 'world' })).toBeNull();
  });

  it('renders scenarioDone with outcome', () => {
    expect(formatPlainLine({ kind: 'scenarioDone', ok: true })).toContain('OK');
    expect(formatPlainLine({ kind: 'scenarioDone', ok: false })).toContain('FAIL');
  });
});

describe('formatJsonLine', () => {
  it('emits parseable JSON per event', () => {
    const ev: RunnerEvent = { kind: 'txBytes', bytes: 'hi' };
    const line = formatJsonLine(ev);
    expect(JSON.parse(line)).toEqual(ev);
  });
});
