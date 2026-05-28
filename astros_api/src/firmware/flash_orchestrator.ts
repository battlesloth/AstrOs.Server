// FlashJobOrchestrator runtime (c.6c.1).
//
// This module exposes:
//   * `resolveFlashSource` — bridges the typed `FlashRequest` HTTP body to
//     the orchestrator's `FlashSource` shape (plus the on-disk source path
//     used to drive the streamer; the path is internal-only and does NOT
//     ride the operator-facing `FlashSource`).
//   * `createFlashProgressThrottle` — per-controller leading-edge throttle
//     that caps `flashControllerUpdate` WS emissions at one per `windowMs`
//     per controller, with a `force=true` bypass for stage transitions.
//   * `FlashJobOrchestrator` — single-flight job runner gated by `JobLock`.
//     Composes the resolver + streamer + deploy phase + reboot lifecycle
//     behind `start()` / `cancel()` / `notifyMasterHeartbeat()` /
//     `getCurrentJob()`.

import { v4 as uuid_v4 } from 'uuid';
import { logger } from '../logger.js';
import type {
  Clock,
  FlashRequest,
  FwDeployEvent,
  Streamer,
} from '../models/firmware/flash_orchestrator.js';
import type {
  ControllerFlashState,
  FlashJobState,
  FlashSource,
} from '../models/firmware/flash_job_state.js';
import {
  FwStage,
  type FwDeployBegin,
  type FwDeployDoneResult,
  type FwProgress,
} from '../models/firmware/firmware_messages.js';
import { deriveJobLifecycle, transitionControllerState } from './flash_job_state_machine.js';
import type {
  SerialBus,
  StreamObserver,
  TransferErrorCode,
  TransferSpec,
} from '../models/firmware/chunk_streamer.js';
import { TransferError, mintTransferId } from '../models/firmware/chunk_streamer.js';
import type { AssetInfo, ReleaseInfo, ReleaseListResult } from '../models/firmware/release.js';
import type { CachedAsset } from '../models/firmware/cache.js';
import type { StoredUpload } from '../models/firmware/upload.js';
import type { JobLock } from '../job_lock/job_lock.js';
import { TransmissionType } from '../models/enums.js';
import {
  buildLockStateResponse,
  type LockStateResponse,
} from '../models/networking/lock_responses.js';
import { ChunkStreamer } from './chunk_streamer.js';
import { MessageGenerator } from '../serial/message_generator.js';
import { SerialMessageType } from '../serial/serial_message.js';

// Result of resolving a `FlashRequest`. `source` is the operator-facing
// shape (carried into `flashJobStarted` and the HTTP response); `path` is
// the on-disk binary location consumed by `ChunkStreamer.run()`. Path is
// kept off `FlashSource` so it doesn't leak through the public WS / HTTP
// surfaces — only the orchestrator and streamer ever see it.
export interface ResolvedFlashSource {
  source: FlashSource;
  path: string;
}

/**
 * Resolves a typed `FlashRequest` to a {@link ResolvedFlashSource} ready for
 * the streamer.
 *
 * For `kind: 'github'`, looks up the matching release + variant-specific
 * asset and returns the cached binary's hash/size/version + on-disk path.
 * The release match accepts EITHER `tag` (e.g., `'v1.4.0'`) or `version`
 * (e.g., `'1.4.0'`) because operators may submit either form —
 * `github_release_service` surfaces both alongside each release.
 *
 * For `kind: 'upload'`, returns the latest stored upload as-is. The upload
 * path deliberately does NOT validate variant: the operator chose a single
 * binary for the controllers they're flashing, and matching it to hardware
 * is their responsibility. The orchestrator's upstream variant-uniformity
 * check still ensures all targets share a variant — they just don't have to
 * align with anything in the upload's metadata.
 *
 * Errors are thrown as a typed internal `FlashSourceLookupError` carrying
 * the matching `FlashOrchestratorErrorReason`; the orchestrator's catch
 * site unwraps via `mapResolveError` to surface them as `flashJobFailed`
 * events. Public callers see only `FlashOrchestratorError` (the
 * intermediate is module-private).
 *
 * @param variant Controllers' validated-uniform variant. Required for the
 *                github path; ignored for upload.
 */
export async function resolveFlashSource(
  // Narrowed from `FlashRequest` to the source-only shape this function
  // actually reads — the per-controller selection list is irrelevant to
  // binary resolution and full `FlashRequest` would force test callers to
  // construct a controllers array they don't need.
  request: Pick<FlashRequest, 'source'>,
  cache: { fetch(release: ReleaseInfo, asset: AssetInfo): Promise<CachedAsset> },
  upload: { latest(): Promise<StoredUpload | null> },
  releaseService: { getReleases(): Promise<ReleaseListResult> },
  variant: string,
): Promise<ResolvedFlashSource> {
  if (request.source.kind === 'github') {
    const requested = request.source.version;
    let listed: ReleaseListResult;
    try {
      listed = await releaseService.getReleases();
    } catch (err) {
      // Tag the rejection so the orchestrator's catch can route it to
      // `release_lookup_failed` (network / GitHub / sidecar I/O) without
      // clobbering it onto the generic `source_resolution_failed` bucket
      // that downstream `cache.fetch` rejections use.
      const detail = err instanceof Error ? err.message : String(err);
      throw new FlashSourceLookupError('release_lookup_failed', detail);
    }
    const releases = listed.releases;
    // Accept either `tag` ('v1.4.0') or `version` ('1.4.0') so operators
    // aren't forced to know which form the system is using internally.
    const release = releases.find((r) => r.tag === requested || r.version === requested);
    if (!release) throw new FlashSourceLookupError('release_not_found', requested);
    const asset = release.assets.find((a) => a.variant === variant);
    if (!asset) throw new FlashSourceLookupError('asset_not_found', variant);
    let cached: CachedAsset;
    try {
      cached = await cache.fetch(release, asset);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new FlashSourceLookupError('source_resolution_failed', detail);
    }
    return {
      source: {
        kind: 'github',
        version: cached.meta.version,
        sha256: cached.sha256,
        sizeBytes: cached.sizeBytes,
        displayName: `astros-esp ${cached.meta.version} (${variant})`,
      },
      path: cached.path,
    };
  }

  // kind === 'upload'
  let stored: StoredUpload | null;
  try {
    stored = await upload.latest();
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new FlashSourceLookupError('source_resolution_failed', detail);
  }
  if (stored === null) throw new FlashSourceLookupError('no_upload');
  return {
    source: {
      kind: 'upload',
      version: stored.meta.version,
      sha256: stored.sha256,
      sizeBytes: stored.sizeBytes,
      displayName: stored.meta.originalFilename,
    },
    path: stored.path,
  };
}

// Internal carrier for resolver errors. Holds the typed
// `FlashOrchestratorErrorReason` directly so the orchestrator's catch
// site can re-throw as a `FlashOrchestratorError` without re-parsing the
// message string. The class stays internal to this module — public callers
// see `FlashOrchestratorError`.
class FlashSourceLookupError extends Error {
  readonly reason:
    | 'release_lookup_failed'
    | 'release_not_found'
    | 'asset_not_found'
    | 'no_upload'
    | 'source_resolution_failed';
  readonly detail?: string;

  constructor(
    reason:
      | 'release_lookup_failed'
      | 'release_not_found'
      | 'asset_not_found'
      | 'no_upload'
      | 'source_resolution_failed',
    detail?: string,
  ) {
    super(detail ? `${reason}: ${detail}` : reason);
    this.name = 'FlashSourceLookupError';
    this.reason = reason;
    if (detail !== undefined) this.detail = detail;
  }
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
//   * Force: emits the supplied state immediately, dropping any pending
//     entry (the forced state supersedes it), and stamps
//     `lastEmittedAt`. The next in-window submit will be throttled.
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
      // Capture clock.now() once per submit. If the clock advanced between
      // reads, `elapsed` (computed earlier) and `remaining` (computed later)
      // could land on opposite sides of the window boundary, producing an
      // immediate flush via setTimeout(0) and an extra emission inside the
      // intended throttle window. Reading once keeps every branch's
      // elapsed/remaining/lastEmittedAt computation internally consistent.
      const now = clock.now();
      if (force) {
        // Cancel any pending flush — the forced state supersedes it.
        const t = scheduledTimer.get(controllerId);
        if (t !== undefined) {
          clock.clearTimeout(t);
          scheduledTimer.delete(controllerId);
        }
        pending.delete(controllerId);
        emit(state);
        lastEmittedAt.set(controllerId, now);
        return;
      }

      const last = lastEmittedAt.get(controllerId) ?? Number.NEGATIVE_INFINITY;
      const elapsed = now - last;
      if (elapsed >= windowMs) {
        emit(state);
        lastEmittedAt.set(controllerId, now);
        return;
      }

      // Within the window: stash and (idempotently) arm a flush timer.
      pending.set(controllerId, state);
      if (scheduledTimer.has(controllerId)) return;
      const remaining = Math.max(0, last + windowMs - now);
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

// ---------------------------------------------------------------------------
// FlashJobOrchestrator
// ---------------------------------------------------------------------------
//
// Single-flight orchestrator for OTA flash jobs. Composes:
//   * c.0 `JobLock` — synchronous boolean gate; only one flash at a time.
//   * c.6a `transitionControllerState` / `deriveJobLifecycle` —
//     per-controller FSM machinery.
//   * c.6b `ChunkStreamer` — chunked upload to the master ESP32. The
//     streamer's sliding-window machinery is exercised by its own tests,
//     but production wiring overrides `windowSize` to 1 (stop-and-wait)
//     via `DEFAULT_STREAMER_CONFIG` below — the current master+UART
//     deployment doesn't benefit from pipelining.
//   * c.4 `FirmwareCache` + c.5 `FirmwareUploadStore` (via `resolveFlashSource`)
//     — source binary acquisition.
//   * c.3 `GitHubReleaseService` — release/asset enumeration.
//
// All error paths funnel through `failJob`: it emits `flashJobFailed`,
// transitions non-terminal controllers to Failed, releases the lock, and
// (on streamer-rejection / cancel) stamps `abortReason`. `start()`'s
// sync catch and the background IIFE's catch share `routeStartFailure`
// for uniform routing; the only exception is `job_already_running`,
// thrown before the lock is held — the controller's catch surfaces it
// directly because there's nothing for `failJob` to release.

const DEFAULT_REBOOT_TIMEOUT_MS = 15_000;
const DEFAULT_THROTTLE_WINDOW_MS = 250;
// Phase C: covers worst-case master reboot (~5s) + SD remount (~3s) +
// first poll cycle (~2s) + ~10× safety margin. Per the Phase C firmware
// design Section 6 cross-repo coordination.
const DEFAULT_FINALIZE_TIMEOUT_MS = 90_000;

// Discriminated union of every shape the orchestrator broadcasts. Each
// `safeEmitWs` call site now structurally matches one arm, so a new event
// (or a payload change) requires updating the type — `updateClients(any)`
// no longer hides drift behind a generic envelope.
export interface FlashJobFailedData {
  jobId: string;
  endedAt: string;
  reason?: FlashOrchestratorErrorReason;
  detail?: string;
  abortReason?: string;
}

export type FlashOrchestratorWsMessage =
  | { type: TransmissionType.flashJobStarted; data: FlashJobState }
  | { type: TransmissionType.flashControllerUpdate; data: ControllerFlashState }
  | {
      type: TransmissionType.flashControllerResult;
      data: { jobId: string; controller: ControllerFlashState };
    }
  | { type: TransmissionType.flashJobDone; data: { jobId: string; endedAt: string } }
  | { type: TransmissionType.flashJobFailed; data: FlashJobFailedData }
  | LockStateResponse;

// Narrow interface around the controllers data store. The orchestrator only
// needs the per-target ID + variant tuple at flash time; the larger
// `ControllersRepository` surface stays out of the way.
//
// `variant` is `string | undefined` because the production POLL_ACK-fed
// cache inherits the optionality of `ControlModule.variant` — older
// firmware that doesn't report one leaves it undefined. The orchestrator's
// `validateControllers` normalizes (trim + treat undefined/null/whitespace
// as missing) and surfaces `'variant_unknown'` so the impl doesn't have
// to write coercion boilerplate at the cache boundary.
export interface FlashControllersStore {
  // Returns only entries whose MAC appears in `requestedIds`. Missing
  // MACs surface as `controllers_unknown` from the orchestrator. Empty /
  // empty-string entries are rejected upstream by the HTTP validator AND
  // the orchestrator boundary assert (defense-in-depth for callers that
  // bypass the HTTP layer).
  listFlashTargets(
    requestedIds: readonly string[],
  ): Promise<Array<{ id: string; variant: string | undefined }>>;
}

// Reasons surfaced as `FlashOrchestratorError.reason`. Three buckets:
//
//   * Pre-streamer validation + source resolution: `job_already_running`,
//     `no_controllers`, `controllers_unknown`, `variant_mismatch`,
//     `variant_unknown`, `release_not_found`, `asset_not_found`,
//     `no_upload`, `release_lookup_failed`, `source_resolution_failed`,
//     `controllers_lookup_failed`. These never set `currentJob` and the
//     `flashJobFailed` emit carries `{ reason, detail }` only.
//
//   * Streamer-rejection (bucket "B" in the spec): every c.6b
//     `TransferErrorCode` is passed through verbatim as the reason —
//     `aborted`, `begin_timeout`, `chunk_retry_exhausted`, `flash_full`,
//     `hash_mismatch`, etc. — plus `streamer_unknown_error` for non-
//     `TransferError` rejections out of `streamer.run`. The
//     `flashJobFailed` emit carries `{ reason, abortReason, detail }`
//     because per spec §"Error paths", the orchestrator stamps
//     `currentJob.abortReason = error.code` and the WS event mirrors that.
//
//   * Mid-deploy: `bus_send_failed`, `subscriber_attach_failed`,
//     `protocol_violation`. Same emit shape as the pre-streamer bucket
//     (`{ reason, detail }`) but with per-controller cleanup because we're
//     past `flashJobStarted`. `bus_send_failed` overlaps with the c.6b
//     `TransferErrorCode` of the same name — in both cases the cause is a
//     Worker-channel failure on the firmware send path; the consolidation
//     into one reason is intentional.
export type FlashOrchestratorErrorReason =
  | 'job_already_running'
  | 'no_controllers'
  | 'controllers_unknown'
  | 'variant_mismatch'
  | 'variant_unknown'
  | 'release_not_found'
  | 'asset_not_found'
  | 'no_upload'
  | 'release_lookup_failed'
  | 'source_resolution_failed'
  | 'controllers_lookup_failed'
  | 'subscriber_attach_failed'
  | 'protocol_violation'
  | 'streamer_unknown_error'
  | TransferErrorCode;

export class FlashOrchestratorError extends Error {
  readonly reason: FlashOrchestratorErrorReason;
  readonly detail?: string;
  // Only populated on `'job_already_running'` so the HTTP layer can echo
  // the existing job's id back to the operator (HTTP 409 body).
  readonly currentJobId?: string;

  constructor(reason: FlashOrchestratorErrorReason, detail?: string, currentJobId?: string) {
    super(detail ? `${reason}: ${detail}` : reason);
    this.name = 'FlashOrchestratorError';
    this.reason = reason;
    if (detail !== undefined) this.detail = detail;
    if (currentJobId !== undefined) this.currentJobId = currentJobId;
  }
}

export interface FlashJobOrchestratorOpts {
  bus: SerialBus;
  jobLock: JobLock;
  cache: { fetch(release: ReleaseInfo, asset: AssetInfo): Promise<CachedAsset> };
  upload: { latest(): Promise<StoredUpload | null> };
  releaseService: { getReleases(): Promise<ReleaseListResult> };
  controllersStore: FlashControllersStore;
  emitWs: (msg: FlashOrchestratorWsMessage) => void;
  // Test seam. Default returns a real `ChunkStreamer` so production wiring
  // doesn't need to know about the streamer factory.
  streamerFactory?: (opts: { bus: SerialBus }) => Streamer;
  clock?: Clock;
  config?: { rebootTimeoutMs?: number; throttleWindowMs?: number; finalizeTimeoutMs?: number };
}

// Default real-clock + real-streamer factories. Exported test-helper-style so
// the production wiring can use defaults via `new FlashJobOrchestrator({...})`
// without naming them.
const defaultClock: Clock = {
  now: () => Date.now(),
  setTimeout: (cb, ms) => globalThis.setTimeout(cb, ms),
  clearTimeout: (t) => globalThis.clearTimeout(t),
};

// Production streamer config. windowSize=2 lets the second chunk start
// transmitting while the master is still processing the first, which is
// necessary on this Pi↔master link: bench-measured cycle is ~485 ms with
// windowSize=2 vs ~1550 ms with windowSize=1, a 3× throughput win at
// ~8.4 KB/s. The fixed ~1 s per-chunk wire pause the Linux ftdi_sio
// driver imposes on each USB-OUT batch is hidden by the overlap.
// windowSize=1 was originally chosen because the master was thought to
// be CPU-bound; current instrumentation shows ~52 ms of master CPU per
// chunk (9× headroom vs the 480 ms wire fill), so the OUT_OF_ORDER NAK
// cascades that justified stop-and-wait don't materialize at this size.
// `ackTimeoutMs: 5_000` is ~5× the observed ~1 s round-trip; the
// 3-retry × 5 s = 15 s per-chunk budget plus the 10-min whole-transfer
// watchdog gives ~2× headroom. The streamer's sliding-window machinery
// is exercised against `TRANSPORT_DEFAULTS.windowSize=16` in its own tests.
export const DEFAULT_STREAMER_CONFIG = {
  windowSize: 2,
  ackTimeoutMs: 5_000,
  maxRetriesPerChunk: 3,
  transferTimeoutMs: 600_000,
} as const;

// Exported so a unit test can inspect the constructed streamer's config
// and catch a regression that drops the override (silently reverts to
// TRANSPORT_DEFAULTS).
export function defaultStreamerFactory(opts: { bus: SerialBus }): Streamer {
  return new ChunkStreamer({
    bus: opts.bus,
    config: { ...DEFAULT_STREAMER_CONFIG },
  });
}

export class FlashJobOrchestrator {
  private readonly bus: SerialBus;
  private readonly jobLock: JobLock;
  private readonly cache: FlashJobOrchestratorOpts['cache'];
  private readonly upload: FlashJobOrchestratorOpts['upload'];
  private readonly releaseService: FlashJobOrchestratorOpts['releaseService'];
  private readonly controllersStore: FlashControllersStore;
  private readonly emitWs: (msg: FlashOrchestratorWsMessage) => void;
  private readonly streamerFactory: (opts: { bus: SerialBus }) => Streamer;
  private readonly clock: Clock;
  // `rebootTimeoutMs` is the duration the reboot timer waits before
  // releasing the lock as a fallback when the master never heartbeats.
  // `throttleWindowMs` feeds the per-job `flashProgressThrottle` window.
  private readonly rebootTimeoutMs: number;
  private readonly throttleWindowMs: number;
  // Phase C: timeout for resolving FwStage.Finalizing rows after
  // FW_DEPLOY_DONE arrives with PENDING. Armed in handleDeployDone,
  // cleared by notifyMasterHeartbeat or by its own callback. Disposed
  // alongside rebootTimer in releaseLock.
  private readonly finalizeTimeoutMs: number;

  private currentJob: FlashJobState | null = null;
  // Deploy-phase resources owned beyond the synchronous span of `start()`.
  // The streamer-success branch sends FW_DEPLOY_BEGIN, subscribes to deploy
  // events, and returns from `start()` while the deploy phase runs
  // asynchronously through `handleDeployEvent`. Both fields are disposed on
  // every exit path: FW_DEPLOY_DONE drops the subscriber inline; the
  // canonical `releaseLock` helper disposes both idempotently for the
  // protocol_violation, reboot-timeout, heartbeat, and cancel paths.
  // A leaked subscriber would route a stale prior job's deploy events into
  // the next job; a leaked throttle would carry per-controller flush timers
  // across jobs.
  private deployUnsubscriber: (() => void) | null = null;
  private throttle: FlashProgressThrottle | null = null;
  // Post-deploy reboot timer. Armed when `handleDeployDone` lands and all
  // controllers are terminal (`deriveJobLifecycle === 'done'`); cleared by
  // either the heartbeat callback (primary path) or by the timer firing
  // (fallback path). `null` outside the post-deploy-pre-release window.
  // `notifyMasterHeartbeat` and the timer callback both use the field's
  // null-ness as the first-fire-wins guard so a heartbeat racing the timer
  // doesn't double-release the lock.
  private rebootTimer: NodeJS.Timeout | null = null;
  // Phase C: armed when FW_DEPLOY_DONE arrives with any PENDING
  // (Finalizing) rows. Fire callback transitions Finalizing rows to
  // Failed("post_reboot_timeout") and completes the job. First-fire-wins
  // shared with notifyMasterHeartbeat via the null check at both sites.
  private finalizeTimer: NodeJS.Timeout | null = null;
  // AbortController whose signal threads through `streamer.run`'s `opts.signal`.
  // Created at upload-phase entry, fired by `cancel()` during the upload
  // phase to reject the in-flight `streamer.run()` with TransferError 'aborted'
  // (path B in spec §"Error paths"). Discarded on every exit path; once the
  // streamer settles the controller is no longer load-bearing — `.abort()`
  // becomes a no-op — but we still null the field on release so a stale
  // reference can't leak across jobs.
  private abortController: AbortController | null = null;
  // Phase tracker for the cancel decision. Cancel during 'upload' fires the
  // AbortController + lets the streamer rejection path drive cleanup; cancel
  // during 'deploy' takes the inline cleanup path (dispose subscriber, fail
  // non-terminal controllers, emit flashJobFailed, release lock); cancel
  // during 'done' (post-flashJobDone, awaiting heartbeat or timer) is a no-op
  // because the work itself is complete — the lock release is already
  // queued via the timer or will fire via the next heartbeat. Cleared back
  // to `null` in `releaseLock`.
  private phase: 'upload' | 'deploy' | 'done' | null = null;
  // The background upload + deploy-arming work that `start()` spawns and
  // returns from without awaiting. Production callers MUST NOT await this —
  // the WS event surface (`flashJobStarted` → `flashControllerUpdate` →
  // `flashJobDone` / `flashJobFailed`) is the canonical truth source for
  // flash progress; awaiting this from the HTTP layer would reintroduce the
  // 7-minute block this refactor exists to prevent. Private + accessed only
  // via `awaitRunInProgressForTest()` so the contract is mechanically
  // enforced by TS rather than just commented. Cleared in `releaseLock` so a
  // finished job's resolved promise can't leak across job lifecycles.
  private runInProgress: Promise<void> | null = null;
  private readonly messageGenerator = new MessageGenerator();

  // Rotating uint8 transfer-id. Protocol-doc canonical (`uint8 transfer-id`
  // — see AstrOs.ESP `.docs/protocol.md` ESP-NOW section + every serial
  // field-layout entry). Single-slot semantics (JobLock prevents concurrent
  // transfers) means 256-deep collision-free history; a wrap-around would
  // only collide with an already-completed transfer, and the firmware's
  // BulkReceiver clears active state on transfer end. Resets to 0 on
  // server boot — no in-flight transfer survives restart anyway.
  private nextTransferId = 0;

  constructor(opts: FlashJobOrchestratorOpts) {
    this.bus = opts.bus;
    this.jobLock = opts.jobLock;
    this.cache = opts.cache;
    this.upload = opts.upload;
    this.releaseService = opts.releaseService;
    this.controllersStore = opts.controllersStore;
    this.emitWs = opts.emitWs;
    this.streamerFactory = opts.streamerFactory ?? defaultStreamerFactory;
    this.clock = opts.clock ?? defaultClock;
    this.rebootTimeoutMs = opts.config?.rebootTimeoutMs ?? DEFAULT_REBOOT_TIMEOUT_MS;
    this.throttleWindowMs = opts.config?.throttleWindowMs ?? DEFAULT_THROTTLE_WINDOW_MS;
    this.finalizeTimeoutMs = opts.config?.finalizeTimeoutMs ?? DEFAULT_FINALIZE_TIMEOUT_MS;
  }

  /**
   * Acquire `JobLock`, validate targets, resolve source, broadcast
   * `flashJobStarted`, then spawn the upload + deploy-arming work as a
   * fire-and-forget background promise and return immediately. The returned
   * promise resolves as soon as the sync setup completes (~1-10 s for the
   * source resolve + immediate I/O), NOT when the flash itself completes —
   * the HTTP layer gets `{ jobId, transferId, source, targets }` in the
   * response body and the operator's UI drives off the WS event surface
   * (`flashJobStarted` → `flashControllerUpdate` → `flashJobDone` /
   * `flashJobFailed`) for the rest. Awaiting this promise on the HTTP
   * caller path is what we explicitly do NOT want: a ~7-minute upload
   * would block the response far past any client timeout.
   *
   * Sync errors (lock-acquire conflict, controllers lookup failure, source
   * resolve failure) propagate to the HTTP caller as today — the outer
   * try/catch maps them to typed `FlashOrchestratorError` and the
   * controller's catch block maps THAT to the right HTTP status code.
   * Background errors (streamer rejection, deploy-begin bus_send_failed,
   * subscriber_attach_failed) route through `failJob` exactly the same
   * way the prior all-sync catch did, but emit on the WS surface only —
   * by the time they fire, HTTP has already responded 200.
   *
   * After all controllers reach a terminal stage, `handleDeployDone`
   * emits `flashJobDone` and arms the reboot-timer fallback; lock release
   * happens via `notifyMasterHeartbeat` (primary, post-deploy POLL_ACK)
   * or the timer (fallback for master malfunction).
   *
   * `this.runInProgress` exposes the background promise as a test seam.
   * Production code MUST NOT await it.
   */
  async start(request: FlashRequest): Promise<{
    jobId: string;
    transferId: string;
    source: FlashSource;
    targets: string[];
  }> {
    const jobId = uuid_v4();

    // Synchronous lock gate — concurrent `start()` calls are rejected before
    // any state is mutated. The lock owner is the new `jobId`; the existing
    // owner (when held) is echoed back as `currentJobId` so the HTTP layer
    // can build the 409 body.
    if (!this.jobLock.acquire(jobId)) {
      const existingOwner = this.jobLock.getOwner();
      throw new FlashOrchestratorError(
        'job_already_running',
        undefined,
        existingOwner ?? undefined,
      );
    }
    this.broadcastLockState();

    try {
      // Defense-in-depth — the type `string[]` admits what the HTTP
      // validator already rejects. Catches an internal caller that
      // bypasses the HTTP path before the DB round-trip.
      if (
        request.controllers.length === 0 ||
        !request.controllers.every((c) => typeof c === 'string' && c.length > 0)
      ) {
        throw new FlashOrchestratorError('no_controllers');
      }

      // Wrap the controllers-store lookup so a raw fs/db/etc throw surfaces as
      // a typed FlashOrchestratorError rather than bypassing the failJob emit
      // path. Mirrors the `mapResolveError` wrap on resolveFlashSource: any
      // upstream-data-access failure becomes a `controllers_lookup_failed`
      // event so WS consumers reliably see job rejection reasons.
      let targetsList: Array<{ id: string; variant: string | undefined }>;
      try {
        targetsList = await this.controllersStore.listFlashTargets(request.controllers);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        throw new FlashOrchestratorError('controllers_lookup_failed', detail);
      }
      // Surface the gap between requested-MACs and what the store actually
      // returned: a requested MAC missing here means the operator selected
      // a controller whose variant the server hasn't learned yet (cold
      // variantCache after restart, pre-c.6c.1 firmware, etc). Distinct
      // from `no_controllers` (which now correctly means "empty request").
      const foundIds = new Set(targetsList.map((t) => t.id));
      const missing = request.controllers.filter((id) => !foundIds.has(id));
      if (missing.length > 0) {
        throw new FlashOrchestratorError('controllers_unknown', missing.join(', '));
      }
      const variant = validateControllers(targetsList);

      let resolved: ResolvedFlashSource;
      try {
        resolved = await resolveFlashSource(
          request,
          this.cache,
          this.upload,
          this.releaseService,
          variant,
        );
      } catch (err) {
        throw mapResolveError(err);
      }

      const transferId = mintTransferId(this.nextTransferId);
      this.nextTransferId = (this.nextTransferId + 1) & 0xff;
      const targetIds = targetsList.map((c) => c.id);
      const startedAt = new Date(this.clock.now()).toISOString();
      const initialControllers: ControllerFlashState[] = targetIds.map((id) => ({
        controllerId: id,
        stage: FwStage.Queued,
        bytesSent: 0,
        totalBytes: resolved.source.sizeBytes,
        detail: '',
      }));
      this.currentJob = {
        jobId,
        source: resolved.source,
        controllers: initialControllers,
        startedAt,
      };
      this.safeEmitWs({
        type: TransmissionType.flashJobStarted,
        data: this.currentJob,
      });

      // Per-job progress throttle. Stage transitions emit via `force=true`
      // (bypass throttle); mid-stage bytesSent updates submit with
      // `force=false` so the streamer's high-frequency ack loop is
      // coalesced into ≤4 emits/sec per controller. Stored on `this` so the
      // deploy-phase event handler (runs past `start()`) and the
      // synchronous catch block can both reach it. Disposed on every exit
      // path; leaks would carry timers across jobs.
      this.throttle = createFlashProgressThrottle({
        emit: (state) =>
          this.safeEmitWs({ type: TransmissionType.flashControllerUpdate, data: state }),
        windowMs: this.throttleWindowMs,
        clock: this.clock,
      });
      const localThrottle = this.throttle;

      // Arm the AbortController + mark the upload phase before invoking the
      // streamer. `cancel()` reads `this.phase` to decide whether to fire the
      // controller (upload) vs run inline cleanup (deploy/done); the
      // AbortController itself is consumed by `streamer.run`'s `opts.signal`
      // — c.6b's streamer rejects with TransferError('aborted', ...) when
      // the signal fires.
      this.abortController = new AbortController();
      this.phase = 'upload';

      const streamer = this.streamerFactory({ bus: this.bus });
      const transferSpec: TransferSpec = {
        transferId,
        source: {
          path: resolved.path,
          sha256: resolved.source.sha256,
          sizeBytes: resolved.source.sizeBytes,
        },
        targets: targetIds,
      };
      const observer: StreamObserver = {
        onTransferBegun: () => {
          // Queued → UploadingToMaster for every controller. The streamer
          // uploads a single binary to the master, so all targets share
          // bytesSent/totalBytes — the per-controller emit just makes the
          // UI bookkeeping uniform with the deploy phase which
          // does have per-controller divergence.
          if (this.currentJob === null) return;
          const updated = this.currentJob.controllers.map((c) => {
            if (c.stage !== FwStage.Queued) return c;
            return transitionControllerState(c, FwStage.UploadingToMaster);
          });
          this.currentJob = { ...this.currentJob, controllers: updated };
          for (const c of updated) {
            localThrottle.submit(c.controllerId, c, true);
          }
        },
        onChunkAck: (_seq, bytesSent) => {
          if (this.currentJob === null) return;
          const updated = this.currentJob.controllers.map((c) => {
            if (c.stage !== FwStage.UploadingToMaster) return c;
            return transitionControllerState(c, FwStage.UploadingToMaster, { bytesSent });
          });
          this.currentJob = { ...this.currentJob, controllers: updated };
          for (const c of updated) {
            if (c.stage !== FwStage.UploadingToMaster) continue;
            localThrottle.submit(c.controllerId, c);
          }
        },
        onChunkNak: (lastGoodSeq, nextExpectedSeq, reason) => {
          // c.6b's streamer handles Go-Back-N retransmission internally.
          // The orchestrator observes the NAK for diagnostic logging only;
          // controller state is unchanged.
          logger.info(
            `flash orchestrator: onChunkNak lastGoodSeq=${lastGoodSeq} nextExpectedSeq=${nextExpectedSeq} reason=${reason}`,
          );
        },
        // onTransferEnd: the deploy phase is driven off the awaited
        // `streamer.run()` resolution below, not from this hook.
      };
      // Spawn upload + deploy-arming as a fire-and-forget background
      // promise so HTTP returns in ~1-10 s instead of waiting for the
      // upload (~7 min). The operator's UI tracks state via the WS event
      // surface. `this.runInProgress` is the test-only handle — see its
      // field docstring. The `signal` local lets TS see non-null inside
      // the IIFE without a `!` assertion; `cancel()` still uses
      // `this.abortController`.
      const signal = this.abortController.signal;
      this.runInProgress = (async () => {
        try {
          await streamer.run(transferSpec, observer, { signal });
          this.phase = 'deploy';

          // Deploy phase: transition controllers to Sending (force=true
          // flushes throttle state), send FW_DEPLOY_BEGIN, attach the
          // subscriber that drives the rest of the job via
          // `handleDeployEvent`. Lock release happens via
          // `notifyMasterHeartbeat` or the reboot-timer fallback.
          if (this.currentJob !== null) {
            const sending = this.currentJob.controllers.map((c) =>
              c.stage === FwStage.UploadingToMaster
                ? transitionControllerState(c, FwStage.Sending)
                : c,
            );
            this.currentJob = { ...this.currentJob, controllers: sending };
            for (const c of sending) {
              localThrottle.submit(c.controllerId, c, true);
            }
          }

          const beginPayload: FwDeployBegin = { transferId, order: targetIds };
          const beginMsg = this.messageGenerator.generateMessage(
            SerialMessageType.FW_DEPLOY_BEGIN,
            uuid_v4(),
            beginPayload,
          );
          try {
            this.bus.send(beginMsg.msg, { kind: 'firmware' });
          } catch (err) {
            // FMI §1: a Worker channel / IPC failure here leaves
            // controllers stuck in Sending. Convert to a typed reason
            // so the IIFE catch routes cleanup through `failJob`.
            const detail = err instanceof Error ? err.message : String(err);
            throw new FlashOrchestratorError('bus_send_failed', detail);
          }

          // FMI §1: subscribeDeployEvents shouldn't throw, but a
          // listener-limit / disposed-bus failure would leave
          // controllers stuck in Sending mid-deploy. FW_DEPLOY_BEGIN has
          // already been sent so the master may proceed without an
          // observer; the operator-facing UI surfaces Failed regardless.
          try {
            this.deployUnsubscriber = this.bus.subscribeDeployEvents(transferId, (event) =>
              this.handleDeployEvent(event),
            );
          } catch (err) {
            const detail = err instanceof Error ? err.message : String(err);
            throw new FlashOrchestratorError('subscriber_attach_failed', detail);
          }
        } catch (err) {
          // HTTP has already responded 200; the operator's truth source
          // for the failure is the `flashJobFailed` WS event from
          // `failJob`. Don't re-throw — this is fire-and-forget.
          this.routeStartFailure(jobId, err);
        }
      })().catch((err) => {
        // Final-fallback belt for the narrow path where `routeStartFailure`
        // itself throws: `failJob → failNonTerminalControllers →
        // transitionControllerState` raises the FSM's "illegal flash-job
        // transition" Error if upstream ever leaves a controller in a
        // stage the `LEGAL_NEXT_STAGES` guard rejects. (Disposer throws
        // from `releaseLock` are isolated by per-disposer try/catch
        // there, so they don't reach this belt — keeping the belt's
        // coverage exactly to the FSM-throw path means we won't emit a
        // duplicate `flashJobFailed` that would overwrite a real
        // diagnostic banner on the operator's UI.)
        //
        // Without this belt the promise rejects unhandled, and (because
        // `failJob` didn't reach `releaseLock`) the JobLock stays held —
        // the next operator flash sees `job_already_running` forever.
        //
        // Four things have to happen for the system to be usable again:
        //
        // 1. Best-effort terminal WS emit so the operator's UI can exit
        //    `phase='flashing'`. Bypass `safeEmitWs` — that swallows-and-
        //    logs, which would re-fire the log on whatever threw the belt
        //    in the first place. The inner try/catch swallows any emit
        //    failure; the local `emitOk` flag tells the final log message
        //    whether the operator's UI was actually notified.
        // 2. Null the per-job state fields WITHOUT invoking their
        //    disposers. The disposers may be exactly what threw, so re-
        //    invoking them risks an infinite-throw loop. In practice
        //    `deployUnsubscriber` is null on every belt-reachable path
        //    (the subscriber is assigned after both `streamer.run()` and
        //    `bus.send()` succeed; any failure earlier short-circuits
        //    before assignment), so only the `throttle` reference is real
        //    leak surface here.
        // 3. Release the JobLock. The return value tells us whether the
        //    lock was actually held when the belt fired: `true` means
        //    `failJob` never reached its `releaseLock` line and the belt
        //    saved the system; `false` is reserved for a future broader
        //    coverage path (today, the FSM-throw path always leaves the
        //    lock held, so `released` is always `true`).
        // 4. Broadcast the post-release lock state for consistency with
        //    sibling release sites (`acquireLock` line 612, `releaseLock`
        //    line 1118). In production the actual "other tabs see the
        //    lock free" mechanism is the `JobLock.notify()` subscriber
        //    wired up in `api_server.ts:282-284` — the lock's own
        //    listener already broadcasts `lockStateChanged` on every
        //    `release()` call. Calling `broadcastLockState()` here is
        //    duplicative in production but matches the pattern unit
        //    tests rely on (the test fixture's `emitWs` only sees the
        //    orchestrator's direct broadcasts, since tests don't wire
        //    up the api_server subscriber). Skipping the call would
        //    leave tests asserting "exactly N lockStateChanged frames"
        //    silently undercounting the belt path.
        let emitOk = false;
        try {
          this.emitWs({
            type: TransmissionType.flashJobFailed,
            data: {
              jobId,
              endedAt: new Date(this.clock.now()).toISOString(),
              reason: 'streamer_unknown_error',
              detail:
                'Internal cleanup failure; flash state is unknown. Verify each controller manually.',
            },
          });
          emitOk = true;
        } catch {
          // Belt path is already failing; the emit may also throw. Swallow.
        }
        this.runInProgress = null;
        this.currentJob = null;
        this.phase = null;
        this.deployUnsubscriber = null;
        this.throttle = null;
        this.abortController = null;
        const released = this.jobLock.release(jobId);
        // `broadcastLockState` uses `safeEmitWs` which swallows-and-logs
        // on emit failure, so it can't throw the belt back into the rejection
        // path; safe to call without an inner try/catch.
        this.broadcastLockState();
        const uiNote = emitOk
          ? 'UI was notified via best-effort flashJobFailed emit.'
          : 'UI emit also failed; operator must verify controllers manually.';
        logger.error(
          err,
          released
            ? `flash orchestrator: routeStartFailure threw for job=${jobId}; force-released JobLock. ${uiNote}`
            : `flash orchestrator: routeStartFailure threw for job=${jobId}; lock was already free. ${uiNote}`,
        );
      });

      return {
        jobId,
        transferId,
        source: resolved.source,
        targets: targetIds,
      };
    } catch (err) {
      // Sync-phase failure (controllers lookup, source resolve, etc.).
      // Route through `failJob` for cleanup and re-throw so the
      // controller's catch can map to an HTTP status. The IIFE catch
      // above handles the post-spawn errors with the same routing.
      this.routeStartFailure(jobId, err);
      throw err;
    }
  }

  // Shared error router for the sync catch in `start()` (which re-throws
  // for HTTP status mapping) and the IIFE catch (which absorbs because
  // HTTP has already responded). `FlashOrchestratorError` and
  // `TransferError` land here as typed reasons; anything else maps to
  // `streamer_unknown_error` so the operator sees a typed reason rather
  // than a bare lockStateChanged with no context.
  private routeStartFailure(jobId: string, err: unknown): void {
    if (err instanceof FlashOrchestratorError) {
      this.failJob(jobId, err.reason, err.detail);
    } else if (err instanceof TransferError) {
      this.failJob(jobId, err.code, err.detail, { abortReason: err.code });
    } else {
      const detail = err instanceof Error ? err.message : String(err);
      this.failJob(jobId, 'streamer_unknown_error', detail, {
        abortReason: 'streamer_unknown_error',
      });
    }
  }

  /**
   * Test-only: await the background IIFE assigned to `runInProgress`
   * settling. The IIFE is wrapped with a `.catch` belt that absorbs any
   * rejection from `routeStartFailure`, so this always observes a fulfilled
   * promise — tests look at `jobLock`/`emitWs` for the post-settle state
   * rather than catching here. Returns immediately when no background work
   * is in flight. Production code MUST NOT call this — see the
   * `runInProgress` field's docstring for why. Named with a `ForTest`
   * suffix so a `grep` for the name surfaces accidental production use.
   */
  async awaitRunInProgressForTest(): Promise<void> {
    if (this.runInProgress !== null) {
      await this.runInProgress;
    }
  }

  /**
   * Cancel the in-flight job. Returns `null` when no job is active OR the
   * job has already reached `flashJobDone` (caller's cancel arrived after
   * the work completed; the HTTP layer maps null → 404).
   *
   * Upload phase: aborts the streamer; its rejection flows through the
   * IIFE catch → `routeStartFailure` → `failJob`. Deploy phase: routes
   * through `failJob` directly with reason='aborted'.
   *
   * Both paths emit `flashJobFailed { reason: 'aborted', abortReason }`,
   * but the `abortReason` payload differs: upload-phase carries the
   * `TransferError.code` (always the literal string `'aborted'` for
   * operator-cancel — see `routeStartFailure` for the TransferError
   * routing); deploy-phase carries the operator's free-form `reason`
   * string. The UI renders the deploy-phase value verbatim under the
   * "Abort reason:" label, so the deploy path gives the operator a more
   * informative banner. Carrying the operator string through the
   * upload-phase TransferError would equalize the two — tracked
   * separately if the UX gap becomes a real issue.
   */
  async cancel(reason: string): Promise<{ jobId: string } | null> {
    if (this.currentJob === null) return null;
    // Cancel-during-reboot-wait: the job already emitted `flashJobDone`,
    // so per spec §"Cancel race windows" this is a documented no-op.
    if (this.phase === 'done') return null;
    const jobId = this.currentJob.jobId;

    if (this.phase === 'upload') {
      // Don't release here; the streamer's still-pending rejection will
      // land in the IIFE catch and run `releaseLock` through `failJob`.
      if (this.abortController !== null) {
        this.abortController.abort(reason);
      }
      return { jobId };
    }

    // phase === 'deploy' — streamer is already settled; route through
    // `failJob` with reason='aborted' so the wire shape matches the
    // cancel-during-upload path. The cancel trigger rides on `abortReason`.
    this.failJob(jobId, 'aborted', reason, { abortReason: reason });
    return { jobId };
  }

  /**
   * Post-deploy heartbeat from the master (carries its now-running version).
   * Called by `api_server`'s POLL handler when a POLL_ACK arrives carrying a
   * version that matches the in-flight job's deployed target. The version
   * argument is intentionally unused at this layer: api_server is responsible
   * for the version-vs-expected match (see spec §"Data flow" step 13). The
   * orchestrator's job is to clear the reboot timer + release the lock.
   *
   * No-op when the reboot timer isn't armed: out-of-protocol heartbeats
   * (mid-upload, mid-deploy, never-started) all leave `rebootTimer === null`,
   * and a second heartbeat after the first one fired hits the same null check
   * — first-fire-wins, no double release.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  notifyMasterHeartbeat(_version: string): void {
    // First-fire-wins guard. `rebootTimer` is only non-null between
    // `flashJobDone` emit and the lock-release (whichever path wins).
    // Outside that window — including pre-job, mid-upload, mid-deploy,
    // and post-release — the heartbeat is a no-op.
    if (this.rebootTimer === null) return;
    // Invariant: `rebootTimer` is armed only inside `handleDeployDone`,
    // which only runs while `currentJob !== null`. A violation indicates
    // a bug somewhere upstream — surface it loudly rather than masking.
    if (this.currentJob === null) {
      throw new Error('flash orchestrator invariant: rebootTimer is set but currentJob is null');
    }
    const jobId = this.currentJob.jobId;
    this.clock.clearTimeout(this.rebootTimer);
    this.rebootTimer = null;
    this.releaseLock(jobId);
  }

  getCurrentJob(): FlashJobState | null {
    return this.currentJob;
  }

  // Best-effort emit. Per FMI §1: `emitWs` failures must not propagate into
  // the orchestrator (e.g., a mid-shutdown WS server throwing inside
  // `updateClients`). `updateClients` itself silently drops disconnected
  // clients, so any throw here is a rare edge case — we log and continue.
  private safeEmitWs(msg: FlashOrchestratorWsMessage): void {
    try {
      this.emitWs(msg);
    } catch (err) {
      // TransmissionType is a numeric enum, so `String(msg.type)` alone
      // would log a bare integer (hard to grep, hard to diagnose). Reverse-
      // mapping via `TransmissionType[msg.type]` yields the readable name;
      // we still surface the integer alongside so log greps for either form
      // — name or number — both work, and an unknown value surfaces clearly.
      const typeName = TransmissionType[msg.type] ?? '<unknown>';
      logger.error(`flash orchestrator: emitWs(${typeName} (${msg.type})) threw: ${String(err)}`);
    }
  }

  private broadcastLockState(): void {
    this.safeEmitWs(buildLockStateResponse(this.jobLock.getState()));
  }

  // "Tear down everything" exit path. Direct callers: `failJob` (the
  // shared fail-path consolidation point, reached by every error entry),
  // the reboot-timer fallback, and `notifyMasterHeartbeat`. Each cleanup
  // step is idempotent — when an earlier site already disposed a
  // resource, the field is null and that step is a no-op. The duplicate
  // cleanup keeps every entry-point self-contained.
  private releaseLock(jobId: string): void {
    if (this.rebootTimer !== null) {
      // Production `Clock.clearTimeout` doesn't throw, but a test clock or
      // a future custom clock could. `releaseLock` with `rebootTimer !==
      // null` is reachable from `failJob` called by a late deploy event
      // (`handleDeployEvent → failDeployPhase → failJob`), so without this
      // wrap a throw would propagate up through the bus's deploy-event
      // dispatcher into the worker's EventEmitter as an uncaught
      // exception — taking down the worker rather than failing one job.
      try {
        this.clock.clearTimeout(this.rebootTimer);
      } catch (err) {
        logger.error(
          err,
          `flash orchestrator: clock.clearTimeout threw during releaseLock for job=${jobId}`,
        );
      }
      this.rebootTimer = null;
    }
    // Disposer calls run in their own try/catch so a misbehaving
    // subscriber or throttle can't propagate up through `failJob` into
    // the background-IIFE `.catch` belt. Without this guard, a throw
    // here (AFTER `failJob` already emitted the real `flashJobFailed`)
    // would reach the belt, which would emit a SECOND `flashJobFailed`
    // with the generic `streamer_unknown_error` placeholder — the
    // operator's UI would see the real diagnostic banner replaced by
    // the catch-all message. Logging keeps the disposer failure
    // diagnosable; the per-step null still runs so the next job gets
    // a clean slate.
    if (this.deployUnsubscriber !== null) {
      try {
        this.deployUnsubscriber();
      } catch (err) {
        logger.error(
          err,
          `flash orchestrator: deployUnsubscriber threw during releaseLock for job=${jobId}`,
        );
      }
      this.deployUnsubscriber = null;
    }
    if (this.throttle !== null) {
      try {
        this.throttle.dispose();
      } catch (err) {
        logger.error(
          err,
          `flash orchestrator: throttle.dispose threw during releaseLock for job=${jobId}`,
        );
      }
      this.throttle = null;
    }
    this.abortController = null;
    this.phase = null;
    this.currentJob = null;
    // The background promise has already settled by the time releaseLock
    // runs on any normal path (failJob / handleDeployDone / cancel-during-
    // deploy) — null it out so it can't leak across job lifecycles.
    this.runInProgress = null;
    this.jobLock.release(jobId);
    this.broadcastLockState();
  }

  // Routes a deploy-phase event (FW_PROGRESS or FW_DEPLOY_DONE) into the
  // FSM. Hostile-input guards per FMI §6: unknown controllerIds drop with a
  // log, invalid stage / outcome / empty results trip protocol_violation.
  private handleDeployEvent(event: FwDeployEvent): void {
    if (this.currentJob === null) return;
    if (event.kind === 'progress') {
      this.handleDeployProgress(event.payload);
      return;
    }
    this.handleDeployDone(event.payload.results);
  }

  private handleDeployProgress(payload: FwProgress): void {
    if (this.currentJob === null) return;
    const target = this.currentJob.controllers.find((c) => c.controllerId === payload.controllerId);
    if (target === undefined) {
      // Stale-job leak guard: a master that mistakenly forwards events for
      // a controller that isn't in this job's target list. Drop + log.
      logger.info(
        `flash orchestrator: FW_PROGRESS for unknown controllerId=${payload.controllerId}; dropping`,
      );
      return;
    }
    if (!isValidFwStage(payload.stage)) {
      this.failDeployPhase('protocol_violation', `invalid stage: ${String(payload.stage)}`);
      return;
    }
    // Same-stage progress (bytesSent advance) and stage transitions both
    // route through `transitionControllerState`, which permits the
    // self-edge in the LEGAL_NEXT_STAGES map for non-terminal stages.
    // The throttle decides emit-now vs flush-later: stage-changed → force
    // (bypass), same-stage → throttled.
    const stageChanged = target.stage !== payload.stage;
    let next: ControllerFlashState;
    try {
      // Terminal stages arrive via FW_DEPLOY_DONE; `handleDeployProgress` only
      // sees in-flight stages. The narrow union below excludes terminal
      // stages so transitionControllerState's overload picks the in-flight
      // payload (bytesSent / totalBytes / detail).
      next = transitionControllerState(
        target,
        payload.stage as
          | FwStage.Queued
          | FwStage.UploadingToMaster
          | FwStage.Sending
          | FwStage.Verifying
          | FwStage.Flashing
          | FwStage.Rebooting,
        {
          bytesSent: payload.bytesSent,
          totalBytes: payload.totalBytes,
          detail: payload.detail,
        },
      );
    } catch (err) {
      // Illegal transition (e.g., master forwards Verifying when the
      // controller is in Queued). Surface as protocol_violation per FMI §6.
      const detail = err instanceof Error ? err.message : String(err);
      this.failDeployPhase('protocol_violation', detail);
      return;
    }
    const updated = this.currentJob.controllers.map((c) =>
      c.controllerId === payload.controllerId ? next : c,
    );
    this.currentJob = { ...this.currentJob, controllers: updated };
    if (this.throttle !== null) {
      this.throttle.submit(next.controllerId, next, stageChanged);
    }
  }

  private handleDeployDone(results: FwDeployDoneResult[]): void {
    if (this.currentJob === null) return;
    if (results.length === 0) {
      // Empty results array = master sent "done" with no per-controller
      // outcomes. Per FMI §1's hostile-input guard, treat as protocol
      // violation rather than silently leaving controllers mid-stage.
      this.failDeployPhase('protocol_violation', 'empty FW_DEPLOY_DONE results');
      return;
    }
    // Validate every entry's outcome up-front. If any is malformed we fail
    // the job; partial-validity is not a state we can reason about (the
    // orchestrator can't know whether the OK entries reflect real outcomes
    // or are a master bug, so reject the lot rather than apply some).
    for (const r of results) {
      if (r.outcome !== 'OK' && r.outcome !== 'FAILED') {
        this.failDeployPhase(
          'protocol_violation',
          `invalid outcome for controllerId=${r.controllerId}: ${String(r.outcome)}`,
        );
        return;
      }
    }
    // Apply terminal transitions. Unknown controllerIds drop with a log per
    // FMI §6 (master might mistakenly include a phantom id; rejecting the
    // whole job over it would be brittle when the rest is sound).
    let updated = this.currentJob.controllers;
    for (const r of results) {
      const target = updated.find((c) => c.controllerId === r.controllerId);
      if (target === undefined) {
        logger.info(
          `flash orchestrator: FW_DEPLOY_DONE result for unknown controllerId=${r.controllerId}; skipping`,
        );
        continue;
      }
      let next: ControllerFlashState;
      try {
        if (r.outcome === 'OK') {
          next = transitionControllerState(target, FwStage.VersionConfirmed, {
            finalVersion: r.finalVersion,
          });
        } else {
          next = transitionControllerState(target, FwStage.Failed, {
            error: r.error,
          });
        }
      } catch (err) {
        // Illegal transition (e.g., terminal arriving when the controller
        // is already terminal — duplicate FW_DEPLOY_DONE). Surface as
        // protocol_violation; we'd rather flag this loudly than swallow
        // a master-side double-send bug.
        const detail = err instanceof Error ? err.message : String(err);
        this.failDeployPhase('protocol_violation', detail);
        return;
      }
      updated = updated.map((c) => (c.controllerId === r.controllerId ? next : c));
      this.safeEmitWs({
        type: TransmissionType.flashControllerResult,
        data: { jobId: this.currentJob.jobId, controller: next },
      });
    }
    this.currentJob = { ...this.currentJob, controllers: updated };
    // Done is terminal for the deploy phase — drop the subscriber so a
    // late retransmit doesn't double-process. Wrap the disposer call to
    // match the protection in `releaseLock`: a bus mid-shutdown or a
    // double-disposed handle could throw, and on this success path that
    // throw would escape into the bus's deploy-event dispatcher — leaving
    // `flashJobDone` unemitted, `rebootTimer` unarmed, and the JobLock
    // held forever. Log + continue so the rest of the success path runs.
    if (this.deployUnsubscriber !== null) {
      try {
        this.deployUnsubscriber();
      } catch (err) {
        logger.error(
          err,
          `flash orchestrator: deployUnsubscriber threw during handleDeployDone for job=${this.currentJob.jobId}`,
        );
      }
      this.deployUnsubscriber = null;
    }

    // If every controller reached a terminal stage (any mix of
    // VersionConfirmed and Failed), the job is "done" per c.6a's
    // `deriveJobLifecycle`. Per-controller failures are local — the
    // job-wide event is `flashJobDone` even when some controllers failed
    // (the master still rebooted; we still want to release the lock when
    // its post-reboot heartbeat arrives). `flashJobFailed` is reserved for
    // job-wide aborts (set via `abortReason`), distinct from per-controller
    // `Failed`. Mid-flight stages (Sending/Verifying/Rebooting still
    // present in `controllers[]`) keep us in `'in_flight'` and the
    // subscriber would have already been disposed above; in that case we
    // never armed the timer, which matches the FMI §2 state matrix.
    const lifecycle = deriveJobLifecycle(this.currentJob);
    if (lifecycle !== 'done') return;

    const jobId = this.currentJob.jobId;
    const endedAt = new Date(this.clock.now()).toISOString();
    this.currentJob = { ...this.currentJob, endedAt };
    // Phase transitions to 'done' before the WS emit so a `cancel()` racing
    // through this control flow (operator clicks cancel just as deploy-done
    // arrives) sees the post-done state and short-circuits to no-op rather
    // than running deploy-cancel cleanup against an already-terminal job.
    this.phase = 'done';
    this.safeEmitWs({
      type: TransmissionType.flashJobDone,
      data: { jobId, endedAt },
    });

    // Arm the reboot-timer fallback. Lock release happens via either
    // `notifyMasterHeartbeat` (primary, fires on the post-deploy POLL_ACK)
    // or this timer (secondary, covers master-malfunction). First-fire-wins
    // is enforced by both paths checking `rebootTimer === null` before
    // touching shared state.
    this.rebootTimer = this.clock.setTimeout(() => {
      this.rebootTimer = null;
      this.releaseLock(jobId);
    }, this.rebootTimeoutMs);
  }

  // Mid-deploy failure entry — `handleDeployEvent` calls this when FW_PROGRESS
  // / FW_DEPLOY_DONE wire validation trips `protocol_violation`. The deploy
  // subscriber fires asynchronously off a serial event so it can't throw out
  // of an orchestrator try/catch; this wrapper delegates to `failJob`.
  private failDeployPhase(reason: FlashOrchestratorErrorReason, detail: string): void {
    if (this.currentJob === null) return;
    this.failJob(this.currentJob.jobId, reason, detail);
  }

  // Single consolidation point for "the job failed; clean up". Every error
  // path — pre-streamer validation, source resolution, streamer rejection
  // (TransferError or unknown), bus_send_failed, subscriber_attach_failed,
  // protocol_violation — funnels through here. Responsibilities:
  //
  //   1. Stamp `currentJob.abortReason` if the caller passes one (bucket-B
  //      streamer-rejection paths supply `error.code` per spec §"Error
  //      paths"; pre-streamer paths leave it absent because there's no
  //      currentJob to stamp).
  //   2. Transition every non-terminal controller to `Failed` with the
  //      detail-or-reason as the error string and emit
  //      `flashControllerResult` per affected controller — but only when
  //      `currentJob !== null` (pre-streamer failures don't have controllers
  //      to fail; the lock-acquire-then-validate sequence rejects before
  //      `currentJob` is set).
  //   3. Emit `flashJobFailed { jobId, reason, detail, endedAt }` (with
  //      `abortReason` mixed in when the bucket-B path supplied one).
  //   4. `releaseLock(jobId)` for canonical teardown — disposes
  //      subscriber, throttle, reboot timer, AbortController, clears
  //      `currentJob`, releases the lock, broadcasts `lockStateChanged`.
  //
  // Idempotent against `currentJob === null`: pre-streamer failures still
  // emit `flashJobFailed` (the operator's WS surface needs to know the
  // request was rejected) but skip the per-controller transitions.
  private failJob(
    jobId: string,
    reason: FlashOrchestratorErrorReason,
    detail: string | undefined,
    opts: { abortReason?: string } = {},
  ): void {
    if (this.currentJob !== null) {
      if (opts.abortReason !== undefined) {
        this.currentJob = { ...this.currentJob, abortReason: opts.abortReason };
      }
      // Use the `reason: detail` form as the per-controller error string
      // so operators reading a single controller's `Failed.error` see
      // both the typed reason and the upstream detail without having to
      // cross-reference the job-wide `flashJobFailed` event.
      const errorStr = detail !== undefined ? `${reason}: ${detail}` : reason;
      this.failNonTerminalControllers(errorStr);
    }
    const endedAt = new Date(this.clock.now()).toISOString();
    const data: FlashJobFailedData = { jobId, reason, endedAt };
    if (detail !== undefined) data.detail = detail;
    if (opts.abortReason !== undefined) data.abortReason = opts.abortReason;
    this.safeEmitWs({
      type: TransmissionType.flashJobFailed,
      data,
    });
    this.releaseLock(jobId);
  }

  // Transitions every non-terminal controller to Failed with the supplied
  // error string and emits flashControllerResult per controller (bypasses
  // throttle — terminal results never coalesce). Only called from `failJob`.
  private failNonTerminalControllers(error: string): void {
    if (this.currentJob === null) return;
    const jobId = this.currentJob.jobId;
    const updated: ControllerFlashState[] = [];
    for (const c of this.currentJob.controllers) {
      if (c.stage === FwStage.VersionConfirmed || c.stage === FwStage.Failed) {
        updated.push(c);
        continue;
      }
      const next = transitionControllerState(c, FwStage.Failed, { error });
      updated.push(next);
      this.safeEmitWs({
        type: TransmissionType.flashControllerResult,
        data: { jobId, controller: next },
      });
    }
    this.currentJob = { ...this.currentJob, controllers: updated };
  }
}

// Validates the controllers list returned by `controllersStore.listFlashTargets()`:
//   * non-empty (else `'no_controllers'`)
//   * every entry has a populated `variant` (else `'variant_unknown'`, detail
//     enumerates the offending controller IDs)
//   * all variants identical (else `'variant_mismatch'`, detail enumerates
//     the controller=variant pairs so the operator can see which one is
//     wrong)
//
// `variant` is normalized via `String#trim` and treated as missing if
// `undefined`, `null`, or empty-after-trim. This matches the production
// data path: `handlePollAck` leaves `ControlModule.variant` undefined
// when the firmware doesn't report one, and a hypothetical wiring
// regression that left whitespace through (e.g., a buggy cache layer)
// would surface here as `'variant_unknown'` rather than tripping a
// misleading `'asset_not_found'` further down the resolver.
//
// Returns the (uniform, trimmed) variant string for downstream consumption.
function validateControllers(controllers: Array<{ id: string; variant?: string | null }>): string {
  if (controllers.length === 0) {
    throw new FlashOrchestratorError('no_controllers');
  }
  const normalized = controllers.map((c) => ({
    id: c.id,
    variant: typeof c.variant === 'string' ? c.variant.trim() : '',
  }));
  const missingVariant = normalized.filter((c) => c.variant === '').map((c) => c.id);
  if (missingVariant.length > 0) {
    throw new FlashOrchestratorError('variant_unknown', missingVariant.join(', '));
  }
  const firstVariant = normalized[0].variant;
  const uniform = normalized.every((c) => c.variant === firstVariant);
  if (!uniform) {
    const detail = normalized.map((c) => `${c.id}=${c.variant}`).join(', ');
    throw new FlashOrchestratorError('variant_mismatch', detail);
  }
  return firstVariant;
}

// Hostile-input guard for FW_PROGRESS.stage. The wire field is a string; the
// master might emit anything (firmware bug, future protocol extension that
// the server doesn't know yet, malicious input). Cross-check against the
// enum's value set rather than `keyof typeof FwStage` because the wire form
// uses the value strings (`'SENDING'`), not the enum keys (`'Sending'`).
const VALID_FW_STAGES: ReadonlySet<FwStage> = new Set<FwStage>(Object.values(FwStage));
function isValidFwStage(stage: unknown): stage is FwStage {
  return typeof stage === 'string' && VALID_FW_STAGES.has(stage as FwStage);
}

// Maps the typed errors thrown by `resolveFlashSource` onto matching
// `FlashOrchestratorError` reasons. The resolver tags each failure source
// with a typed `FlashSourceLookupError` carrying the reason directly, so
// this is just a 1:1 unwrap. Anything that isn't a `FlashSourceLookupError`
// (a non-resolver bug bubbling up from inside the resolver, e.g.) maps to
// the catch-all `source_resolution_failed` so the operator still sees a
// typed `flashJobFailed`.
function mapResolveError(err: unknown): FlashOrchestratorError {
  if (err instanceof FlashSourceLookupError) {
    return new FlashOrchestratorError(err.reason, err.detail);
  }
  const detail = err instanceof Error ? err.message : String(err);
  return new FlashOrchestratorError('source_resolution_failed', detail);
}
