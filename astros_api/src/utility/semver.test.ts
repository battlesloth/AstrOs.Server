import { describe, expect, it } from 'vitest';
import { compareVersions, meetsMinimum } from './semver.js';

describe('compareVersions', () => {
  it('returns 0 for equal versions', () => {
    expect(compareVersions('1.2.0', '1.2.0')).toBe(0);
  });

  it('returns negative when a < b on patch', () => {
    expect(compareVersions('1.1.9', '1.2.0')).toBeLessThan(0);
  });

  it('returns positive when a > b on minor', () => {
    expect(compareVersions('1.10.0', '1.2.0')).toBeGreaterThan(0);
  });

  it('compares minor numerically, not lexically', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
  });

  it('returns positive when a > b on major', () => {
    expect(compareVersions('2.0.0', '1.99.99')).toBeGreaterThan(0);
  });

  it('treats prerelease suffix as equivalent to base', () => {
    expect(compareVersions('1.2.0-dev.102', '1.2.0')).toBe(0);
    expect(compareVersions('1.2.0-RC.3', '1.2.0')).toBe(0);
  });

  it('returns NaN for malformed input', () => {
    expect(compareVersions('abc', '1.2.0')).toBeNaN();
    expect(compareVersions('1.2', '1.2.0')).toBeNaN();
    expect(compareVersions('', '1.2.0')).toBeNaN();
  });
});

describe('meetsMinimum', () => {
  it('returns true when actual equals minimum', () => {
    expect(meetsMinimum('1.2.0', '1.2.0')).toBe(true);
  });

  it('returns true when actual is above minimum', () => {
    expect(meetsMinimum('1.10.0', '1.2.0')).toBe(true);
    expect(meetsMinimum('2.0.0', '1.2.0')).toBe(true);
  });

  it('returns false when actual is below minimum', () => {
    expect(meetsMinimum('1.1.9', '1.2.0')).toBe(false);
    expect(meetsMinimum('0.9.0', '1.2.0')).toBe(false);
  });

  it('accepts dev/RC builds of the minimum version', () => {
    // Critical: local firmware builds report "1.2.0-dev.N"; they should
    // count as meeting a minimum of "1.2.0".
    expect(meetsMinimum('1.2.0-dev.102', '1.2.0')).toBe(true);
    expect(meetsMinimum('1.2.0-RC.3', '1.2.0')).toBe(true);
  });

  it('rejects undefined / empty / malformed actual', () => {
    expect(meetsMinimum(undefined, '1.2.0')).toBe(false);
    expect(meetsMinimum('', '1.2.0')).toBe(false);
    expect(meetsMinimum('abc', '1.2.0')).toBe(false);
    expect(meetsMinimum('1.2', '1.2.0')).toBe(false);
  });
});
