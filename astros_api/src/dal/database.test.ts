import { describe, expect, it } from 'vitest';
import appdata from 'appdata-path';
import { resolveDatabaseDir } from './database.js';

describe('resolveDatabaseDir', () => {
  const defaultDir = appdata('astrosserver');

  it('falls back to appdata when env is undefined', () => {
    expect(resolveDatabaseDir(undefined)).toBe(defaultDir);
  });

  it('falls back to appdata when env is empty string', () => {
    expect(resolveDatabaseDir('')).toBe(defaultDir);
  });

  it('falls back to appdata for %AppData% sentinel', () => {
    expect(resolveDatabaseDir('%AppData%')).toBe(defaultDir);
  });

  it('falls back to appdata for lowercase %appdata%', () => {
    expect(resolveDatabaseDir('%appdata%')).toBe(defaultDir);
  });

  it('falls back to appdata for uppercase %APPDATA%', () => {
    expect(resolveDatabaseDir('%APPDATA%')).toBe(defaultDir);
  });

  it('returns the env value verbatim for a custom path', () => {
    expect(resolveDatabaseDir('/var/lib/astros')).toBe('/var/lib/astros');
  });
});
