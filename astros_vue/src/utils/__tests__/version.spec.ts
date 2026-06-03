import { describe, expect, it } from 'vitest';
import { compareTags } from '@/utils/version';

describe('compareTags', () => {
  it('treats two identical tags as equal', () => {
    expect(compareTags('v1.4.0', 'v1.4.0')).toBe(0);
  });

  it('strips a leading v before comparing', () => {
    expect(compareTags('1.4.0', 'v1.4.0')).toBe(0);
    expect(compareTags('v1.4.0', '1.4.0')).toBe(0);
  });

  it('orders by major version', () => {
    expect(compareTags('v2.0.0', 'v1.99.99')).toBeGreaterThan(0);
    expect(compareTags('v1.0.0', 'v2.0.0')).toBeLessThan(0);
  });

  it('orders by minor version when major matches', () => {
    expect(compareTags('v1.5.0', 'v1.4.99')).toBeGreaterThan(0);
    expect(compareTags('v1.4.0', 'v1.5.0')).toBeLessThan(0);
  });

  it('orders by patch version when major and minor match', () => {
    expect(compareTags('v1.4.10', 'v1.4.9')).toBeGreaterThan(0);
    expect(compareTags('v1.4.0', 'v1.4.1')).toBeLessThan(0);
  });

  it('compares numeric segments numerically (not lexicographically)', () => {
    expect(compareTags('v1.10.0', 'v1.9.0')).toBeGreaterThan(0);
    expect(compareTags('v1.4.10', 'v1.4.2')).toBeGreaterThan(0);
  });

  it('treats a prerelease as lower precedence than the associated normal release', () => {
    // semver.org §11.3
    expect(compareTags('v1.4.3-rc.1', 'v1.4.3')).toBeLessThan(0);
    expect(compareTags('v1.4.3', 'v1.4.3-rc.1')).toBeGreaterThan(0);
  });

  it('compares prerelease identifiers dot-by-dot, numerically when both numeric', () => {
    expect(compareTags('v1.4.3-rc.10', 'v1.4.3-rc.2')).toBeGreaterThan(0);
    expect(compareTags('v1.4.3-rc.1', 'v1.4.3-rc.2')).toBeLessThan(0);
  });

  it('compares prerelease identifiers lexicographically when both alphanumeric', () => {
    expect(compareTags('v1.4.3-beta', 'v1.4.3-alpha')).toBeGreaterThan(0);
    expect(compareTags('v1.4.3-alpha', 'v1.4.3-beta')).toBeLessThan(0);
  });

  it('treats a numeric prerelease identifier as lower precedence than alphanumeric (§11.4.3)', () => {
    expect(compareTags('v1.4.3-1', 'v1.4.3-alpha')).toBeLessThan(0);
    expect(compareTags('v1.4.3-alpha', 'v1.4.3-1')).toBeGreaterThan(0);
  });

  it('applies §11.4.3 dot-by-dot when earlier prerelease identifiers tie', () => {
    // Canonical spec example: alpha.beta > alpha.1 because at position 2,
    // beta is alphanumeric and 1 is numeric.
    expect(compareTags('v1.0.0-alpha.beta', 'v1.0.0-alpha.1')).toBeGreaterThan(0);
    expect(compareTags('v1.0.0-alpha.1', 'v1.0.0-alpha.beta')).toBeLessThan(0);
  });

  it('treats a shorter prerelease as less than a longer one with matching prefix (§11.4.4)', () => {
    expect(compareTags('v1.4.3-rc', 'v1.4.3-rc.1')).toBeLessThan(0);
    expect(compareTags('v1.4.3-rc.1', 'v1.4.3-rc')).toBeGreaterThan(0);
  });

  it('returns NaN for malformed tags so callers can distinguish unknown from equal', () => {
    expect(compareTags('garbage', 'v1.0.0')).toBeNaN();
    expect(compareTags('v1.0.0', 'not-a-version')).toBeNaN();
    expect(compareTags('v1', 'v1.0.0')).toBeNaN();
  });
});
