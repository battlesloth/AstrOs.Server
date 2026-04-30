// ---------------------------------------------------------------------------
// GitHub release shapes — internal "what we surface" types and the API DTO
// subset we parse. AstrOs.ESP CI produces one `-app.bin` per release per
// PlatformIO env; each release is therefore ReleaseInfo with one or more
// AssetInfo entries, one per variant. See the "Source acquisition" section of
// the decomposition plan for context.
// ---------------------------------------------------------------------------

// Surfaced per matched `-app.bin` asset on a release. Variant is the
// PlatformIO env name (e.g., "lolin_d32_pro", "metro_s3").
export interface AssetInfo {
  variant: string;
  version: string;
  assetName: string;
  assetUrl: string;
  sizeBytes: number;
}

// Surfaced per release that has at least one matching firmware asset.
// Releases with zero matched assets are filtered out at the service layer.
export interface ReleaseInfo {
  tag: string;
  version: string;
  publishedAt: string;
  // True when GitHub flagged the release as a pre-release (e.g., RC build).
  // Pre-releases are valid OTA targets — the UI flags them visually rather
  // than filtering them out. Drafts (a separate concept) ARE filtered.
  prerelease: boolean;
  assets: AssetInfo[];
}

// Top-level result of GitHubReleaseService.getReleases(). `staleSince` is
// null on a fresh fetch and the ISO timestamp of the cache entry's original
// fetch when the service is serving stale due to a downstream error.
export interface ReleaseListResult {
  releases: ReleaseInfo[];
  staleSince: string | null;
}

// ---------------------------------------------------------------------------
// GitHub API DTO subset. Only the fields we actually parse — everything else
// in the GitHub response is ignored. Reduces surface area for both type
// maintenance and test-fixture construction.
// ---------------------------------------------------------------------------

export interface GitHubAssetDto {
  name: string;
  browser_download_url: string;
  size: number;
  content_type: string;
}

export interface GitHubReleaseDto {
  tag_name: string;
  // Null for drafts and certain unpublished release states. Service filters
  // those out; downstream `ReleaseInfo.publishedAt` is therefore non-null.
  published_at: string | null;
  // True for unpublished drafts. Service filters those out so they don't
  // appear in the firmware UI's release dropdown.
  draft: boolean;
  // True for RC builds and other pre-releases. Surfaced unchanged to
  // ReleaseInfo.prerelease so the UI can flag them; not filtered.
  prerelease: boolean;
  assets: GitHubAssetDto[];
}
