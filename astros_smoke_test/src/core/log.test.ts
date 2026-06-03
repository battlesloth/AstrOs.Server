import { describe, expect, it } from 'vitest';
import { parseDebugEnabled } from './log.js';

describe('parseDebugEnabled', () => {
  it('returns false for any namespace when SMOKE_LOG is unset', () => {
    const enabled = parseDebugEnabled(undefined);
    expect(enabled('transport')).toBe(false);
    expect(enabled('server')).toBe(false);
  });

  it('returns false for any namespace when SMOKE_LOG is empty or whitespace', () => {
    expect(parseDebugEnabled('')('transport')).toBe(false);
    expect(parseDebugEnabled('   ')('transport')).toBe(false);
  });

  it('returns true for every namespace when SMOKE_LOG is "*"', () => {
    const enabled = parseDebugEnabled('*');
    expect(enabled('transport')).toBe(true);
    expect(enabled('server')).toBe(true);
    expect(enabled('anything-at-all')).toBe(true);
  });

  it('returns true only for explicitly listed namespaces', () => {
    const enabled = parseDebugEnabled('transport,server');
    expect(enabled('transport')).toBe(true);
    expect(enabled('server')).toBe(true);
    expect(enabled('sse')).toBe(false);
    expect(enabled('state')).toBe(false);
  });

  it('trims whitespace around comma-separated entries', () => {
    const enabled = parseDebugEnabled(' transport , server ');
    expect(enabled('transport')).toBe(true);
    expect(enabled('server')).toBe(true);
  });

  it('ignores empty entries from trailing or duplicated commas', () => {
    const enabled = parseDebugEnabled('transport,,server,');
    expect(enabled('transport')).toBe(true);
    expect(enabled('server')).toBe(true);
    expect(enabled('')).toBe(false);
  });

  it('treats "*" mixed with other names as enable-all', () => {
    const enabled = parseDebugEnabled('transport,*');
    expect(enabled('anything')).toBe(true);
  });
});
