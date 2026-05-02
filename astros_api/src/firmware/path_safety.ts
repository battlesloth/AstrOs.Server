// Allowlist for strings interpolated into firmware-module filenames.
// First char alphanumeric (forbids leading-dot hidden files and
// leading-hyphen flag lookalikes); body allows the chars real semver and
// PlatformIO env names use — '.' for version dots, '-' for pre-release
// labels (1.2.0-RC.1), '+' for build metadata (1.0.0+build.123), '_' for
// variant underscores (lolin_d32_pro). Excludes path separators, drive
// letters, parent refs, embedded nulls. Upstream c.3 captures version as
// `(.+)` so this is the only guard for it; variant is defense-in-depth;
// uploadId is server-generated UUID v4 so always-passes by construction
// and the assertion guards future regressions.
export const PATH_SAFE_RE = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/;

export function assertPathSafe(value: string, kind: string): void {
  if (!PATH_SAFE_RE.test(value)) {
    throw new Error(
      `Invalid firmware ${kind} for cache path: ${JSON.stringify(value)} contains characters that aren't filename-safe`,
    );
  }
}
