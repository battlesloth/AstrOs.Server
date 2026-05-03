// FlashJobOrchestrator runtime (c.6c.1).
//
// This module currently exposes:
//   * `resolveFlashSource` — bridges the typed `FlashRequest` HTTP body to
//     the orchestrator's `FlashSource` shape.
//   * `createFlashProgressThrottle` — per-controller leading-edge throttle
//     that caps `flashControllerUpdate` WS emissions at one per `windowMs`
//     per controller, with a `force=true` bypass for stage transitions.
//
// Task 6 (orchestrator class) extends this same file — keep additions
// colocated so the orchestrator's HTTP-to-runtime translation lives in
// one place.

import type { Clock, FlashRequest } from '../models/firmware/flash_orchestrator.js';
import type { ControllerFlashState, FlashSource } from '../models/firmware/flash_job_state.js';
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

// ---------------------------------------------------------------------------
// flashProgressThrottle — per-controller leading-edge rate limiter for
// `flashControllerUpdate` WS emissions.
//
// Mid-stage progress (e.g., bytesSent advancing during UploadingToMaster)
// can fire at hundreds of Hz when the streamer is in the inner ack loop.
// The orchestrator coalesces those into ≤4 emits/sec per controller by
// passing `force=false`. Stage-boundary transitions (Queued→…→
// VersionConfirmed/Failed) pass `force=true` so no terminal/transition
// state is dropped.
//
// Semantics (per controllerId):
//   * Leading edge: first submit fires immediately and stamps
//     `lastEmittedAt`.
//   * Within window (`force=false`): the latest state is stashed in
//     `pending` and a single flush timer is armed for the remainder of
//     the window. Subsequent in-window submits overwrite `pending`
//     without re-arming.
//   * Force: flushes any pending entry by emitting the new state
//     immediately and resets `lastEmittedAt`. The next in-window submit
//     will be throttled.
//   * Dispose: clears all internal state and cancels every scheduled
//     timer. Safe to call multiple times (idempotent).
// ---------------------------------------------------------------------------

export interface FlashProgressThrottle {
  submit(controllerId: string, state: ControllerFlashState, force?: boolean): void;
  dispose(): void;
}

export function createFlashProgressThrottle(opts: {
  emit: (state: ControllerFlashState) => void;
  windowMs: number;
  clock: Clock;
}): FlashProgressThrottle {
  const { emit, windowMs, clock } = opts;
  const lastEmittedAt = new Map<string, number>();
  const pending = new Map<string, ControllerFlashState>();
  const scheduledTimer = new Map<string, NodeJS.Timeout>();

  function flush(controllerId: string): void {
    const state = pending.get(controllerId);
    scheduledTimer.delete(controllerId);
    if (state === undefined) return;
    pending.delete(controllerId);
    emit(state);
    lastEmittedAt.set(controllerId, clock.now());
  }

  return {
    submit(controllerId, state, force = false) {
      if (force) {
        // Cancel any pending flush — the forced state supersedes it.
        const t = scheduledTimer.get(controllerId);
        if (t !== undefined) {
          clock.clearTimeout(t);
          scheduledTimer.delete(controllerId);
        }
        pending.delete(controllerId);
        emit(state);
        lastEmittedAt.set(controllerId, clock.now());
        return;
      }

      const last = lastEmittedAt.get(controllerId) ?? Number.NEGATIVE_INFINITY;
      const elapsed = clock.now() - last;
      if (elapsed >= windowMs) {
        emit(state);
        lastEmittedAt.set(controllerId, clock.now());
        return;
      }

      // Within the window: stash and (idempotently) arm a flush timer.
      pending.set(controllerId, state);
      if (scheduledTimer.has(controllerId)) return;
      const remaining = Math.max(0, last + windowMs - clock.now());
      const t = clock.setTimeout(() => flush(controllerId), remaining);
      scheduledTimer.set(controllerId, t);
    },

    dispose() {
      for (const t of scheduledTimer.values()) {
        clock.clearTimeout(t);
      }
      scheduledTimer.clear();
      pending.clear();
      lastEmittedAt.clear();
    },
  };
}
