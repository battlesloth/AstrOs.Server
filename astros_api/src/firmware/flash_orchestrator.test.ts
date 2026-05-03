import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createFlashProgressThrottle,
  FlashJobOrchestrator,
  FlashOrchestratorError,
  resolveFlashSource,
  type FlashOrchestratorWsMessage,
} from './flash_orchestrator.js';
import type { Clock, FlashRequest, Streamer } from '../models/firmware/flash_orchestrator.js';
import type { ControllerFlashState } from '../models/firmware/flash_job_state.js';
import { FwStage } from '../models/firmware/firmware_messages.js';
import type { AssetInfo, ReleaseInfo, ReleaseListResult } from '../models/firmware/release.js';
import type { CachedAsset } from '../models/firmware/cache.js';
import type { StoredUpload } from '../models/firmware/upload.js';
import type {
  FwInboundAck,
  SerialBus,
  StreamObserver,
  TransferResult,
  TransferSpec,
} from '../models/firmware/chunk_streamer.js';
import type { FwDeployEvent } from '../models/firmware/flash_orchestrator.js';
import { JobLock } from '../job_lock/job_lock.js';
import { TransmissionType } from '../models/enums.js';

// --- Fixture builders -------------------------------------------------------
// Each builder fills only the fields `resolveFlashSource` actually reads. The
// helper never looks at e.g. `assetUrl` or `path`, so we don't construct them.

function makeAsset(overrides: Partial<AssetInfo> = {}): AssetInfo {
  return {
    variant: 'lolin_d32_pro',
    version: '1.4.0',
    assetName: 'astros-esp-1.4.0-lolin_d32_pro-app.bin',
    assetUrl: 'https://example.test/asset.bin',
    sizeBytes: 1_200_000,
    ...overrides,
  };
}

function makeRelease(overrides: Partial<ReleaseInfo> = {}): ReleaseInfo {
  return {
    tag: 'v1.4.0',
    version: '1.4.0',
    publishedAt: '2026-04-15T00:00:00Z',
    prerelease: false,
    assets: [makeAsset()],
    ...overrides,
  };
}

function makeCachedAsset(overrides: Partial<CachedAsset> = {}): CachedAsset {
  return {
    path: '/tmp/cache/astros-esp-1.4.0-lolin_d32_pro-app.bin',
    sha256: 'a'.repeat(64),
    sizeBytes: 1_200_000,
    meta: {
      tag: 'v1.4.0',
      version: '1.4.0',
      variant: 'lolin_d32_pro',
      downloadedAt: '2026-05-01T07:30:00Z',
      publishedAt: '2026-04-15T00:00:00Z',
      sourceUrl: 'https://example.test/asset.bin',
      sizeBytes: 1_200_000,
    },
    ...overrides,
  };
}

function makeStoredUpload(overrides: Partial<StoredUpload> = {}): StoredUpload {
  return {
    path: '/tmp/uploads/upload-uuid.bin',
    sha256: 'b'.repeat(64),
    sizeBytes: 950_000,
    meta: {
      uploadId: 'upload-uuid',
      originalFilename: 'my-custom-build.bin',
      projectName: 'AstrOs.ESP',
      version: '1.5.0-dev',
      uploadedAt: '2026-05-01T08:00:00Z',
      sizeBytes: 950_000,
    },
    ...overrides,
  };
}

function makeReleaseList(releases: ReleaseInfo[] = []): ReleaseListResult {
  return { releases, staleSince: null };
}

// --- github source path -----------------------------------------------------

describe('resolveFlashSource — github source', () => {
  it('returns ResolvedFlashSource with kind=github, variant in displayName, and path on happy path', async () => {
    const release = makeRelease();
    const cached = makeCachedAsset();
    const cache = { fetch: vi.fn().mockResolvedValue(cached) };
    const upload = { latest: vi.fn() };
    const releaseService = { getReleases: vi.fn().mockResolvedValue(makeReleaseList([release])) };
    const request: FlashRequest = { source: { kind: 'github', version: '1.4.0' } };

    const result = await resolveFlashSource(
      request,
      cache,
      upload,
      releaseService,
      'lolin_d32_pro',
    );

    expect(result).toEqual({
      source: {
        kind: 'github',
        version: '1.4.0',
        sha256: 'a'.repeat(64),
        sizeBytes: 1_200_000,
        displayName: 'astros-esp 1.4.0 (lolin_d32_pro)',
      },
      path: cached.path,
    });
    expect(cache.fetch).toHaveBeenCalledWith(release, release.assets[0]);
    expect(upload.latest).not.toHaveBeenCalled();
  });

  it('matches by tag form (operator submits "v1.4.0")', async () => {
    const release = makeRelease();
    const cache = { fetch: vi.fn().mockResolvedValue(makeCachedAsset()) };
    const upload = { latest: vi.fn() };
    const releaseService = { getReleases: vi.fn().mockResolvedValue(makeReleaseList([release])) };
    const request: FlashRequest = { source: { kind: 'github', version: 'v1.4.0' } };

    const result = await resolveFlashSource(
      request,
      cache,
      upload,
      releaseService,
      'lolin_d32_pro',
    );

    expect(result.source.kind).toBe('github');
    expect(cache.fetch).toHaveBeenCalledTimes(1);
  });

  it('throws release_not_found when no release matches the requested version', async () => {
    const cache = { fetch: vi.fn() };
    const upload = { latest: vi.fn() };
    const releaseService = {
      getReleases: vi
        .fn()
        .mockResolvedValue(makeReleaseList([makeRelease({ tag: 'v1.3.0', version: '1.3.0' })])),
    };
    const request: FlashRequest = { source: { kind: 'github', version: '1.4.0' } };

    await expect(
      resolveFlashSource(request, cache, upload, releaseService, 'lolin_d32_pro'),
    ).rejects.toThrow('release_not_found');
    expect(cache.fetch).not.toHaveBeenCalled();
  });

  it('throws asset_not_found when the matched release has no asset for the variant', async () => {
    // Release exists for the requested version, but only ships a metro_s3
    // asset; the controllers' uniform variant is lolin_d32_pro.
    const release = makeRelease({ assets: [makeAsset({ variant: 'metro_s3' })] });
    const cache = { fetch: vi.fn() };
    const upload = { latest: vi.fn() };
    const releaseService = { getReleases: vi.fn().mockResolvedValue(makeReleaseList([release])) };
    const request: FlashRequest = { source: { kind: 'github', version: '1.4.0' } };

    await expect(
      resolveFlashSource(request, cache, upload, releaseService, 'lolin_d32_pro'),
    ).rejects.toThrow('asset_not_found');
    expect(cache.fetch).not.toHaveBeenCalled();
  });

  it('propagates releaseService.getReleases rejection', async () => {
    const cache = { fetch: vi.fn() };
    const upload = { latest: vi.fn() };
    const releaseService = {
      getReleases: vi.fn().mockRejectedValue(new Error('upstream_offline')),
    };
    const request: FlashRequest = { source: { kind: 'github', version: '1.4.0' } };

    await expect(
      resolveFlashSource(request, cache, upload, releaseService, 'lolin_d32_pro'),
    ).rejects.toThrow('upstream_offline');
  });

  it('propagates cache.fetch rejection', async () => {
    const release = makeRelease();
    const cache = { fetch: vi.fn().mockRejectedValue(new Error('cache_io_failed')) };
    const upload = { latest: vi.fn() };
    const releaseService = { getReleases: vi.fn().mockResolvedValue(makeReleaseList([release])) };
    const request: FlashRequest = { source: { kind: 'github', version: '1.4.0' } };

    await expect(
      resolveFlashSource(request, cache, upload, releaseService, 'lolin_d32_pro'),
    ).rejects.toThrow('cache_io_failed');
  });
});

// --- upload source path -----------------------------------------------------

describe('resolveFlashSource — upload source', () => {
  it('returns ResolvedFlashSource with kind=upload, displayName from originalFilename, and path', async () => {
    const stored = makeStoredUpload();
    const cache = { fetch: vi.fn() };
    const upload = { latest: vi.fn().mockResolvedValue(stored) };
    const releaseService = { getReleases: vi.fn() };
    const request: FlashRequest = { source: { kind: 'upload' } };

    // Variant arg is ignored for upload — operator-uploaded artifact is
    // operator-responsibility per the c.6c.1 plan. We pass a value that
    // doesn't appear in any release/asset to make this concrete.
    const result = await resolveFlashSource(
      request,
      cache,
      upload,
      releaseService,
      'unrelated_variant',
    );

    expect(result).toEqual({
      source: {
        kind: 'upload',
        version: '1.5.0-dev',
        sha256: 'b'.repeat(64),
        sizeBytes: 950_000,
        displayName: 'my-custom-build.bin',
      },
      path: stored.path,
    });
    expect(releaseService.getReleases).not.toHaveBeenCalled();
    expect(cache.fetch).not.toHaveBeenCalled();
  });

  it('throws no_upload when upload.latest returns null', async () => {
    const cache = { fetch: vi.fn() };
    const upload = { latest: vi.fn().mockResolvedValue(null) };
    const releaseService = { getReleases: vi.fn() };
    const request: FlashRequest = { source: { kind: 'upload' } };

    await expect(
      resolveFlashSource(request, cache, upload, releaseService, 'lolin_d32_pro'),
    ).rejects.toThrow('no_upload');
  });

  it('propagates upload.latest rejection', async () => {
    const cache = { fetch: vi.fn() };
    const upload = { latest: vi.fn().mockRejectedValue(new Error('upload_io_failed')) };
    const releaseService = { getReleases: vi.fn() };
    const request: FlashRequest = { source: { kind: 'upload' } };

    await expect(
      resolveFlashSource(request, cache, upload, releaseService, 'lolin_d32_pro'),
    ).rejects.toThrow('upload_io_failed');
  });
});

// --- createFlashProgressThrottle -------------------------------------------

describe('createFlashProgressThrottle', () => {
  // Per c.6b chunk_streamer.test.ts pattern (see CLAUDE memory): fake only
  // setTimeout/clearTimeout, leaving Date un-faked. We deviate from a literal
  // `Date.now()` mockClock here because under that toFake list,
  // `vi.advanceTimersByTime` does NOT advance the system clock — so a flush
  // timer would fire with `Date.now()` still reporting the pre-arm time, and
  // the throttle's window math would silently drift from the timer queue.
  // Instead, mockClock reads from a counter that the `advance()` helper
  // bumps in lockstep with the fake-timer queue.
  let nowMs = 0;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    nowMs = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Advances both the fake-timer queue AND mockClock's counter by `ms`.
  function advance(ms: number): void {
    nowMs += ms;
    vi.advanceTimersByTime(ms);
  }

  // mockClock hands a counter-backed `now()` and the globally-faked
  // setTimeout/clearTimeout to the throttle. The throttle never sees
  // vitest internals — it just sees a Clock.
  const mockClock: Clock = {
    now: () => nowMs,
    setTimeout: (cb, ms) => globalThis.setTimeout(cb, ms),
    clearTimeout: (t) => globalThis.clearTimeout(t),
  };

  // Minimal canned states. `bytesSent` is the only field tests use to
  // distinguish updates — keeping the rest constant makes the assertions
  // about *what was emitted* trivial.
  function uploadingState(controllerId: string, bytesSent: number): ControllerFlashState {
    return {
      controllerId,
      stage: FwStage.UploadingToMaster,
      bytesSent,
      totalBytes: 1000,
      detail: '',
    };
  }

  it('leading edge: first submit emits immediately', () => {
    const emit = vi.fn();
    const throttle = createFlashProgressThrottle({ emit, windowMs: 250, clock: mockClock });

    throttle.submit('a', uploadingState('a', 100));

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(uploadingState('a', 100));
  });

  it('mid-window: second submit within windowMs does NOT emit; pending stored', () => {
    const emit = vi.fn();
    const throttle = createFlashProgressThrottle({ emit, windowMs: 250, clock: mockClock });

    throttle.submit('a', uploadingState('a', 100));
    expect(emit).toHaveBeenCalledTimes(1);

    advance(50);
    throttle.submit('a', uploadingState('a', 200));

    // Still just the leading-edge emit; second one is pending.
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('mid-window flush: advancing fake time by windowMs flushes pending', () => {
    const emit = vi.fn();
    const throttle = createFlashProgressThrottle({ emit, windowMs: 250, clock: mockClock });

    throttle.submit('a', uploadingState('a', 100));
    advance(50);
    throttle.submit('a', uploadingState('a', 200));
    advance(50);
    // Latest in-window state — overwrites the pending entry, no re-arm.
    throttle.submit('a', uploadingState('a', 300));

    // Advance to the end of the window — flush timer fires, emits the
    // most-recent pending state (300), not the older 200.
    advance(150);

    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenNthCalledWith(2, uploadingState('a', 300));
  });

  it('mid-window with force=true: emits immediately, clears pending, resets lastEmittedAt', () => {
    const emit = vi.fn();
    const throttle = createFlashProgressThrottle({ emit, windowMs: 250, clock: mockClock });

    throttle.submit('a', uploadingState('a', 100));
    advance(50);
    throttle.submit('a', uploadingState('a', 200)); // pending
    expect(emit).toHaveBeenCalledTimes(1);

    // Force-emit a stage transition.
    throttle.submit('a', uploadingState('a', 250), true);
    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenNthCalledWith(2, uploadingState('a', 250));

    // Pending was cleared — advancing past the original window must not
    // re-emit the stale 200 state.
    advance(500);
    expect(emit).toHaveBeenCalledTimes(2);
  });

  it('per-controller independence: A submits do not affect B window', () => {
    const emit = vi.fn();
    const throttle = createFlashProgressThrottle({ emit, windowMs: 250, clock: mockClock });

    throttle.submit('a', uploadingState('a', 100));
    expect(emit).toHaveBeenCalledTimes(1);

    // B has no prior emission — its leading edge fires immediately even
    // though A is mid-window.
    throttle.submit('b', uploadingState('b', 50));
    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenNthCalledWith(2, uploadingState('b', 50));

    // A is still throttled.
    advance(10);
    throttle.submit('a', uploadingState('a', 110));
    expect(emit).toHaveBeenCalledTimes(2);

    // B is also throttled now.
    throttle.submit('b', uploadingState('b', 60));
    expect(emit).toHaveBeenCalledTimes(2);
  });

  it('dispose: clears any scheduled flush timers', () => {
    const emit = vi.fn();
    const throttle = createFlashProgressThrottle({ emit, windowMs: 250, clock: mockClock });

    throttle.submit('a', uploadingState('a', 100));
    advance(50);
    throttle.submit('a', uploadingState('a', 200)); // arms a flush timer
    throttle.submit('b', uploadingState('b', 50));
    advance(50);
    throttle.submit('b', uploadingState('b', 75)); // arms another

    expect(vi.getTimerCount()).toBeGreaterThan(0);

    throttle.dispose();

    expect(vi.getTimerCount()).toBe(0);

    // After dispose, advancing time must not call emit (the leading edges
    // were the only emits, and the flush timers are gone).
    const beforeAdvance = emit.mock.calls.length;
    advance(1000);
    expect(emit).toHaveBeenCalledTimes(beforeAdvance);
  });

  it('dispose is idempotent', () => {
    const emit = vi.fn();
    const throttle = createFlashProgressThrottle({ emit, windowMs: 250, clock: mockClock });

    throttle.submit('a', uploadingState('a', 100));
    throttle.dispose();
    expect(() => throttle.dispose()).not.toThrow();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('terminal-transition pattern: submit after force=true is throttled within windowMs', () => {
    // This proves force=true correctly stamps lastEmittedAt — if it didn't,
    // a follow-up `submit(force=false)` immediately after would treat the
    // controller as never-emitted and fire a leading edge.
    const emit = vi.fn();
    const throttle = createFlashProgressThrottle({ emit, windowMs: 250, clock: mockClock });

    // Force-emit a stage transition (e.g., UploadingToMaster -> Sending).
    throttle.submit('a', uploadingState('a', 500), true);
    expect(emit).toHaveBeenCalledTimes(1);

    // Mid-stage progress fires shortly after. Must be throttled, not
    // a fresh leading edge.
    advance(10);
    throttle.submit('a', uploadingState('a', 510));
    expect(emit).toHaveBeenCalledTimes(1);

    // And the pending state flushes when the window elapses.
    advance(240);
    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenNthCalledWith(2, uploadingState('a', 510));
  });

  // Mutation-discipline tests for the flush() cleanup path. Without these,
  // reverting `pending.delete(controllerId)` or `scheduledTimer.delete(controllerId)`
  // in flush() would leave latent bugs masked by other test paths' overwrites.

  it('post-flush re-arm: pending consumed AND a new in-window submit arms a fresh timer', () => {
    // Reverting EITHER `pending.delete(controllerId)` OR
    // `scheduledTimer.delete(controllerId)` in flush() makes this fail.
    // The combined post-flush test catches both cleanup-on-flush invariants.
    const emit = vi.fn();
    const throttle = createFlashProgressThrottle({ emit, windowMs: 250, clock: mockClock });

    throttle.submit('a', uploadingState('a', 100)); // leading edge at t=0
    advance(50);
    throttle.submit('a', uploadingState('a', 200)); // pending, timer at t=250
    advance(200); // t=250 → flush emits 200, clears pending + scheduledTimer
    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenNthCalledWith(2, uploadingState('a', 200));

    advance(50); // t=300, mid-window of the just-emitted 200
    throttle.submit('a', uploadingState('a', 300)); // must arm a NEW timer (stale handle bug)
    advance(200); // t=500, new timer fires
    expect(emit).toHaveBeenCalledTimes(3);
    expect(emit).toHaveBeenNthCalledWith(3, uploadingState('a', 300));

    // Mutation defense: more time elapsing must NOT re-emit a stale 200
    // (would happen if pending.delete in flush() were reverted).
    advance(500);
    expect(emit).toHaveBeenCalledTimes(3);
  });

  it('idempotent re-arm: multiple in-window submits do not stack flush timers', () => {
    // Reverting `if (scheduledTimer.has(controllerId)) return;` makes this fail —
    // every in-window submit would register a new setTimeout, leaking handles
    // and potentially firing flush multiple times for one window.
    const emit = vi.fn();
    const throttle = createFlashProgressThrottle({ emit, windowMs: 250, clock: mockClock });

    throttle.submit('a', uploadingState('a', 100)); // leading edge
    advance(10);
    throttle.submit('a', uploadingState('a', 200)); // arms ONE timer
    expect(vi.getTimerCount()).toBe(1);

    throttle.submit('a', uploadingState('a', 250)); // must NOT add a 2nd timer
    throttle.submit('a', uploadingState('a', 275)); // still must NOT add a 2nd timer
    expect(vi.getTimerCount()).toBe(1);
  });
});

// --- FlashJobOrchestrator ---------------------------------------------------

describe('FlashJobOrchestrator', () => {
  // FakeSerialBus mirrors the c.6b chunk_streamer.test pattern: record every
  // `send`, expose maps keyed by transferId for both ack and deploy-event
  // subscribers, and offer test-only `deliver`/`deliverDeployEvent` helpers
  // for invoking the registered handlers. Task 6's tests don't drive deploy
  // events (no-op observer + placeholder deploy phase), but the surface is
  // here so Tasks 7+8 can extend without re-doing the fixture.
  type SendKind = Parameters<SerialBus['send']>[1]['kind'];

  class FakeSerialBus implements SerialBus {
    readonly sent: Array<{ payload: string; kind: SendKind }> = [];
    readonly ackSubscribers = new Map<string, (ack: FwInboundAck) => void>();
    readonly deploySubscribers = new Map<string, (event: FwDeployEvent) => void>();

    send(payload: string, opts: { kind: SendKind }): void {
      this.sent.push({ payload, kind: opts.kind });
    }

    subscribeFwAcks(transferId: string, handler: (ack: FwInboundAck) => void): () => void {
      this.ackSubscribers.set(transferId, handler);
      return () => {
        this.ackSubscribers.delete(transferId);
      };
    }

    subscribeDeployEvents(transferId: string, handler: (event: FwDeployEvent) => void): () => void {
      this.deploySubscribers.set(transferId, handler);
      return () => {
        this.deploySubscribers.delete(transferId);
      };
    }

    deliver(transferId: string, ack: FwInboundAck): void {
      const handler = this.ackSubscribers.get(transferId);
      if (!handler) throw new Error(`no ack subscriber for ${transferId}`);
      handler(ack);
    }

    deliverDeployEvent(transferId: string, event: FwDeployEvent): void {
      const handler = this.deploySubscribers.get(transferId);
      if (!handler) throw new Error(`no deploy subscriber for ${transferId}`);
      handler(event);
    }
  }

  // Scripted streamer factory: returns a Streamer whose `run()` resolves /
  // rejects on test demand. The first `run()` call captures the `spec` +
  // `observer` + `signal` for assertion; subsequent calls are unexpected
  // (Task 6 is single-shot per orchestrator instance).
  interface ScriptedStreamerControls {
    runs: Array<{ spec: TransferSpec; observer: StreamObserver; signal?: AbortSignal }>;
    resolve: (result: TransferResult) => void;
    reject: (err: Error) => void;
    settled: boolean;
  }

  function makeScriptedStreamer(): {
    factory: (opts: { bus: SerialBus }) => Streamer;
    controls: ScriptedStreamerControls;
  } {
    const controls: ScriptedStreamerControls = {
      runs: [],
      // Set in factory.run; placeholders keep TS happy.
      resolve: () => {
        throw new Error('streamer.run not yet called');
      },
      reject: () => {
        throw new Error('streamer.run not yet called');
      },
      settled: false,
    };
    const factory = (_opts: { bus: SerialBus }): Streamer => ({
      run: (spec, observer, opts) => {
        controls.runs.push({ spec, observer, signal: opts?.signal });
        return new Promise<TransferResult>((resolve, reject) => {
          controls.resolve = (r) => {
            controls.settled = true;
            resolve(r);
          };
          controls.reject = (e) => {
            controls.settled = true;
            reject(e);
          };
        });
      },
    });
    return { factory, controls };
  }

  // Canned TransferResult — Task 6 doesn't inspect the result fields, but
  // we need a valid shape because the orchestrator awaits the promise.
  function makeTransferResult(spec: TransferSpec): TransferResult {
    return {
      transferId: spec.transferId,
      totalBytesSent: spec.source.sizeBytes,
      totalChunks: 1,
      durationMs: 100,
      endAck: {
        transferId: spec.transferId,
        status: 'OK',
        computedSha256Hex: spec.source.sha256,
      },
    };
  }

  // Minimal real-time clock — Task 6 doesn't need fake timers (Tasks 8/9 will).
  // Wrapping `Date.now()` keeps every `startedAt` / `endedAt` strictly
  // monotonic across the test (each call advances the wall clock by at
  // least the JS event-loop tick), so any test that asserts on those
  // timestamps gets reproducible non-equal values.
  const realClock: Clock = {
    now: () => Date.now(),
    setTimeout: (cb, ms) => globalThis.setTimeout(cb, ms),
    clearTimeout: (t) => globalThis.clearTimeout(t),
  };

  // Factory for the standard "happy-path" orchestrator + fakes. Each test
  // either uses these defaults or overrides one fake (e.g.,
  // `controllersStore.listInLocation` resolving to `[]` for the
  // no_controllers test). The setup is parameterized so the same helper
  // covers github + upload sources without copy-pasting.
  interface SetupOpts {
    controllers?: Array<{ id: string; variant: string }>;
    request?: FlashRequest;
    cachedAsset?: CachedAsset;
    storedUpload?: StoredUpload | null;
    releases?: ReleaseInfo[];
    controllersStoreError?: Error;
  }

  function setupHappyPath(opts: SetupOpts = {}) {
    const controllers = opts.controllers ?? [
      { id: 'controller-a', variant: 'lolin_d32_pro' },
      { id: 'controller-b', variant: 'lolin_d32_pro' },
    ];
    const cachedAsset = opts.cachedAsset ?? makeCachedAsset();
    const storedUpload = opts.storedUpload === undefined ? makeStoredUpload() : opts.storedUpload;
    const releases = opts.releases ?? [makeRelease()];
    const request: FlashRequest = opts.request ?? { source: { kind: 'github', version: '1.4.0' } };

    const bus = new FakeSerialBus();
    const cache = { fetch: vi.fn().mockResolvedValue(cachedAsset) };
    const upload = { latest: vi.fn().mockResolvedValue(storedUpload) };
    const releaseService = {
      getReleases: vi.fn().mockResolvedValue(makeReleaseList(releases)),
    };
    const controllersStore = {
      listInLocation: opts.controllersStoreError
        ? vi.fn().mockRejectedValue(opts.controllersStoreError)
        : vi.fn().mockResolvedValue(controllers),
    };
    const emitWs = vi.fn<[FlashOrchestratorWsMessage], void>();
    const jobLock = new JobLock();
    const { factory: streamerFactory, controls: streamerControls } = makeScriptedStreamer();

    const orchestrator = new FlashJobOrchestrator({
      bus,
      jobLock,
      cache,
      upload,
      releaseService,
      controllersStore,
      emitWs,
      streamerFactory,
      clock: realClock,
    });

    return {
      orchestrator,
      bus,
      cache,
      upload,
      releaseService,
      controllersStore,
      emitWs,
      jobLock,
      streamerControls,
      request,
      controllers,
      cachedAsset,
      storedUpload,
    };
  }

  // Convenience: filter the emitWs calls down to a specific event type.
  function emittedFrames(
    emitWs: ReturnType<typeof vi.fn>,
    type: TransmissionType,
  ): FlashOrchestratorWsMessage[] {
    return emitWs.mock.calls
      .map((call) => call[0] as FlashOrchestratorWsMessage)
      .filter((msg) => msg.type === type);
  }

  it('happy path (github source): acquires lock, resolves source, runs streamer, emits lifecycle events, releases lock', async () => {
    const fx = setupHappyPath();

    const startPromise = fx.orchestrator.start(fx.request);

    // Streamer.run was invoked synchronously after the source resolved. Wait
    // for the resolver chain to settle by yielding the microtask queue, then
    // resolve the streamer's promise to drive the orchestrator to completion.
    await vi.waitFor(() => expect(fx.streamerControls.runs.length).toBe(1));
    const { spec } = fx.streamerControls.runs[0];
    fx.streamerControls.resolve(makeTransferResult(spec));

    const result = await startPromise;

    // Return value carries jobId, transferId, source, targets.
    expect(result.jobId).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.transferId).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.source).toEqual({
      kind: 'github',
      version: '1.4.0',
      sha256: fx.cachedAsset.sha256,
      sizeBytes: fx.cachedAsset.sizeBytes,
      displayName: 'astros-esp 1.4.0 (lolin_d32_pro)',
    });
    expect(result.targets).toEqual(['controller-a', 'controller-b']);

    // TransferSpec carried both the on-disk path (from CachedAsset) and the
    // controllers' IDs as targets.
    expect(spec.source.path).toBe(fx.cachedAsset.path);
    expect(spec.source.sha256).toBe(fx.cachedAsset.sha256);
    expect(spec.source.sizeBytes).toBe(fx.cachedAsset.sizeBytes);
    expect(spec.targets).toEqual(['controller-a', 'controller-b']);
    expect(spec.transferId).toBe(result.transferId);

    // Source path under streamer is on disk; resolver returns it via the
    // ResolvedFlashSource intermediate so the operator-facing `source`
    // shape never carries `path`.
    expect((result.source as unknown as { path?: string }).path).toBeUndefined();

    // WS lifecycle: lockStateChanged (acquire) → flashJobStarted →
    // flashJobDone → lockStateChanged (release). Order matters.
    const types = fx.emitWs.mock.calls.map((c) => (c[0] as FlashOrchestratorWsMessage).type);
    expect(types).toEqual([
      TransmissionType.lockStateChanged,
      TransmissionType.flashJobStarted,
      TransmissionType.flashJobDone,
      TransmissionType.lockStateChanged,
    ]);

    // flashJobStarted carries the full FlashJobState with all controllers
    // initially Queued.
    const startedFrames = emittedFrames(fx.emitWs, TransmissionType.flashJobStarted);
    expect(startedFrames).toHaveLength(1);
    const startedData = (
      startedFrames[0] as { data: { jobId: string; controllers: ControllerFlashState[] } }
    ).data;
    expect(startedData.jobId).toBe(result.jobId);
    expect(startedData.controllers).toEqual([
      {
        controllerId: 'controller-a',
        stage: FwStage.Queued,
        bytesSent: 0,
        totalBytes: fx.cachedAsset.sizeBytes,
        detail: '',
      },
      {
        controllerId: 'controller-b',
        stage: FwStage.Queued,
        bytesSent: 0,
        totalBytes: fx.cachedAsset.sizeBytes,
        detail: '',
      },
    ]);

    // flashJobDone carries jobId + endedAt.
    const doneFrames = emittedFrames(fx.emitWs, TransmissionType.flashJobDone);
    expect(doneFrames).toHaveLength(1);
    const doneData = (doneFrames[0] as { data: { jobId: string; endedAt: string } }).data;
    expect(doneData.jobId).toBe(result.jobId);
    expect(typeof doneData.endedAt).toBe('string');

    // Lock acquired then released: getOwner is null at end; both
    // lockStateChanged frames reflect the transitions.
    const lockFrames = emittedFrames(fx.emitWs, TransmissionType.lockStateChanged);
    expect(lockFrames).toHaveLength(2);
    expect((lockFrames[0] as unknown as { locked: boolean; owner: string }).locked).toBe(true);
    expect((lockFrames[0] as unknown as { locked: boolean; owner: string }).owner).toBe(
      result.jobId,
    );
    expect((lockFrames[1] as unknown as { locked: boolean; owner: string | null }).locked).toBe(
      false,
    );
    expect((lockFrames[1] as unknown as { locked: boolean; owner: string | null }).owner).toBe(
      null,
    );

    // After release: lock free, currentJob null.
    expect(fx.jobLock.isLocked()).toBe(false);
    expect(fx.orchestrator.getCurrentJob()).toBeNull();
  });

  it('happy path (upload source): displayName comes from upload originalFilename', async () => {
    const fx = setupHappyPath({ request: { source: { kind: 'upload' } } });

    const startPromise = fx.orchestrator.start(fx.request);
    await vi.waitFor(() => expect(fx.streamerControls.runs.length).toBe(1));
    const { spec } = fx.streamerControls.runs[0];
    fx.streamerControls.resolve(makeTransferResult(spec));

    const result = await startPromise;

    expect(result.source).toEqual({
      kind: 'upload',
      version: '1.5.0-dev',
      sha256: 'b'.repeat(64),
      sizeBytes: 950_000,
      displayName: 'my-custom-build.bin',
    });
    expect(spec.source.path).toBe(fx.storedUpload?.path);

    // Releases service is unused on the upload path.
    expect(fx.releaseService.getReleases).not.toHaveBeenCalled();
    expect(fx.cache.fetch).not.toHaveBeenCalled();
  });

  it('concurrent start: second start while lock held throws job_already_running with currentJobId', async () => {
    const fx = setupHappyPath();

    // Kick off the first job; do NOT settle the streamer so the lock is held.
    const firstStart = fx.orchestrator.start(fx.request);
    await vi.waitFor(() => expect(fx.streamerControls.runs.length).toBe(1));

    // The first start has acquired the lock and emitted flashJobStarted by now.
    // currentJob holds the in-flight state; getOwner() carries the first job's id.
    const firstJobId = fx.jobLock.getOwner();
    expect(firstJobId).not.toBeNull();
    const inflight = fx.orchestrator.getCurrentJob();
    expect(inflight).not.toBeNull();

    // Second start fails synchronously at the lock gate.
    let caught: unknown;
    try {
      await fx.orchestrator.start(fx.request);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(FlashOrchestratorError);
    expect((caught as FlashOrchestratorError).reason).toBe('job_already_running');
    expect((caught as FlashOrchestratorError).currentJobId).toBe(firstJobId);

    // First job state untouched by the rejection — same currentJob, still in flight.
    expect(fx.orchestrator.getCurrentJob()).toBe(inflight);

    // Drain the first job so the test doesn't leave a dangling promise.
    fx.streamerControls.resolve(makeTransferResult(fx.streamerControls.runs[0].spec));
    await firstStart;
  });

  it('rejects with no_controllers when controllersStore returns empty list; lock released, currentJob never set', async () => {
    const fx = setupHappyPath({ controllers: [] });

    let caught: unknown;
    try {
      await fx.orchestrator.start(fx.request);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(FlashOrchestratorError);
    expect((caught as FlashOrchestratorError).reason).toBe('no_controllers');

    expect(fx.orchestrator.getCurrentJob()).toBeNull();
    expect(fx.jobLock.isLocked()).toBe(false);

    // No flashJobStarted should have been emitted (we never built a state).
    expect(emittedFrames(fx.emitWs, TransmissionType.flashJobStarted)).toHaveLength(0);
    // But we did acquire+release the lock, so two lockStateChanged frames.
    expect(emittedFrames(fx.emitWs, TransmissionType.lockStateChanged)).toHaveLength(2);
  });

  it('rejects with variant_mismatch when controllers have differing variants; detail enumerates pairs', async () => {
    const fx = setupHappyPath({
      controllers: [
        { id: 'controller-a', variant: 'lolin_d32_pro' },
        { id: 'controller-b', variant: 'metro_s3' },
      ],
    });

    let caught: unknown;
    try {
      await fx.orchestrator.start(fx.request);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(FlashOrchestratorError);
    expect((caught as FlashOrchestratorError).reason).toBe('variant_mismatch');
    // Detail must surface BOTH offending pairs so the operator can see which is wrong.
    const detail = (caught as FlashOrchestratorError).detail ?? '';
    expect(detail).toContain('controller-a=lolin_d32_pro');
    expect(detail).toContain('controller-b=metro_s3');

    expect(fx.orchestrator.getCurrentJob()).toBeNull();
    expect(fx.jobLock.isLocked()).toBe(false);
  });

  it('rejects with variant_unknown when one controller has empty variant; detail names the controllerId', async () => {
    const fx = setupHappyPath({
      controllers: [
        { id: 'controller-a', variant: 'lolin_d32_pro' },
        { id: 'controller-b', variant: '' },
      ],
    });

    let caught: unknown;
    try {
      await fx.orchestrator.start(fx.request);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(FlashOrchestratorError);
    expect((caught as FlashOrchestratorError).reason).toBe('variant_unknown');
    expect((caught as FlashOrchestratorError).detail).toContain('controller-b');

    expect(fx.orchestrator.getCurrentJob()).toBeNull();
    expect(fx.jobLock.isLocked()).toBe(false);
  });

  it('rejects with asset_not_found when github source has no asset matching variant', async () => {
    // Release exists, but its only asset is metro_s3; controllers report
    // lolin_d32_pro → mismatch surfaced as asset_not_found.
    const release = makeRelease({ assets: [makeAsset({ variant: 'metro_s3' })] });
    const fx = setupHappyPath({ releases: [release] });

    let caught: unknown;
    try {
      await fx.orchestrator.start(fx.request);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(FlashOrchestratorError);
    expect((caught as FlashOrchestratorError).reason).toBe('asset_not_found');

    expect(fx.orchestrator.getCurrentJob()).toBeNull();
    expect(fx.jobLock.isLocked()).toBe(false);
  });

  it('rejects with release_not_found when github request version matches no release', async () => {
    const fx = setupHappyPath({
      releases: [makeRelease({ tag: 'v1.3.0', version: '1.3.0' })],
      request: { source: { kind: 'github', version: '1.4.0' } },
    });

    let caught: unknown;
    try {
      await fx.orchestrator.start(fx.request);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(FlashOrchestratorError);
    expect((caught as FlashOrchestratorError).reason).toBe('release_not_found');

    expect(fx.orchestrator.getCurrentJob()).toBeNull();
    expect(fx.jobLock.isLocked()).toBe(false);
  });

  it('rejects with no_upload when upload source returns null', async () => {
    const fx = setupHappyPath({
      request: { source: { kind: 'upload' } },
      storedUpload: null,
    });

    let caught: unknown;
    try {
      await fx.orchestrator.start(fx.request);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(FlashOrchestratorError);
    expect((caught as FlashOrchestratorError).reason).toBe('no_upload');

    expect(fx.orchestrator.getCurrentJob()).toBeNull();
    expect(fx.jobLock.isLocked()).toBe(false);
  });

  it('rejects with source_resolution_failed when releaseService rejects (Task 11 will refine to release_lookup_failed)', async () => {
    const fx = setupHappyPath();
    fx.releaseService.getReleases.mockRejectedValue(new Error('upstream_offline'));

    let caught: unknown;
    try {
      await fx.orchestrator.start(fx.request);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(FlashOrchestratorError);
    expect((caught as FlashOrchestratorError).reason).toBe('source_resolution_failed');
    expect((caught as FlashOrchestratorError).detail).toBe('upstream_offline');

    expect(fx.orchestrator.getCurrentJob()).toBeNull();
    expect(fx.jobLock.isLocked()).toBe(false);
  });

  it('streamer rejection: lock released, currentJob cleared, error propagates (Task 11 will map to typed reasons)', async () => {
    const fx = setupHappyPath();
    const startPromise = fx.orchestrator.start(fx.request);
    await vi.waitFor(() => expect(fx.streamerControls.runs.length).toBe(1));

    // currentJob is set before streamer.run resolves.
    expect(fx.orchestrator.getCurrentJob()).not.toBeNull();

    fx.streamerControls.reject(new Error('begin_timeout'));

    await expect(startPromise).rejects.toThrow('begin_timeout');

    expect(fx.orchestrator.getCurrentJob()).toBeNull();
    expect(fx.jobLock.isLocked()).toBe(false);
    // lockStateChanged still fired twice (acquire + release).
    expect(emittedFrames(fx.emitWs, TransmissionType.lockStateChanged)).toHaveLength(2);
    // flashJobDone is NOT emitted on streamer failure.
    expect(emittedFrames(fx.emitWs, TransmissionType.flashJobDone)).toHaveLength(0);
  });

  it('getCurrentJob: returns in-flight state mid-flow, null after release', async () => {
    const fx = setupHappyPath();

    expect(fx.orchestrator.getCurrentJob()).toBeNull();

    const startPromise = fx.orchestrator.start(fx.request);
    await vi.waitFor(() => expect(fx.streamerControls.runs.length).toBe(1));

    // Mid-flow: streamer hasn't resolved yet; currentJob exposes the
    // initial Queued state.
    const inflight = fx.orchestrator.getCurrentJob();
    expect(inflight).not.toBeNull();
    expect(inflight?.controllers).toHaveLength(2);
    expect(inflight?.controllers.every((c) => c.stage === FwStage.Queued)).toBe(true);
    expect(inflight?.endedAt).toBeUndefined();

    // Drive to completion.
    fx.streamerControls.resolve(makeTransferResult(fx.streamerControls.runs[0].spec));
    await startPromise;

    expect(fx.orchestrator.getCurrentJob()).toBeNull();
  });
});
