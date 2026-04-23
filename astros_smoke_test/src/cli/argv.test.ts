import { describe, it, expect } from 'vitest';
import { parseArgv } from './argv.js';

describe('parseArgv', () => {
  it('returns help on no args', () => {
    expect(parseArgv([])).toMatchObject({ command: 'help', errors: [] });
  });

  it('returns help on --help', () => {
    expect(parseArgv(['--help'])).toMatchObject({ command: 'help' });
    expect(parseArgv(['-h'])).toMatchObject({ command: 'help' });
  });

  it('parses list command', () => {
    expect(parseArgv(['list'])).toMatchObject({ command: 'list' });
  });

  it('parses list with --json', () => {
    expect(parseArgv(['list', '--json'])).toMatchObject({ command: 'list', json: true });
  });

  it('parses a scenario id with default flags', () => {
    const result = parseArgv(['sync-only']);
    expect(result).toMatchObject({
      command: 'scenario',
      scenarioId: 'sync-only',
      confirm: false,
      json: false,
      errors: [],
    });
    expect(result.port).toBeUndefined();
    expect(result.baud).toBeUndefined();
  });

  it('accepts --confirm, --port, --baud, --json together', () => {
    expect(
      parseArgv(['full-happy-path', '--confirm', '--port', '/dev/ttyUSB0', '--baud', '115200', '--json']),
    ).toMatchObject({
      command: 'scenario',
      scenarioId: 'full-happy-path',
      confirm: true,
      json: true,
      port: '/dev/ttyUSB0',
      baud: 115200,
      errors: [],
    });
  });

  it('flags unknown arguments', () => {
    const result = parseArgv(['sync-only', '--wat']);
    expect(result.errors).toContain('Unknown argument: --wat');
  });

  it('requires a value after --port', () => {
    const result = parseArgv(['sync-only', '--port']);
    expect(result.errors.some((e) => e.includes('--port'))).toBe(true);
  });

  it('rejects non-numeric --baud', () => {
    const result = parseArgv(['sync-only', '--baud', 'nope']);
    expect(result.errors.some((e) => e.includes('--baud'))).toBe(true);
  });
});
