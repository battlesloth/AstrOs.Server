// FlashJobOrchestrator runtime (c.6c.1).
//
// Currently this module exposes a single pure helper, `resolveFlashSource`,
// which bridges the typed `FlashRequest` HTTP body to the orchestrator's
// `FlashSource` shape. Tasks 5 (progress throttle) and 6 (orchestrator class)
// extend this same file — keep additions colocated so the orchestrator's
// HTTP-to-runtime translation lives in one place.

import type { FlashRequest } from '../models/firmware/flash_orchestrator.js';
import type { FlashSource } from '../models/firmware/flash_job_state.js';
import type { AssetInfo, ReleaseInfo, ReleaseListResult } from '../models/firmware/release.js';
import type { CachedAsset } from '../models/firmware/cache.js';
import type { StoredUpload } from '../models/firmware/upload.js';

/**
 * Resolves a typed `FlashRequest` to a `FlashSource` ready for the streamer.
 *
 * For `kind: 'github'`, looks up the matching release + variant-specific
 * asset and returns the cached binary's hash/size/version. The release match
 * accepts EITHER `tag` (e.g., `'v1.4.0'`) or `version` (e.g., `'1.4.0'`)
 * because operators may submit either form — `github_release_service`
 * surfaces both alongside each release.
 *
 * For `kind: 'upload'`, returns the latest stored upload as-is. The upload
 * path deliberately does NOT validate variant: the operator chose a single
 * binary for the controllers they're flashing, and matching it to hardware
 * is their responsibility. The orchestrator's upstream variant-uniformity
 * check still ensures all targets share a variant — they just don't have to
 * align with anything in the upload's metadata.
 *
 * Errors are thrown as plain `Error` with greppable codes; the orchestrator
 * (Task 11) catches them at the job boundary and maps to typed
 * `flashJobFailed { reason }` events.
 *
 * @param variant Controllers' validated-uniform variant. Required for the
 *                github path; ignored for upload.
 */
export async function resolveFlashSource(
  request: FlashRequest,
  cache: { fetch(release: ReleaseInfo, asset: AssetInfo): Promise<CachedAsset> },
  upload: { latest(): Promise<StoredUpload | null> },
  releaseService: { getReleases(): Promise<ReleaseListResult> },
  variant: string,
): Promise<FlashSource> {
  if (request.source.kind === 'github') {
    const requested = request.source.version;
    const { releases } = await releaseService.getReleases();
    // Accept either `tag` ('v1.4.0') or `version` ('1.4.0') so operators
    // aren't forced to know which form the system is using internally.
    const release = releases.find((r) => r.tag === requested || r.version === requested);
    if (!release) throw new Error('release_not_found');
    const asset = release.assets.find((a) => a.variant === variant);
    if (!asset) throw new Error('asset_not_found');
    const cached = await cache.fetch(release, asset);
    return {
      kind: 'github',
      version: cached.meta.version,
      sha256: cached.sha256,
      sizeBytes: cached.sizeBytes,
      displayName: `astros-esp ${cached.meta.version} (${variant})`,
    };
  }

  // kind === 'upload'
  const stored = await upload.latest();
  if (stored === null) throw new Error('no_upload');
  return {
    kind: 'upload',
    version: stored.meta.version,
    sha256: stored.sha256,
    sizeBytes: stored.sizeBytes,
    displayName: stored.meta.originalFilename,
  };
}
