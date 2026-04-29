// Lightweight semver helpers for firmware-version gating.
//
// Dev builds of AstrOs.ESP firmware report versions like `1.2.0-dev.102`
// (see scripts/version_gen.py in the firmware repo). For our gating
// purposes we treat any pre-release suffix (-dev.N, -RC.N) as equivalent
// to the base x.y.z, so a developer running a fresh dev build of 1.2.0
// is not mis-reported as "firmware incompatible".

const BASE_VERSION = /^(\d+)\.(\d+)\.(\d+)/;

function parseBase(version: string): [number, number, number] | null {
  const match = version.match(BASE_VERSION);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function compareVersions(a: string, b: string): number {
  const pa = parseBase(a);
  const pb = parseBase(b);
  if (!pa || !pb) return Number.NaN;
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

export function meetsMinimum(actual: string | undefined, minimum: string): boolean {
  if (!actual) return false;
  const cmp = compareVersions(actual, minimum);
  if (Number.isNaN(cmp)) return false;
  return cmp >= 0;
}
