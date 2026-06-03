// Semver tag comparison for the Firmware view's release picker and downgrade
// guard. Differs from `astros_api/src/utility/semver.ts` (compareVersions),
// which deliberately ignores pre-release suffixes — the firmware-version
// gate there shouldn't penalize dev builds. The view here MUST distinguish
// `v1.4.3-rc.1` from `v1.4.3` so the dropdown can label pre-releases and
// the downgrade check is correct.

const VERSION_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/;

interface ParsedVersion {
  core: [number, number, number];
  prerelease: string[] | null;
}

function parseVersion(tag: string): ParsedVersion | null {
  const match = tag.match(VERSION_RE);
  if (!match) return null;
  const [, maj, min, pat, pre] = match;
  return {
    core: [Number(maj), Number(min), Number(pat)],
    prerelease: pre ? pre.split('.') : null,
  };
}

const NUMERIC_RE = /^\d+$/;

function compareIdentifier(a: string, b: string): number {
  const aNumeric = NUMERIC_RE.test(a);
  const bNumeric = NUMERIC_RE.test(b);
  if (aNumeric && bNumeric) return Number(a) - Number(b);
  // semver §11.4.3: numeric identifiers always have lower precedence than
  // alphanumeric ones.
  if (aNumeric) return -1;
  if (bNumeric) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Compare two semver-ish tags. Returns a negative number if a < b, 0 if
 * equal, a positive number if a > b, or NaN if either tag is malformed.
 *
 * Pre-release ordering follows semver.org §11: a version without a
 * pre-release has higher precedence than the same version with one
 * (`v1.4.3 > v1.4.3-rc.1`); pre-release identifiers are then compared
 * dot-by-dot per §11.4.
 *
 * Callers using comparison operators on the return value (e.g.
 * `compareTags(current, target) > 0` as a downgrade guard) should note
 * that NaN comparisons always evaluate false — a malformed `current` will
 * silently pass any `> 0` / `< 0` check. If malformed input must fail
 * closed instead, check `Number.isNaN(...)` first.
 */
export function compareTags(a: string, b: string): number {
  const A = parseVersion(a);
  const B = parseVersion(b);
  if (!A || !B) return Number.NaN;

  const [aMaj, aMin, aPat] = A.core;
  const [bMaj, bMin, bPat] = B.core;
  if (aMaj !== bMaj) return aMaj - bMaj;
  if (aMin !== bMin) return aMin - bMin;
  if (aPat !== bPat) return aPat - bPat;

  if (A.prerelease === null && B.prerelease === null) return 0;
  if (A.prerelease === null) return 1;
  if (B.prerelease === null) return -1;

  for (let i = 0; i < Math.max(A.prerelease.length, B.prerelease.length); i++) {
    const x = A.prerelease[i];
    const y = B.prerelease[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const cmp = compareIdentifier(x, y);
    if (cmp !== 0) return cmp;
  }
  return 0;
}
