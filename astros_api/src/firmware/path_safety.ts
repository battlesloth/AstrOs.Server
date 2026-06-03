// Allowlist for strings interpolated into firmware-module filenames.
// First char alphanumeric (forbids leading-dot hidden files and
// leading-hyphen flag lookalikes); body allows characters semver and
// PlatformIO env names use — `.` for dotted versions, `-` for
// pre-release labels (1.2.0-RC.1), `+` for build metadata, `_` for
// variant underscores. Excludes path separators, drive letters,
// parent refs, embedded nulls.
export const PATH_SAFE_RE = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/;

export function assertPathSafe(value: string, kind: string): void {
  if (!PATH_SAFE_RE.test(value)) {
    throw new Error(
      `Invalid firmware ${kind}: ${JSON.stringify(value)} contains characters that aren't filename-safe`,
    );
  }
}
