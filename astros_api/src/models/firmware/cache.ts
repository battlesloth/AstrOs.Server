// ---------------------------------------------------------------------------
// On-disk firmware cache shapes. The cache materializes selected -app.bin
// assets (from c.3's GitHub release listing) onto local disk during a flash
// job. Each cached binary has two sidecar files: a hex-digest .sha256 and a
// JSON .meta describing where it came from. See the c.4 plan for context.
// ---------------------------------------------------------------------------

// Persisted as `<assetname>.meta.json` next to each cached binary. Captures
// everything needed for eviction tiebreaks (publishedAt) and external
// inspection without re-parsing filenames.
export interface CachedAssetMeta {
  tag: string;
  version: string;
  variant: string;
  // ISO-8601 timestamp of when this entry was written to disk. Used as the
  // tie-breaker for eviction when two cached entries share a semver tag.
  downloadedAt: string;
  // GitHub release publish timestamp, threaded through from AssetInfo's
  // parent release. Primary tie-breaker for ties in semver sort. Stored
  // separately from downloadedAt because the latter shifts on re-download.
  publishedAt: string;
  sourceUrl: string;
  sizeBytes: number;
}

// Returned by FirmwareCache.lookup() and .fetch(). `path` is the absolute
// path to the .bin; `sha256` is the lowercase hex digest computed during
// the original streaming download.
export interface CachedAsset {
  path: string;
  sha256: string;
  sizeBytes: number;
  meta: CachedAssetMeta;
}
