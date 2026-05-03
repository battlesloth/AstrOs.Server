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
//     Composes the resolver + streamer + (forthcoming) deploy phase behind
//     `start()` / `cancel()` / `notifyMasterHeartbeat()` / `getCurrentJob()`.

import { v4 as uuid_v4 } from 'uuid';
import { logger } from '../logger.js';
import type { Clock, FlashRequest, Streamer } from '../models/firmware/flash_orchestrator.js';
import type {
  ControllerFlashState,
  FlashJobState,
  FlashSource,
} from '../models/firmware/flash_job_state.js';
import { FwStage } from '../models/firmware/firmware_messages.js';
import { transitionControllerState } from './flash_job_state_machine.js';
import type { SerialBus, StreamObserver, TransferSpec } from '../models/firmware/chunk_streamer.js';
import type { AssetInfo, ReleaseInfo, ReleaseListResult } from '../models/firmware/release.js';
import type { CachedAsset } from '../models/firmware/cache.js';
import type { StoredUpload } from '../models/firmware/upload.js';
import type { JobLock } from '../job_lock/job_lock.js';
import { TransmissionType } from '../models/enums.js';
import { buildLockStateResponse } from '../models/networking/lock_responses.js';
import { ChunkStreamer } from './chunk_streamer.js';

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
): Promise<ResolvedFlashSource> {
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
  const stored = await upload.latest();
  if (stored === null) throw new Error('no_upload');
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

// ---------------------------------------------------------------------------
// FlashJobOrchestrator
// ---------------------------------------------------------------------------
//
// Single-flight orchestrator for OTA flash jobs. Composes:
//   * c.0 `JobLock` — synchronous boolean gate; only one flash at a time.
//   * c.6a `transitionControllerState` / `deriveJobLifecycle` — per-controller
//     FSM machinery (consumed in Tasks 7+).
//   * c.6b `ChunkStreamer` — sliding-window upload to the master ESP32.
//   * c.4 `FirmwareCache` + c.5 `FirmwareUploadStore` (via `resolveFlashSource`)
//     — source binary acquisition.
//   * c.3 `GitHubReleaseService` — release/asset enumeration.
//
// Task 6 ships the skeleton + happy-path `start()` with a NO-OP streamer
// observer and a placeholder VersionConfirmed-and-release-immediately on
// streamer success. Tasks 7-11 wire the real upload-phase observer
// (Task 7), deploy phase (Task 8), reboot timer + heartbeat (Task 9),
// cancel (Task 10), and full error-path mapping (Task 11).

const DEFAULT_REBOOT_TIMEOUT_MS = 15_000;
const DEFAULT_THROTTLE_WINDOW_MS = 250;

// Shape passed to `emitWs`. Mirrors the existing `updateClients(any)` contract
// without losing the discriminator. Each broadcast is one of:
//   * `LockStateResponse` (built via `buildLockStateResponse`) — for
//     `lockStateChanged`. Carries `BaseResponse` fields plus the lock state.
//   * `{ type, data }` — for the 5 flash lifecycle events. Matches the
//     `{ type: TransmissionType, data: ... }` envelope the design spec
//     specifies for flash WS events (spec §"WebSocket events").
//
// The orchestrator is the only writer; the consumer (`updateClients`)
// JSON-stringifies the whole object and forwards to clients. We require the
// `type` discriminator so consumers can route by it; everything else is open
// (`Record<string, unknown>`) because the per-event payloads vary.
export interface FlashOrchestratorWsMessage extends Record<string, unknown> {
  type: TransmissionType;
}

// Narrow interface around the controllers data store. The orchestrator only
// needs the per-target ID + variant tuple at flash time; the larger
// `ControllersRepository` surface stays out of the way.
export interface FlashControllersStore {
  listInLocation(): Promise<Array<{ id: string; variant: string }>>;
}

// Reasons surfaced as `FlashOrchestratorError.reason`. Task 6 covers the
// pre-streamer failure modes plus the source-resolution bucket (refined in
// Task 11 to distinguish `release_lookup_failed` vs `source_resolution_failed`,
// add `protocol_violation`, `bus_send_failed`, etc., and pass through every
// `TransferErrorCode` from c.6b).
export type FlashOrchestratorErrorReason =
  | 'job_already_running'
  | 'no_controllers'
  | 'variant_mismatch'
  | 'variant_unknown'
  | 'release_not_found'
  | 'asset_not_found'
  | 'no_upload'
  | 'release_lookup_failed'
  | 'source_resolution_failed';

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
  config?: { rebootTimeoutMs?: number; throttleWindowMs?: number };
}

// Default real-clock + real-streamer factories. Exported test-helper-style so
// the production wiring (Task 13) can use defaults via `new FlashJobOrchestrator({...})`
// without naming them.
const defaultClock: Clock = {
  now: () => Date.now(),
  setTimeout: (cb, ms) => globalThis.setTimeout(cb, ms),
  clearTimeout: (t) => globalThis.clearTimeout(t),
};

function defaultStreamerFactory(opts: { bus: SerialBus }): Streamer {
  return new ChunkStreamer({ bus: opts.bus });
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
  // Stored for Tasks 8-9 (reboot timer arm) and Task 5's throttle (Task 7).
  // Not yet consumed in Task 6.
  private readonly rebootTimeoutMs: number;
  private readonly throttleWindowMs: number;

  private currentJob: FlashJobState | null = null;

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
    // Stash unused-for-Task-6 fields against the linter / `noUnusedLocals`.
    // `throttleWindowMs` is consumed in Task 7 (passed into the progress
    // throttle); `rebootTimeoutMs` is consumed in Task 9 (reboot timer arm
    // duration). Removed when those tasks wire the fields in.
    void this.rebootTimeoutMs;
    void this.throttleWindowMs;
  }

  /**
   * Acquire `JobLock`, validate targets, resolve source, and run the streamer.
   *
   * Task 6: happy-path skeleton. Streamer runs with a NO-OP observer and on
   * success all controllers are placeholder-transitioned to
   * `VersionConfirmed { finalVersion: source.version }`, `flashJobDone` is
   * emitted, and the lock is released immediately. Tasks 7-9 replace this
   * placeholder with the real upload-observer wiring, deploy phase, and
   * reboot timer.
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
      const targetsList = await this.controllersStore.listInLocation();
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

      const transferId = uuid_v4();
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

      // Run the streamer with a no-op observer. Task 7 wires the real one
      // (Queued→UploadingToMaster transition + per-controller bytesSent
      // updates + stage-boundary force-emits via the throttle).
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
      const noopObserver: StreamObserver = {};
      await streamer.run(transferSpec, noopObserver, {});

      // Placeholder for the deploy phase (Task 8) + reboot timer (Task 9).
      // Currently: walk every controller from Queued through the FSM to a
      // terminal VersionConfirmed (using the requested version as a stand-in
      // for the master-reported finalVersion), emit `flashJobDone`, release
      // the lock immediately. None of these shortcuts survive Tasks 7-9 —
      // Task 7 owns the Queued→UploadingToMaster transition, Task 8 owns
      // UploadingToMaster→…→VersionConfirmed driven by FW_DEPLOY_DONE
      // results, and Task 9 owns the reboot-timer-then-release flow. The
      // intermediate transitions are walked one stage at a time because the
      // FSM only permits adjacent moves (`Queued → UploadingToMaster`,
      // not `Queued → VersionConfirmed`).
      const finalControllers: ControllerFlashState[] = this.currentJob.controllers.map((c) => {
        const uploading = transitionControllerState(c, FwStage.UploadingToMaster);
        const sending = transitionControllerState(uploading, FwStage.Sending);
        const verifying = transitionControllerState(sending, FwStage.Verifying);
        const rebooting = transitionControllerState(verifying, FwStage.Rebooting);
        return transitionControllerState(rebooting, FwStage.VersionConfirmed, {
          finalVersion: resolved.source.version,
        });
      });
      const endedAt = new Date(this.clock.now()).toISOString();
      this.currentJob = { ...this.currentJob, controllers: finalControllers, endedAt };
      this.safeEmitWs({
        type: TransmissionType.flashJobDone,
        data: { jobId, endedAt },
      });
      this.releaseLock(jobId);

      return {
        jobId,
        transferId,
        source: resolved.source,
        targets: targetIds,
      };
    } catch (err) {
      // Any post-acquire failure releases the lock and clears `currentJob`
      // so the next `start()` can run. For typed `FlashOrchestratorError`
      // failures (the validation + resolver paths Task 6 owns), emit
      // `flashJobFailed` so WS consumers see the rejection. Task 11 will
      // extend this to also handle untyped streamer rejections + the
      // per-controller fail-cleanup that streamer-mid-flight failures need.
      if (err instanceof FlashOrchestratorError) {
        const endedAt = new Date(this.clock.now()).toISOString();
        this.safeEmitWs({
          type: TransmissionType.flashJobFailed,
          data: {
            jobId,
            reason: err.reason,
            detail: err.detail,
            endedAt,
          },
        });
      }
      this.currentJob = null;
      // `release()` returns false if we never acquired — happens only if a
      // subclass overrides start() and throws before acquire. Defensive:
      // call it unconditionally but ignore the return.
      this.jobLock.release(jobId);
      this.broadcastLockState();
      throw err;
    }
  }

  /**
   * Cancel the in-flight job. Stub for Task 10.
   * Returns `null` when no job is active.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async cancel(_reason: string): Promise<{ jobId: string } | null> {
    if (this.currentJob === null) return null;
    return { jobId: this.currentJob.jobId };
  }

  /**
   * Post-deploy heartbeat from the master (carries its now-running version).
   * Stub for Task 9 — currently a no-op. The real impl clears the reboot
   * timer + releases the lock when the timer was armed in Task 9's deploy
   * completion path.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  notifyMasterHeartbeat(_version: string): void {
    // no-op until Task 9
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
      logger.error(`flash orchestrator: emitWs(${String(msg.type)}) threw: ${String(err)}`);
    }
  }

  private broadcastLockState(): void {
    // `LockStateResponse` is a closed interface from c.0; the cast widens
    // it to the orchestrator's open `Record<string, unknown>`-extending
    // emit shape. The wire bytes are unchanged — `updateClients`
    // JSON-stringifies the same fields either way.
    this.safeEmitWs(
      buildLockStateResponse(this.jobLock.getState()) as unknown as FlashOrchestratorWsMessage,
    );
  }

  private releaseLock(jobId: string): void {
    this.currentJob = null;
    this.jobLock.release(jobId);
    this.broadcastLockState();
  }
}

// Validates the controllers list returned by `controllersStore.listInLocation()`:
//   * non-empty (else `'no_controllers'`)
//   * every entry has a non-empty `variant` (else `'variant_unknown'`, detail
//     enumerates the offending controller IDs)
//   * all variants identical (else `'variant_mismatch'`, detail enumerates
//     the controller=variant pairs so the operator can see which one is
//     wrong)
//
// Returns the (uniform) variant string for downstream consumption.
function validateControllers(controllers: Array<{ id: string; variant: string }>): string {
  if (controllers.length === 0) {
    throw new FlashOrchestratorError('no_controllers');
  }
  const missingVariant = controllers.filter((c) => c.variant === '').map((c) => c.id);
  if (missingVariant.length > 0) {
    throw new FlashOrchestratorError('variant_unknown', missingVariant.join(', '));
  }
  const firstVariant = controllers[0].variant;
  const uniform = controllers.every((c) => c.variant === firstVariant);
  if (!uniform) {
    const detail = controllers.map((c) => `${c.id}=${c.variant}`).join(', ');
    throw new FlashOrchestratorError('variant_mismatch', detail);
  }
  return firstVariant;
}

// Maps the greppable-string Errors thrown by `resolveFlashSource` onto typed
// `FlashOrchestratorError` reasons. Task 11 will refine the catch-all bucket
// (`source_resolution_failed`) into `release_lookup_failed` for
// `releaseService.getReleases()` rejections vs cache/upload I/O failures.
function mapResolveError(err: unknown): FlashOrchestratorError {
  const message = err instanceof Error ? err.message : String(err);
  if (message === 'release_not_found' || message === 'asset_not_found' || message === 'no_upload') {
    return new FlashOrchestratorError(message);
  }
  return new FlashOrchestratorError('source_resolution_failed', message);
}
