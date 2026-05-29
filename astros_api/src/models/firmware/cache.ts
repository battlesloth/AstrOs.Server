// On-disk firmware cache shapes. See the c.4 plan for context.

// Persisted as `<assetname>.meta.json` next to each cached binary.
export interface CachedAssetMeta {
  tag: string;
  version: string;
  variant: string;
  // Operator inspection only — NOT used for eviction, since this shifts
  // on re-download and would destabilize the sort across restarts.
  downloadedAt: string;
  // Eviction tiebreak when two entries compare equal under
  // `compareVersions` (e.g. `1.2.0` vs `1.2.0-RC.1`, which the semver
  // helper treats as equal because pre-release suffixes are stripped).
  publishedAt: string;
  sourceUrl: string;
  sizeBytes: number;
}

export interface CachedAsset {
  path: string;
  sha256: string;
  sizeBytes: number;
  meta: CachedAssetMeta;
}
