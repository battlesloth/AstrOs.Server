import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createFlashProgressThrottle,
  FlashJobOrchestrator,
  FlashOrchestratorError,
  resolveFlashSource,
  type FlashOrchestratorWsMessage,
} from './flash_orchestrator.js';
import type { Clock, FlashRequest, Streamer } from '../models/firmware/flash_orchestrator.js';
import type { ControllerFlashState, FlashJobState } from '../models/firmware/flash_job_state.js';
import { FwStage } from '../models/firmware/firmware_messages.js';
import type { AssetInfo, ReleaseInfo, ReleaseListResult } from '../models/firmware/release.js';
import type { CachedAsset } from '../models/firmware/cache.js';
import type { StoredUpload } from '../models/firmware/upload.js';
import type {
  FwInboundAck,
  SerialBus,
  StreamObserver,
  TransferErrorCode,
  TransferResult,
  TransferSpec,
} from '../models/firmware/chunk_streamer.js';
import { TransferError } from '../models/firmware/chunk_streamer.js';
import type { FwDeployEvent } from '../models/firmware/flash_orchestrator.js';
import { JobLock } from '../job_lock/job_lock.js';
import { logger } from '../logger.js';
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

  it('reads clock.now() at most once per submit() (single-snapshot invariant)', () => {
    // Per PR feedback: if submit() reads clock.now() multiple times, the
    // clock could drift across the window boundary between reads, producing
    // an immediate flush via setTimeout(0) and an extra emission. Capturing
    // `now` once at the top of submit() keeps elapsed/remaining/lastEmittedAt
    // internally consistent. This test pins the invariant by spying the
    // clock and asserting exactly one read per submit, across all three
    // branches (leading-edge, in-window, force).
    const nowSpy = vi.fn().mockReturnValue(0);
    const driftDetector: Clock = {
      now: nowSpy,
      setTimeout: (cb, ms) => globalThis.setTimeout(cb, ms),
      clearTimeout: (t) => globalThis.clearTimeout(t),
    };
    const emit = vi.fn();
    const throttle = createFlashProgressThrottle({
      emit,
      windowMs: 250,
      clock: driftDetector,
    });

    // Leading-edge branch: empty lastEmittedAt → emit, set lastEmittedAt.
    throttle.submit('a', uploadingState('a', 100));
    expect(nowSpy).toHaveBeenCalledTimes(1);

    // In-window branch: pending stash + arm timer (no emit).
    nowSpy.mockClear();
    nowSpy.mockReturnValue(50); // 50ms after leading edge — still in window
    throttle.submit('a', uploadingState('a', 200));
    expect(nowSpy).toHaveBeenCalledTimes(1);

    // Force branch: cancel pending + emit + set lastEmittedAt.
    nowSpy.mockClear();
    nowSpy.mockReturnValue(60);
    throttle.submit('a', uploadingState('a', 300), true);
    expect(nowSpy).toHaveBeenCalledTimes(1);

    throttle.dispose();
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
  // `controllersStore.listFlashTargets` resolving to `[]` for the
  // no_controllers test). The setup is parameterized so the same helper
  // covers github + upload sources without copy-pasting. The optional
  // `clock` lets fake-timer-driven tests (deploy phase, throttle) inject
  // a counter-backed Clock — same pattern the upload-phase observer block
  // used to fork into a separate `setupWithFakeClock`; folding the
  // parameter through the shared helper avoids the duplicate.
  interface SetupOpts {
    controllers?: Array<{ id: string; variant: string | undefined }>;
    request?: FlashRequest;
    cachedAsset?: CachedAsset;
    storedUpload?: StoredUpload | null;
    releases?: ReleaseInfo[];
    controllersStoreError?: Error;
    clock?: Clock;
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
      listFlashTargets: opts.controllersStoreError
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
      clock: opts.clock ?? realClock,
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

  it('happy path (github source): acquires lock, resolves source, runs streamer, sends FW_DEPLOY_BEGIN, arms deploy subscriber', async () => {
    const fx = setupHappyPath();

    const startPromise = fx.orchestrator.start(fx.request);

    // Streamer.run was invoked synchronously after the source resolved. Wait
    // for the resolver chain to settle by yielding the microtask queue, then
    // resolve the streamer's promise. After Task 8, start() resolves once
    // FW_DEPLOY_BEGIN has been sent and the deploy subscriber is armed; the
    // post-deploy lock release lives in Task 9.
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

    // FW_DEPLOY_BEGIN was sent on the firmware channel after streamer success.
    const deployBeginSends = fx.bus.sent.filter((s) => s.kind === 'firmware');
    expect(deployBeginSends).toHaveLength(1);
    expect(deployBeginSends[0].payload).toContain(result.transferId);

    // Deploy subscriber is armed on the transferId.
    expect(fx.bus.deploySubscribers.has(result.transferId)).toBe(true);

    // flashJobStarted emitted with controllers initially Queued.
    const startedFrames = emittedFrames(fx.emitWs, TransmissionType.flashJobStarted);
    expect(startedFrames).toHaveLength(1);
    const startedData = (
      startedFrames[0] as { data: { jobId: string; controllers: ControllerFlashState[] } }
    ).data;
    expect(startedData.jobId).toBe(result.jobId);

    // flashJobDone NOT yet emitted (deploy phase hasn't completed; Task 9
    // wires the post-FW_DEPLOY_DONE flashJobDone).
    expect(emittedFrames(fx.emitWs, TransmissionType.flashJobDone)).toHaveLength(0);

    // Lock acquired but not yet released (Task 9 wires the heartbeat-or-
    // timer release path); only one lockStateChanged frame so far.
    expect(emittedFrames(fx.emitWs, TransmissionType.lockStateChanged)).toHaveLength(1);
    expect(fx.jobLock.isLocked()).toBe(true);
    expect(fx.jobLock.getOwner()).toBe(result.jobId);
    expect(fx.orchestrator.getCurrentJob()).not.toBeNull();
  });

  it('happy path (upload source): displayName comes from upload originalFilename; FW_DEPLOY_BEGIN sent', async () => {
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

    // FW_DEPLOY_BEGIN sent + deploy subscriber armed for upload path too.
    expect(fx.bus.sent.filter((s) => s.kind === 'firmware')).toHaveLength(1);
    expect(fx.bus.deploySubscribers.has(result.transferId)).toBe(true);
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
    // And flashJobFailed must fire so WS consumers see the rejection.
    const failed = emittedFrames(fx.emitWs, TransmissionType.flashJobFailed);
    expect(failed).toHaveLength(1);
    expect(failed[0].data).toMatchObject({ reason: 'no_controllers' });
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
    const failed = emittedFrames(fx.emitWs, TransmissionType.flashJobFailed);
    expect(failed).toHaveLength(1);
    expect(failed[0].data).toMatchObject({ reason: 'variant_mismatch' });
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
    const failed = emittedFrames(fx.emitWs, TransmissionType.flashJobFailed);
    expect(failed).toHaveLength(1);
    expect(failed[0].data).toMatchObject({ reason: 'variant_unknown' });
  });

  it('rejects with variant_unknown when a controller has variant === undefined (production wiring path)', async () => {
    // Production data path: ControlModule.variant is optional and
    // handlePollAck leaves it undefined when firmware doesn't report one.
    // validateControllers must treat undefined the same as empty string —
    // otherwise the request would slip through to resolveFlashSource and
    // surface as a misleading asset_not_found.
    const fx = setupHappyPath({
      controllers: [
        { id: 'controller-a', variant: 'lolin_d32_pro' },
        { id: 'controller-b', variant: undefined },
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

    const failed = emittedFrames(fx.emitWs, TransmissionType.flashJobFailed);
    expect(failed).toHaveLength(1);
    expect(failed[0].data).toMatchObject({ reason: 'variant_unknown' });
  });

  it('rejects with variant_unknown when a controller variant is whitespace-only', async () => {
    // Defense-in-depth: a buggy cache layer (or hand-edited data) that
    // leaves whitespace where a variant should be must NOT slip through
    // as a "uniform variant of '   '" — that would also surface as
    // asset_not_found later. validateControllers trims first.
    const fx = setupHappyPath({
      controllers: [
        { id: 'controller-a', variant: 'lolin_d32_pro' },
        { id: 'controller-b', variant: '   ' },
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
  });

  it('trims surrounding whitespace from variant before uniformity check', async () => {
    // A populated-but-padded variant (e.g. firmware appending a newline)
    // should be treated as the trimmed value — both for the
    // uniformity check AND for the variant string passed to
    // resolveFlashSource. Otherwise '  lolin_d32_pro' and 'lolin_d32_pro'
    // would mis-fire as variant_mismatch despite identifying the same
    // hardware.
    const fx = setupHappyPath({
      controllers: [
        { id: 'controller-a', variant: 'lolin_d32_pro' },
        { id: 'controller-b', variant: '  lolin_d32_pro\n' },
      ],
    });

    // Don't await start() to completion — that would require driving the
    // streamer to resolve. The test assertion is "validation passes and
    // the trimmed variant flows through," which we observe via
    // flashJobStarted emission (fires after validation, before await
    // streamer.run). Resolve the streamer afterward to clean up.
    const startPromise = fx.orchestrator.start(fx.request);
    await vi.waitFor(() =>
      expect(emittedFrames(fx.emitWs, TransmissionType.flashJobStarted)).toHaveLength(1),
    );
    // The flashJobStarted payload's source.kind === 'github' confirms the
    // resolver ran (so the trimmed variant matched a github asset).
    const startedFrame = emittedFrames(fx.emitWs, TransmissionType.flashJobStarted)[0];
    expect((startedFrame.data as FlashJobState).source.kind).toBe('github');
    // Cleanup: resolve the streamer so the start() promise settles before
    // the test exits, and so the lock is released.
    await vi.waitFor(() => expect(fx.streamerControls.runs.length).toBe(1));
    fx.streamerControls.resolve(makeTransferResult(fx.streamerControls.runs[0].spec));
    await startPromise;
  });

  it('rejects with controllers_lookup_failed when controllersStore.listFlashTargets rejects; lock released, flashJobFailed emitted', async () => {
    // Per PR feedback: a controllersStore rejection (DB error, fs read
    // failure, etc.) must surface as a typed FlashOrchestratorError so the
    // failJob path emits flashJobFailed. Without the wrap around
    // listFlashTargets(), the raw Error bypasses the FlashOrchestratorError
    // branch in the catch block and WS consumers see only lockStateChanged
    // with no reason.
    const fx = setupHappyPath({
      controllersStoreError: new Error('database connection refused'),
    });

    let caught: unknown;
    try {
      await fx.orchestrator.start(fx.request);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(FlashOrchestratorError);
    expect((caught as FlashOrchestratorError).reason).toBe('controllers_lookup_failed');
    // Detail surfaces the upstream error message so operators can diagnose.
    expect((caught as FlashOrchestratorError).detail).toContain('database connection refused');

    expect(fx.orchestrator.getCurrentJob()).toBeNull();
    expect(fx.jobLock.isLocked()).toBe(false);
    const failed = emittedFrames(fx.emitWs, TransmissionType.flashJobFailed);
    expect(failed).toHaveLength(1);
    expect(failed[0].data).toMatchObject({ reason: 'controllers_lookup_failed' });
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
    const failed = emittedFrames(fx.emitWs, TransmissionType.flashJobFailed);
    expect(failed).toHaveLength(1);
    expect(failed[0].data).toMatchObject({ reason: 'asset_not_found' });
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

  it('rejects with release_lookup_failed when releaseService.getReleases rejects (network/upstream)', async () => {
    // Task 11 split: a `releaseService.getReleases()` rejection (network
    // outage, GitHub rate-limit, sidecar I/O failure) maps to
    // `release_lookup_failed` so operators can distinguish "we can't ask
    // GitHub right now" from "we asked but the release/asset/cache step
    // tripped" (`source_resolution_failed`). The `flashJobFailed` emit
    // surfaces the typed reason + the upstream detail.
    const fx = setupHappyPath();
    fx.releaseService.getReleases.mockRejectedValue(new Error('upstream_offline'));

    let caught: unknown;
    try {
      await fx.orchestrator.start(fx.request);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(FlashOrchestratorError);
    expect((caught as FlashOrchestratorError).reason).toBe('release_lookup_failed');
    expect((caught as FlashOrchestratorError).detail).toBe('upstream_offline');

    expect(fx.orchestrator.getCurrentJob()).toBeNull();
    expect(fx.jobLock.isLocked()).toBe(false);
    const failed = emittedFrames(fx.emitWs, TransmissionType.flashJobFailed);
    expect(failed).toHaveLength(1);
    expect(failed[0].data).toMatchObject({
      reason: 'release_lookup_failed',
      detail: 'upstream_offline',
    });
  });

  it('rejects with source_resolution_failed when cache.fetch rejects (post-release lookup)', async () => {
    // Counterpart to the release_lookup_failed test: a cache.fetch failure
    // (network during download, hash-mismatch on disk, ENOSPC) lands in
    // the `source_resolution_failed` bucket. The split lets operators see
    // at a glance whether the upstream lookup or the cache step tripped.
    const fx = setupHappyPath();
    fx.cache.fetch.mockRejectedValue(new Error('hash mismatch on disk'));

    let caught: unknown;
    try {
      await fx.orchestrator.start(fx.request);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(FlashOrchestratorError);
    expect((caught as FlashOrchestratorError).reason).toBe('source_resolution_failed');
    expect((caught as FlashOrchestratorError).detail).toBe('hash mismatch on disk');

    expect(fx.orchestrator.getCurrentJob()).toBeNull();
    expect(fx.jobLock.isLocked()).toBe(false);
    const failed = emittedFrames(fx.emitWs, TransmissionType.flashJobFailed);
    expect(failed).toHaveLength(1);
    expect(failed[0].data).toMatchObject({
      reason: 'source_resolution_failed',
      detail: 'hash mismatch on disk',
    });
  });

  it('rejects with source_resolution_failed when upload.latest rejects (fs error)', async () => {
    // Same source_resolution_failed bucket for the upload path's I/O
    // failures (sidecar read, fs error). Distinct from `no_upload`, which
    // is the well-formed "no artifact present" branch.
    const fx = setupHappyPath({ request: { source: { kind: 'upload' } } });
    fx.upload.latest.mockRejectedValue(new Error('ENOENT'));

    let caught: unknown;
    try {
      await fx.orchestrator.start(fx.request);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(FlashOrchestratorError);
    expect((caught as FlashOrchestratorError).reason).toBe('source_resolution_failed');
    expect((caught as FlashOrchestratorError).detail).toBe('ENOENT');
    const failed = emittedFrames(fx.emitWs, TransmissionType.flashJobFailed);
    expect(failed).toHaveLength(1);
    expect(failed[0].data).toMatchObject({ reason: 'source_resolution_failed' });
  });

  it('non-TransferError streamer rejection: streamer_unknown_error reason; lock released; currentJob cleared', async () => {
    // Task 11: a plain Error (not a TransferError) out of streamer.run
    // maps to the catch-all `streamer_unknown_error` so operators see a
    // typed flashJobFailed instead of just a bare lockStateChanged. The
    // detail surfaces the upstream message for diagnostic context.
    const fx = setupHappyPath();
    const startPromise = fx.orchestrator.start(fx.request);
    await vi.waitFor(() => expect(fx.streamerControls.runs.length).toBe(1));

    // currentJob is set before streamer.run resolves.
    expect(fx.orchestrator.getCurrentJob()).not.toBeNull();

    fx.streamerControls.reject(new Error('something exploded'));

    await expect(startPromise).rejects.toThrow('something exploded');

    expect(fx.orchestrator.getCurrentJob()).toBeNull();
    expect(fx.jobLock.isLocked()).toBe(false);
    // lockStateChanged still fired twice (acquire + release).
    expect(emittedFrames(fx.emitWs, TransmissionType.lockStateChanged)).toHaveLength(2);
    // flashJobDone is NOT emitted on streamer failure.
    expect(emittedFrames(fx.emitWs, TransmissionType.flashJobDone)).toHaveLength(0);
    // flashJobFailed emitted with streamer_unknown_error reason.
    const failed = emittedFrames(fx.emitWs, TransmissionType.flashJobFailed);
    expect(failed).toHaveLength(1);
    expect(failed[0].data).toMatchObject({
      reason: 'streamer_unknown_error',
      detail: 'something exploded',
      abortReason: 'streamer_unknown_error',
    });
  });

  it('getCurrentJob: returns in-flight state mid-flow, persists after start() returns (deploy phase pending)', async () => {
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

    // Drive to completion. After Task 8, start() resolves once FW_DEPLOY_BEGIN
    // is sent + deploy subscriber armed; currentJob remains set because the
    // deploy phase (FW_DEPLOY_DONE → terminal transitions) runs
    // asynchronously and Task 9 owns the post-deploy lock release.
    fx.streamerControls.resolve(makeTransferResult(fx.streamerControls.runs[0].spec));
    await startPromise;

    expect(fx.orchestrator.getCurrentJob()).not.toBeNull();
    expect(fx.jobLock.isLocked()).toBe(true);
  });

  describe('upload-phase observer', () => {
    // These tests need deterministic throttle timing — fake setTimeout/clearTimeout
    // and a counter-backed clock that advances in lockstep with the timer queue,
    // matching the pattern in the createFlashProgressThrottle suite above. The
    // realClock used by the rest of the FlashJobOrchestrator describe block
    // can't satisfy the throttle's window math under faked timers because
    // `vi.advanceTimersByTime` does NOT advance Date.now().
    let nowMs = 0;

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      nowMs = 0;
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    function advance(ms: number): void {
      nowMs += ms;
      vi.advanceTimersByTime(ms);
    }

    const fakeClock: Clock = {
      now: () => nowMs,
      setTimeout: (cb, ms) => globalThis.setTimeout(cb, ms),
      clearTimeout: (t) => globalThis.clearTimeout(t),
    };

    // Drives the orchestrator into "streamer awaiting" — start() called,
    // streamer.run captured, observer available. Returns the captured run
    // for the test to invoke observer hooks against.
    async function startAndAwaitStreamer(fx: ReturnType<typeof setupHappyPath>) {
      const startPromise = fx.orchestrator.start(fx.request);
      await vi.waitFor(() => expect(fx.streamerControls.runs.length).toBe(1));
      return { startPromise, run: fx.streamerControls.runs[0] };
    }

    function controllerUpdates(emitWs: ReturnType<typeof vi.fn>): ControllerFlashState[] {
      return emittedFrames(emitWs, TransmissionType.flashControllerUpdate).map(
        (frame) => (frame as { data: ControllerFlashState }).data,
      );
    }

    it('onTransferBegun: transitions all controllers Queued→UploadingToMaster and emits flashControllerUpdate per controller', async () => {
      const fx = setupHappyPath({ clock: fakeClock });
      const { startPromise, run } = await startAndAwaitStreamer(fx);

      // Pre-condition: controllers all Queued, no flashControllerUpdate emitted yet.
      expect(controllerUpdates(fx.emitWs)).toHaveLength(0);
      expect(
        fx.orchestrator.getCurrentJob()?.controllers.every((c) => c.stage === FwStage.Queued),
      ).toBe(true);

      // Drive the begin-ack hook.
      run.observer.onTransferBegun?.({ transferId: run.spec.transferId, status: 'OK' });

      // Both controllers transitioned + emitted, force=true on the stage transition.
      const updates = controllerUpdates(fx.emitWs);
      expect(updates).toHaveLength(2);
      expect(updates.map((u) => u.controllerId).sort()).toEqual(['controller-a', 'controller-b']);
      expect(updates.every((u) => u.stage === FwStage.UploadingToMaster)).toBe(true);
      expect(updates.every((u) => u.bytesSent === 0)).toBe(true);
      expect(updates.every((u) => u.totalBytes === run.spec.source.sizeBytes)).toBe(true);

      // currentJob's controllers also reflect the new stage.
      expect(
        fx.orchestrator
          .getCurrentJob()
          ?.controllers.every((c) => c.stage === FwStage.UploadingToMaster),
      ).toBe(true);

      // Drain so the test exits cleanly.
      fx.streamerControls.resolve(makeTransferResult(run.spec));
      await startPromise;
    });

    it('onChunkAck: advances bytesSent on every controller and emits flashControllerUpdate via the throttle (leading edge)', async () => {
      const fx = setupHappyPath({ clock: fakeClock });
      const { startPromise, run } = await startAndAwaitStreamer(fx);
      run.observer.onTransferBegun?.({ transferId: run.spec.transferId, status: 'OK' });
      // Two transition emits (one per controller). Subsequent counts are
      // measured from this baseline.
      expect(controllerUpdates(fx.emitWs)).toHaveLength(2);

      // Advance past the throttle window so the next ack fires its leading
      // edge for both controllers (the transition force-emits stamped
      // lastEmittedAt at t=0).
      advance(300);
      run.observer.onChunkAck?.(0, 1024);

      const updatesAfterFirst = controllerUpdates(fx.emitWs);
      expect(updatesAfterFirst).toHaveLength(4);
      const tail = updatesAfterFirst.slice(-2);
      expect(tail.every((u) => u.stage === FwStage.UploadingToMaster)).toBe(true);
      expect(tail.every((u) => u.bytesSent === 1024)).toBe(true);
      expect(tail.every((u) => u.totalBytes === run.spec.source.sizeBytes)).toBe(true);

      // currentJob.controllers reflects the bytesSent advance.
      expect(fx.orchestrator.getCurrentJob()?.controllers.every((c) => c.bytesSent === 1024)).toBe(
        true,
      );

      fx.streamerControls.resolve(makeTransferResult(run.spec));
      await startPromise;
    });

    it('rapid onChunkAck within window: coalesces per-controller via the throttle, last value flushes when window elapses', async () => {
      const fx = setupHappyPath({ clock: fakeClock });
      const { startPromise, run } = await startAndAwaitStreamer(fx);
      run.observer.onTransferBegun?.({ transferId: run.spec.transferId, status: 'OK' });
      // 2 transition emits at t=0.
      expect(controllerUpdates(fx.emitWs)).toHaveLength(2);

      // Push three acks back-to-back inside the same 250 ms window. The
      // first ack's leading edge can't fire either: the transition at t=0
      // stamped lastEmittedAt for both controllers, so the throttle treats
      // every in-window ack as pending.
      advance(50);
      run.observer.onChunkAck?.(0, 1024);
      advance(50);
      run.observer.onChunkAck?.(1, 2048);
      advance(50);
      run.observer.onChunkAck?.(2, 4096);

      // Still just the 2 transition emits — every ack stashed as pending.
      expect(controllerUpdates(fx.emitWs)).toHaveLength(2);

      // Advance past the window; flush timers fire and the latest pending
      // value (4096) lands per controller.
      advance(200);
      const updates = controllerUpdates(fx.emitWs);
      expect(updates).toHaveLength(4);
      const tail = updates.slice(-2);
      expect(tail.every((u) => u.bytesSent === 4096)).toBe(true);
      expect(tail.every((u) => u.stage === FwStage.UploadingToMaster)).toBe(true);

      fx.streamerControls.resolve(makeTransferResult(run.spec));
      await startPromise;
    });

    it('onTransferBegun stamps the throttle window: a mid-window onChunkAck right after is coalesced (proves the transition emit went through the throttle)', async () => {
      // Mutation-discipline pin for the observer's throttle integration.
      // If onTransferBegun bypassed the throttle (e.g., emitted directly
      // via safeEmitWs without calling submit), the per-controller
      // `lastEmittedAt` map would never be stamped — and the very next
      // onChunkAck would fire its own leading edge, producing 4 emits
      // (2 transition + 2 ack) instead of 2 (only the transitions; the
      // ack stashes as pending). Conversely, if force=true were dropped
      // to force=false, the empty-throttle leading-edge path would still
      // emit immediately (lastEmittedAt unset → fires regardless), so
      // this test would not distinguish those two — but the Throttle's
      // own `force=true sets lastEmittedAt` test at line ~429 already
      // pins that semantic; here we pin the orchestrator USES the
      // throttle at all.
      const fx = setupHappyPath({ clock: fakeClock });
      const { startPromise, run } = await startAndAwaitStreamer(fx);

      run.observer.onTransferBegun?.({ transferId: run.spec.transferId, status: 'OK' });
      expect(controllerUpdates(fx.emitWs)).toHaveLength(2);

      // Mid-window in-flight progress — must be stashed as pending, NOT
      // fired as a leading edge.
      advance(50);
      run.observer.onChunkAck?.(0, 1024);
      expect(controllerUpdates(fx.emitWs)).toHaveLength(2);

      // Window elapses; pending flushes — controllers emit with the ack's bytesSent.
      advance(250);
      const updates = controllerUpdates(fx.emitWs);
      expect(updates).toHaveLength(4);
      const tail = updates.slice(-2);
      expect(tail.every((u) => u.bytesSent === 1024)).toBe(true);

      fx.streamerControls.resolve(makeTransferResult(run.spec));
      await startPromise;
    });

    it('large transfer: 10 chunks across 5 controllers — final bytesSent matches source.sizeBytes for every controller', async () => {
      const fx = setupHappyPath({
        clock: fakeClock,
        controllers: [
          { id: 'c0', variant: 'lolin_d32_pro' },
          { id: 'c1', variant: 'lolin_d32_pro' },
          { id: 'c2', variant: 'lolin_d32_pro' },
          { id: 'c3', variant: 'lolin_d32_pro' },
          { id: 'c4', variant: 'lolin_d32_pro' },
        ],
      });
      const { startPromise, run } = await startAndAwaitStreamer(fx);
      run.observer.onTransferBegun?.({ transferId: run.spec.transferId, status: 'OK' });

      const total = run.spec.source.sizeBytes;
      // 10 acks; each progresses bytesSent up to `total`. Spread them just
      // far enough apart that some land mid-window (pending) and some past
      // the window (leading edge). Final ack carries `total`.
      for (let i = 0; i < 10; i++) {
        const bytes = Math.floor(((i + 1) / 10) * total);
        run.observer.onChunkAck?.(i, bytes);
        advance(30); // 10 * 30ms = 300ms — multiple windows traversed
      }
      // Drain any pending flush at the tail.
      advance(300);

      // currentJob.controllers all show bytesSent === total (the last
      // chunk's bytesSent value).
      const job = fx.orchestrator.getCurrentJob();
      expect(job?.controllers).toHaveLength(5);
      for (const c of job?.controllers ?? []) {
        expect(c.bytesSent).toBe(total);
        expect(c.stage).toBe(FwStage.UploadingToMaster);
      }

      fx.streamerControls.resolve(makeTransferResult(run.spec));
      await startPromise;
    });

    it('onChunkNak: observed but does NOT mutate controller state', async () => {
      const fx = setupHappyPath({ clock: fakeClock });
      const { startPromise, run } = await startAndAwaitStreamer(fx);
      run.observer.onTransferBegun?.({ transferId: run.spec.transferId, status: 'OK' });

      // Push a chunk-ack so bytesSent is non-zero; baseline assertion target.
      advance(300);
      run.observer.onChunkAck?.(2, 4096);
      const baselineUpdates = controllerUpdates(fx.emitWs).length;

      // NAK arrives. Per the orchestrator contract, log only — no controller
      // state change, no flashControllerUpdate, no stage transition.
      run.observer.onChunkNak?.(1, 'CRC');

      expect(controllerUpdates(fx.emitWs)).toHaveLength(baselineUpdates);
      const job = fx.orchestrator.getCurrentJob();
      // bytesSent unchanged from the prior chunk-ack value.
      expect(job?.controllers.every((c) => c.bytesSent === 4096)).toBe(true);
      expect(job?.controllers.every((c) => c.stage === FwStage.UploadingToMaster)).toBe(true);

      fx.streamerControls.resolve(makeTransferResult(run.spec));
      await startPromise;
    });

    it('onTransferEnd: does NOT trigger any controller stage transition (deploy phase is Task 8)', async () => {
      const fx = setupHappyPath({ clock: fakeClock });
      const { startPromise, run } = await startAndAwaitStreamer(fx);
      run.observer.onTransferBegun?.({ transferId: run.spec.transferId, status: 'OK' });
      advance(300);
      run.observer.onChunkAck?.(0, run.spec.source.sizeBytes);
      advance(300);
      const baselineUpdates = controllerUpdates(fx.emitWs).length;
      const baselineStages = fx.orchestrator.getCurrentJob()?.controllers.map((c) => c.stage);

      run.observer.onTransferEnd?.({
        transferId: run.spec.transferId,
        status: 'OK',
        computedSha256Hex: run.spec.source.sha256,
      });

      // No additional flashControllerUpdate; controllers still in
      // UploadingToMaster (deploy-phase wiring lives in Task 8).
      expect(controllerUpdates(fx.emitWs)).toHaveLength(baselineUpdates);
      expect(fx.orchestrator.getCurrentJob()?.controllers.map((c) => c.stage)).toEqual(
        baselineStages,
      );

      fx.streamerControls.resolve(makeTransferResult(run.spec));
      await startPromise;
    });
  });

  describe('deploy-phase observer', () => {
    // Same fake-timer pattern as the upload-phase observer block: faked
    // setTimeout/clearTimeout + a counter-backed clock so the throttle's
    // window math is deterministic.
    let nowMs = 0;

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      nowMs = 0;
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    function advance(ms: number): void {
      nowMs += ms;
      vi.advanceTimersByTime(ms);
    }

    const fakeClock: Clock = {
      now: () => nowMs,
      setTimeout: (cb, ms) => globalThis.setTimeout(cb, ms),
      clearTimeout: (t) => globalThis.clearTimeout(t),
    };

    // Drives the orchestrator through the full upload phase to the deploy-
    // phase armed point: start() → onTransferBegun → settle streamer → await
    // start() resolution. After this, FW_DEPLOY_BEGIN has been sent + the
    // deploy subscriber is armed; tests deliver FW_PROGRESS / FW_DEPLOY_DONE
    // through the FakeSerialBus and assert on the resulting state.
    async function startAndArmDeploy(fx: ReturnType<typeof setupHappyPath>): Promise<{
      jobId: string;
      transferId: string;
      targets: string[];
    }> {
      const startPromise = fx.orchestrator.start(fx.request);
      await vi.waitFor(() => expect(fx.streamerControls.runs.length).toBe(1));
      const run = fx.streamerControls.runs[0];
      run.observer.onTransferBegun?.({ transferId: run.spec.transferId, status: 'OK' });
      fx.streamerControls.resolve(makeTransferResult(run.spec));
      const result = await startPromise;
      return result;
    }

    function controllerResults(emitWs: ReturnType<typeof vi.fn>): Array<{
      jobId: string;
      controller: ControllerFlashState;
    }> {
      return emittedFrames(emitWs, TransmissionType.flashControllerResult).map(
        (frame) => (frame as { data: { jobId: string; controller: ControllerFlashState } }).data,
      );
    }

    it('happy path: streamer succeeds → FW_DEPLOY_BEGIN sent → controllers transition to Sending → FW_PROGRESS drives Sending→Verifying→Rebooting → FW_DEPLOY_DONE all OK transitions to VersionConfirmed', async () => {
      const fx = setupHappyPath({ clock: fakeClock });
      const armed = await startAndArmDeploy(fx);

      // Post-arm: FW_DEPLOY_BEGIN sent on the firmware channel; deploy
      // subscriber registered against the transferId.
      const firmwareSends = fx.bus.sent.filter((s) => s.kind === 'firmware');
      expect(firmwareSends).toHaveLength(1);
      expect(firmwareSends[0].payload).toContain(armed.transferId);
      expect(fx.bus.deploySubscribers.has(armed.transferId)).toBe(true);

      // Both controllers transitioned UploadingToMaster → Sending (force=true
      // → bypass throttle, immediate emit per controller). The flash-
      // controller-update stream so far: 2 transition emits for the upload
      // (Queued→UploadingToMaster from onTransferBegun) + 2 transition emits
      // for the deploy (UploadingToMaster→Sending after streamer success).
      const updatesAfterArm = emittedFrames(fx.emitWs, TransmissionType.flashControllerUpdate);
      expect(updatesAfterArm).toHaveLength(4);
      const sendingFrames = updatesAfterArm
        .slice(-2)
        .map((f) => (f as { data: ControllerFlashState }).data);
      expect(sendingFrames.every((c) => c.stage === FwStage.Sending)).toBe(true);
      expect(sendingFrames.map((c) => c.controllerId).sort()).toEqual([
        'controller-a',
        'controller-b',
      ]);

      // Drive each controller through Sending→Verifying→Rebooting via
      // FW_PROGRESS. Each stage transition forces an emit (force=true);
      // mid-stage progress would throttle (covered in a separate test).
      for (const controllerId of armed.targets) {
        for (const stage of [FwStage.Verifying, FwStage.Rebooting]) {
          fx.bus.deliverDeployEvent(armed.transferId, {
            kind: 'progress',
            payload: {
              transferId: armed.transferId,
              controllerId,
              stage,
              bytesSent: 0,
              totalBytes: 0,
              detail: '',
            },
          });
        }
      }

      // 4 baseline emits + 2 controllers * 2 stage transitions = 8 emits.
      const updatesPreDone = emittedFrames(fx.emitWs, TransmissionType.flashControllerUpdate);
      expect(updatesPreDone).toHaveLength(8);

      // Deliver FW_DEPLOY_DONE with all OK outcomes.
      fx.bus.deliverDeployEvent(armed.transferId, {
        kind: 'done',
        payload: {
          transferId: armed.transferId,
          results: armed.targets.map((id) => ({
            controllerId: id,
            outcome: 'OK',
            finalVersion: '1.4.0',
            error: '',
          })),
        },
      });

      // flashControllerResult emitted per controller (bypasses throttle).
      const results = controllerResults(fx.emitWs);
      expect(results).toHaveLength(2);
      for (const r of results) {
        expect(r.jobId).toBe(armed.jobId);
        expect(r.controller.stage).toBe(FwStage.VersionConfirmed);
        if (r.controller.stage === FwStage.VersionConfirmed) {
          expect(r.controller.finalVersion).toBe('1.4.0');
        }
      }

      // currentJob's controllers all VersionConfirmed.
      const job = fx.orchestrator.getCurrentJob();
      expect(job?.controllers.every((c) => c.stage === FwStage.VersionConfirmed)).toBe(true);

      // Subscriber disposed (single-shot — done is terminal).
      expect(fx.bus.deploySubscribers.has(armed.transferId)).toBe(false);

      // Lock NOT yet released (Task 9 wires that). currentJob still set.
      expect(fx.jobLock.isLocked()).toBe(true);
      expect(fx.orchestrator.getCurrentJob()).not.toBeNull();
    });

    it('mid-stage FW_PROGRESS within window: throttled (no immediate emit), flushes when window elapses', async () => {
      const fx = setupHappyPath({ clock: fakeClock });
      const armed = await startAndArmDeploy(fx);
      const baseline = emittedFrames(fx.emitWs, TransmissionType.flashControllerUpdate).length;

      // Same-stage progress (Sending→Sending advance of bytesSent). The
      // transition emit at arm time stamped lastEmittedAt; this in-window
      // submit must stash as pending — no immediate emit.
      advance(50);
      fx.bus.deliverDeployEvent(armed.transferId, {
        kind: 'progress',
        payload: {
          transferId: armed.transferId,
          controllerId: 'controller-a',
          stage: FwStage.Sending,
          bytesSent: 1024,
          totalBytes: 2048,
          detail: '',
        },
      });
      expect(emittedFrames(fx.emitWs, TransmissionType.flashControllerUpdate)).toHaveLength(
        baseline,
      );

      // Window elapses — pending state flushes.
      advance(250);
      const updates = emittedFrames(fx.emitWs, TransmissionType.flashControllerUpdate);
      expect(updates).toHaveLength(baseline + 1);
      const last = (updates[updates.length - 1] as { data: ControllerFlashState }).data;
      expect(last.controllerId).toBe('controller-a');
      expect(last.stage).toBe(FwStage.Sending);
      expect(last.bytesSent).toBe(1024);
    });

    it('mixed terminal: FW_DEPLOY_DONE with one OK + one FAILED — flashControllerResult per controller; deriveJobLifecycle === done', async () => {
      const { deriveJobLifecycle } = await import('./flash_job_state_machine.js');
      const fx = setupHappyPath({ clock: fakeClock });
      const armed = await startAndArmDeploy(fx);

      // Drive each controller through Sending→Verifying→Rebooting via
      // FW_PROGRESS so the terminal transition (Rebooting→VersionConfirmed
      // for OK; any-non-terminal→Failed for FAILED) is FSM-legal.
      for (const controllerId of armed.targets) {
        for (const stage of [FwStage.Verifying, FwStage.Rebooting]) {
          fx.bus.deliverDeployEvent(armed.transferId, {
            kind: 'progress',
            payload: {
              transferId: armed.transferId,
              controllerId,
              stage,
              bytesSent: 0,
              totalBytes: 0,
              detail: '',
            },
          });
        }
      }

      fx.bus.deliverDeployEvent(armed.transferId, {
        kind: 'done',
        payload: {
          transferId: armed.transferId,
          results: [
            { controllerId: 'controller-a', outcome: 'OK', finalVersion: '1.4.0', error: '' },
            {
              controllerId: 'controller-b',
              outcome: 'FAILED',
              finalVersion: '',
              error: 'flash_corrupt',
            },
          ],
        },
      });

      const results = controllerResults(fx.emitWs);
      expect(results).toHaveLength(2);
      const a = results.find((r) => r.controller.controllerId === 'controller-a');
      const b = results.find((r) => r.controller.controllerId === 'controller-b');
      expect(a?.controller.stage).toBe(FwStage.VersionConfirmed);
      expect(b?.controller.stage).toBe(FwStage.Failed);
      if (b !== undefined && b.controller.stage === FwStage.Failed) {
        expect(b.controller.error).toBe('flash_corrupt');
      }

      // Per c.6a's deriveJobLifecycle: any combination of terminal stages
      // (VersionConfirmed + Failed) → 'done' (NOT 'failed'). flashJobFailed
      // is reserved for job-wide aborts; per-controller failures are local.
      const job = fx.orchestrator.getCurrentJob();
      expect(job).not.toBeNull();
      if (job !== null) expect(deriveJobLifecycle(job)).toBe('done');
      // No flashJobFailed should have been emitted.
      expect(emittedFrames(fx.emitWs, TransmissionType.flashJobFailed)).toHaveLength(0);
    });

    it('protocol violation (invalid stage): emits flashJobFailed protocol_violation; non-terminal controllers transition to Failed; lock released', async () => {
      const fx = setupHappyPath({ clock: fakeClock });
      const armed = await startAndArmDeploy(fx);
      const baselineResults = controllerResults(fx.emitWs).length;

      fx.bus.deliverDeployEvent(armed.transferId, {
        kind: 'progress',
        payload: {
          transferId: armed.transferId,
          controllerId: 'controller-a',
          // Cast through unknown to inject a wire-level invalid stage; runtime
          // guard must reject regardless of the (untyped) source.
          stage: 'BOGUS' as unknown as FwStage,
          bytesSent: 0,
          totalBytes: 0,
          detail: '',
        },
      });

      // flashJobFailed emitted with reason: protocol_violation. Detail must
      // surface the wire-validation message ("invalid stage: BOGUS") rather
      // than the FSM-transition error ("illegal flash-job transition: ...");
      // a missing wire-validation guard would let stage='BOGUS' fall through
      // to transitionControllerState, which throws with the FSM-shaped error
      // — different reason, less greppable, and harder to map to "the master
      // sent garbage" in operator triage.
      const failed = emittedFrames(fx.emitWs, TransmissionType.flashJobFailed);
      expect(failed).toHaveLength(1);
      expect(failed[0].data).toMatchObject({
        jobId: armed.jobId,
        reason: 'protocol_violation',
      });
      const failDetail = (failed[0].data as { detail?: string }).detail ?? '';
      expect(failDetail).toContain('invalid stage');
      expect(failDetail).toContain('BOGUS');

      // Both non-terminal controllers transitioned to Failed; flashController
      // Result emitted per affected controller.
      const newResults = controllerResults(fx.emitWs).slice(baselineResults);
      expect(newResults).toHaveLength(2);
      expect(newResults.every((r) => r.controller.stage === FwStage.Failed)).toBe(true);

      // Lock released, currentJob cleared, subscriber disposed.
      expect(fx.jobLock.isLocked()).toBe(false);
      expect(fx.orchestrator.getCurrentJob()).toBeNull();
      expect(fx.bus.deploySubscribers.has(armed.transferId)).toBe(false);
    });

    it('protocol violation (invalid outcome in FW_DEPLOY_DONE): same cleanup as invalid-stage', async () => {
      const fx = setupHappyPath({ clock: fakeClock });
      const armed = await startAndArmDeploy(fx);

      fx.bus.deliverDeployEvent(armed.transferId, {
        kind: 'done',
        payload: {
          transferId: armed.transferId,
          results: [
            {
              controllerId: 'controller-a',
              outcome: 'WAT' as unknown as 'OK' | 'FAILED',
              finalVersion: '',
              error: '',
            },
          ],
        },
      });

      const failed = emittedFrames(fx.emitWs, TransmissionType.flashJobFailed);
      expect(failed).toHaveLength(1);
      expect(failed[0].data).toMatchObject({ reason: 'protocol_violation' });
      expect(fx.jobLock.isLocked()).toBe(false);
      expect(fx.orchestrator.getCurrentJob()).toBeNull();
    });

    it('protocol violation (empty results in FW_DEPLOY_DONE): protocol_violation; lock released', async () => {
      const fx = setupHappyPath({ clock: fakeClock });
      const armed = await startAndArmDeploy(fx);

      fx.bus.deliverDeployEvent(armed.transferId, {
        kind: 'done',
        payload: {
          transferId: armed.transferId,
          results: [],
        },
      });

      const failed = emittedFrames(fx.emitWs, TransmissionType.flashJobFailed);
      expect(failed).toHaveLength(1);
      expect(failed[0].data).toMatchObject({ reason: 'protocol_violation' });
      expect(fx.jobLock.isLocked()).toBe(false);
    });

    it('unknown controllerId in FW_PROGRESS: dropped silently (logged); other controllers unchanged; subscriber stays armed', async () => {
      const fx = setupHappyPath({ clock: fakeClock });
      const armed = await startAndArmDeploy(fx);
      const baselineUpdates = emittedFrames(
        fx.emitWs,
        TransmissionType.flashControllerUpdate,
      ).length;
      const beforeJob = fx.orchestrator.getCurrentJob();
      const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => undefined);

      try {
        fx.bus.deliverDeployEvent(armed.transferId, {
          kind: 'progress',
          payload: {
            transferId: armed.transferId,
            controllerId: 'phantom-controller',
            stage: FwStage.Sending,
            bytesSent: 100,
            totalBytes: 1000,
            detail: '',
          },
        });

        // No new flashControllerUpdate, no flashJobFailed, currentJob untouched.
        expect(emittedFrames(fx.emitWs, TransmissionType.flashControllerUpdate)).toHaveLength(
          baselineUpdates,
        );
        expect(emittedFrames(fx.emitWs, TransmissionType.flashJobFailed)).toHaveLength(0);
        expect(fx.orchestrator.getCurrentJob()).toEqual(beforeJob);
        // Subscriber still armed — drop-and-log isn't a terminal event.
        expect(fx.bus.deploySubscribers.has(armed.transferId)).toBe(true);
        // Log line surfaces the rejected controllerId.
        expect(infoSpy).toHaveBeenCalled();
        const logged = infoSpy.mock.calls.some((call) =>
          (call[0] as string).includes('phantom-controller'),
        );
        expect(logged).toBe(true);
      } finally {
        infoSpy.mockRestore();
      }
    });

    it('unknown controllerId in FW_DEPLOY_DONE result: skipped with log; known controllers terminate normally', async () => {
      const fx = setupHappyPath({ clock: fakeClock });
      const armed = await startAndArmDeploy(fx);
      const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => undefined);

      // Advance controllers to Rebooting so the Rebooting→VersionConfirmed
      // terminal transition is FSM-legal.
      for (const controllerId of armed.targets) {
        for (const stage of [FwStage.Verifying, FwStage.Rebooting]) {
          fx.bus.deliverDeployEvent(armed.transferId, {
            kind: 'progress',
            payload: {
              transferId: armed.transferId,
              controllerId,
              stage,
              bytesSent: 0,
              totalBytes: 0,
              detail: '',
            },
          });
        }
      }

      try {
        fx.bus.deliverDeployEvent(armed.transferId, {
          kind: 'done',
          payload: {
            transferId: armed.transferId,
            results: [
              { controllerId: 'controller-a', outcome: 'OK', finalVersion: '1.4.0', error: '' },
              { controllerId: 'phantom', outcome: 'OK', finalVersion: '1.4.0', error: '' },
              { controllerId: 'controller-b', outcome: 'OK', finalVersion: '1.4.0', error: '' },
            ],
          },
        });

        // 2 known controllers got results; phantom skipped + logged.
        const results = controllerResults(fx.emitWs);
        expect(results).toHaveLength(2);
        expect(results.map((r) => r.controller.controllerId).sort()).toEqual([
          'controller-a',
          'controller-b',
        ]);
        expect(emittedFrames(fx.emitWs, TransmissionType.flashJobFailed)).toHaveLength(0);

        const logged = infoSpy.mock.calls.some((call) => (call[0] as string).includes('phantom'));
        expect(logged).toBe(true);
      } finally {
        infoSpy.mockRestore();
      }
    });

    it('bus.send throws on FW_DEPLOY_BEGIN: flashJobFailed bus_send_failed; controllers transition to Failed; lock released', async () => {
      const fx = setupHappyPath({ clock: fakeClock });
      // Override bus.send to reject FW_DEPLOY_BEGIN. We detect it by checking
      // the firmware kind on a payload that comes after the streamer settled
      // (the streamer fake doesn't call bus.send, so any firmware-kind send
      // we see came from FW_DEPLOY_BEGIN).
      const originalSend = fx.bus.send.bind(fx.bus);
      fx.bus.send = (payload, opts) => {
        if (opts.kind === 'firmware') {
          throw new Error('worker channel closed');
        }
        originalSend(payload, opts);
      };

      const startPromise = fx.orchestrator.start(fx.request);
      await vi.waitFor(() => expect(fx.streamerControls.runs.length).toBe(1));
      const run = fx.streamerControls.runs[0];
      run.observer.onTransferBegun?.({ transferId: run.spec.transferId, status: 'OK' });
      fx.streamerControls.resolve(makeTransferResult(run.spec));

      // start() rejects with bus_send_failed.
      let caught: unknown;
      try {
        await startPromise;
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(FlashOrchestratorError);
      expect((caught as FlashOrchestratorError).reason).toBe('bus_send_failed');
      expect((caught as FlashOrchestratorError).detail).toContain('worker channel closed');

      // flashJobFailed emitted; lock released; currentJob cleared.
      const failed = emittedFrames(fx.emitWs, TransmissionType.flashJobFailed);
      expect(failed).toHaveLength(1);
      expect(failed[0].data).toMatchObject({ reason: 'bus_send_failed' });
      expect(fx.jobLock.isLocked()).toBe(false);
      expect(fx.orchestrator.getCurrentJob()).toBeNull();

      // Both controllers got flashControllerResult with Failed (they'd been
      // transitioned to Sending right before the throw; failNonTerminal
      // moved them to Failed).
      const results = controllerResults(fx.emitWs);
      expect(results).toHaveLength(2);
      expect(results.every((r) => r.controller.stage === FwStage.Failed)).toBe(true);

      // No deploy subscriber attached (we threw before subscribe).
      expect(fx.bus.deploySubscribers.size).toBe(0);
    });
  });

  describe('reboot timer + heartbeat', () => {
    // Same fake-timer pattern as the deploy-phase observer block. The reboot
    // timer is a `clock.setTimeout` (faked via the injected mockClock) so we
    // need both `vi.useFakeTimers` AND a counter-backed clock to stay in
    // lockstep.
    let nowMs = 0;

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      nowMs = 0;
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    function advance(ms: number): void {
      nowMs += ms;
      vi.advanceTimersByTime(ms);
    }

    const fakeClock: Clock = {
      now: () => nowMs,
      setTimeout: (cb, ms) => globalThis.setTimeout(cb, ms),
      clearTimeout: (t) => globalThis.clearTimeout(t),
    };

    // Drives the orchestrator through the full upload + deploy phases to
    // an all-OK terminal job. After this returns, every controller is
    // VersionConfirmed, `flashJobDone` has been emitted, and the reboot
    // timer is armed.
    async function startAndCompleteDeploy(fx: ReturnType<typeof setupHappyPath>): Promise<{
      jobId: string;
      transferId: string;
      targets: string[];
    }> {
      const startPromise = fx.orchestrator.start(fx.request);
      await vi.waitFor(() => expect(fx.streamerControls.runs.length).toBe(1));
      const run = fx.streamerControls.runs[0];
      run.observer.onTransferBegun?.({ transferId: run.spec.transferId, status: 'OK' });
      fx.streamerControls.resolve(makeTransferResult(run.spec));
      const result = await startPromise;

      // Drive each controller through Sending→Verifying→Rebooting so the
      // FW_DEPLOY_DONE Rebooting→VersionConfirmed transition is FSM-legal.
      for (const controllerId of result.targets) {
        for (const stage of [FwStage.Verifying, FwStage.Rebooting]) {
          fx.bus.deliverDeployEvent(result.transferId, {
            kind: 'progress',
            payload: {
              transferId: result.transferId,
              controllerId,
              stage,
              bytesSent: 0,
              totalBytes: 0,
              detail: '',
            },
          });
        }
      }

      fx.bus.deliverDeployEvent(result.transferId, {
        kind: 'done',
        payload: {
          transferId: result.transferId,
          results: result.targets.map((id) => ({
            controllerId: id,
            outcome: 'OK',
            finalVersion: '1.4.0',
            error: '',
          })),
        },
      });

      return result;
    }

    it('all controllers terminal: emits flashJobDone with jobId+endedAt; arms a reboot timer', async () => {
      const fx = setupHappyPath({ clock: fakeClock });
      // Stamp the clock so endedAt is non-trivial (and lands in ISO form).
      nowMs = 1_000_000;
      const armed = await startAndCompleteDeploy(fx);

      const doneFrames = emittedFrames(fx.emitWs, TransmissionType.flashJobDone);
      expect(doneFrames).toHaveLength(1);
      const doneData = doneFrames[0].data as { jobId: string; endedAt: string };
      expect(doneData.jobId).toBe(armed.jobId);
      // endedAt is an ISO timestamp derived from clock.now() at deploy-done.
      expect(doneData.endedAt).toBe(new Date(1_000_000).toISOString());

      // Reboot timer is armed (one outstanding fake-timer).
      expect(vi.getTimerCount()).toBe(1);

      // Lock still held (release is gated on heartbeat-or-timer).
      expect(fx.jobLock.isLocked()).toBe(true);
      expect(fx.orchestrator.getCurrentJob()).not.toBeNull();
      // currentJob also reflects endedAt (same field that `flashJobDone` carries).
      expect(fx.orchestrator.getCurrentJob()?.endedAt).toBe(doneData.endedAt);
      // Lock release event NOT yet emitted — only the acquire so far.
      expect(emittedFrames(fx.emitWs, TransmissionType.lockStateChanged)).toHaveLength(1);
    });

    it('mixed terminal (one OK + one FAILED) still emits flashJobDone and arms reboot timer (per-controller failures are local)', async () => {
      const fx = setupHappyPath({ clock: fakeClock });
      const startPromise = fx.orchestrator.start(fx.request);
      await vi.waitFor(() => expect(fx.streamerControls.runs.length).toBe(1));
      const run = fx.streamerControls.runs[0];
      run.observer.onTransferBegun?.({ transferId: run.spec.transferId, status: 'OK' });
      fx.streamerControls.resolve(makeTransferResult(run.spec));
      const result = await startPromise;

      // Walk both controllers to Rebooting so the OK controller's terminal
      // transition is legal; the FAILED outcome is legal from any non-terminal.
      for (const controllerId of result.targets) {
        for (const stage of [FwStage.Verifying, FwStage.Rebooting]) {
          fx.bus.deliverDeployEvent(result.transferId, {
            kind: 'progress',
            payload: {
              transferId: result.transferId,
              controllerId,
              stage,
              bytesSent: 0,
              totalBytes: 0,
              detail: '',
            },
          });
        }
      }

      fx.bus.deliverDeployEvent(result.transferId, {
        kind: 'done',
        payload: {
          transferId: result.transferId,
          results: [
            { controllerId: 'controller-a', outcome: 'OK', finalVersion: '1.4.0', error: '' },
            {
              controllerId: 'controller-b',
              outcome: 'FAILED',
              finalVersion: '',
              error: 'flash_corrupt',
            },
          ],
        },
      });

      // flashJobDone fires (mixed-terminal still counts as 'done' per FSM);
      // flashJobFailed does NOT (job-wide abort is a separate event).
      expect(emittedFrames(fx.emitWs, TransmissionType.flashJobDone)).toHaveLength(1);
      expect(emittedFrames(fx.emitWs, TransmissionType.flashJobFailed)).toHaveLength(0);
      // Reboot timer armed even with a partial failure — the master still
      // rebooted; we still want to release the lock when its heartbeat lands.
      expect(vi.getTimerCount()).toBe(1);
      expect(fx.jobLock.isLocked()).toBe(true);
    });

    it('heartbeat called pre-timer: clears the timer, releases the lock, emits lockStateChanged; no leaked timers', async () => {
      const fx = setupHappyPath({ clock: fakeClock });
      const armed = await startAndCompleteDeploy(fx);
      expect(vi.getTimerCount()).toBe(1);

      const lockEventsBefore = emittedFrames(fx.emitWs, TransmissionType.lockStateChanged).length;

      fx.orchestrator.notifyMasterHeartbeat('1.4.0');

      // Lock released; lockStateChanged emitted (one new frame).
      expect(fx.jobLock.isLocked()).toBe(false);
      expect(fx.orchestrator.getCurrentJob()).toBeNull();
      expect(emittedFrames(fx.emitWs, TransmissionType.lockStateChanged)).toHaveLength(
        lockEventsBefore + 1,
      );
      // Reboot timer cleared — no leaked fake-timer.
      expect(vi.getTimerCount()).toBe(0);

      // Advancing time past the reboot timeout must NOT trigger a second
      // release (no double-release).
      advance(20_000);
      expect(emittedFrames(fx.emitWs, TransmissionType.lockStateChanged)).toHaveLength(
        lockEventsBefore + 1,
      );
      // jobId-bearing fake assertion: a stale timer firing would have tried
      // to release a lock that's already free; the JobLock would silently
      // ignore but our broadcastLockState would emit an extra frame. The
      // count assertion above pins that.
      void armed;
    });

    it('reboot timer fires (no heartbeat): releases the lock, emits lockStateChanged; subsequent heartbeat is a no-op', async () => {
      const fx = setupHappyPath({ clock: fakeClock });
      await startAndCompleteDeploy(fx);
      expect(vi.getTimerCount()).toBe(1);
      const lockEventsBefore = emittedFrames(fx.emitWs, TransmissionType.lockStateChanged).length;

      // Advance past the default 15-sec reboot timeout.
      advance(15_000);

      expect(fx.jobLock.isLocked()).toBe(false);
      expect(fx.orchestrator.getCurrentJob()).toBeNull();
      expect(emittedFrames(fx.emitWs, TransmissionType.lockStateChanged)).toHaveLength(
        lockEventsBefore + 1,
      );
      expect(vi.getTimerCount()).toBe(0);

      // A late heartbeat (e.g., the master's POLL_ACK arriving 1s past the
      // timer firing) must be a no-op — the timer already released.
      fx.orchestrator.notifyMasterHeartbeat('1.4.0');
      expect(emittedFrames(fx.emitWs, TransmissionType.lockStateChanged)).toHaveLength(
        lockEventsBefore + 1,
      );
      expect(fx.jobLock.isLocked()).toBe(false);
    });

    it('respects a custom rebootTimeoutMs from config', async () => {
      // Default is 15s; pin a non-default value so a regression that hard-codes
      // the timeout would surface here.
      const fx = setupHappyPath({ clock: fakeClock });
      // Re-construct with config override; setupHappyPath's orchestrator was
      // built with defaults, so we need our own.
      const customOrchestrator = new FlashJobOrchestrator({
        bus: fx.bus,
        jobLock: fx.jobLock,
        cache: fx.cache,
        upload: fx.upload,
        releaseService: fx.releaseService,
        controllersStore: fx.controllersStore,
        emitWs: fx.emitWs,
        streamerFactory: () => ({
          run: (spec, observer) => {
            // Mirror the scripted-streamer pattern but inline: capture the
            // observer + resolve immediately so we land in the deploy phase.
            return new Promise((resolve) => {
              observer.onTransferBegun?.({ transferId: spec.transferId, status: 'OK' });
              resolve(makeTransferResult(spec));
            });
          },
        }),
        clock: fakeClock,
        config: { rebootTimeoutMs: 5_000 },
      });

      const startPromise = customOrchestrator.start(fx.request);
      const result = await startPromise;
      // Drive controllers terminal to arm the (5s) timer.
      for (const controllerId of result.targets) {
        for (const stage of [FwStage.Verifying, FwStage.Rebooting]) {
          fx.bus.deliverDeployEvent(result.transferId, {
            kind: 'progress',
            payload: {
              transferId: result.transferId,
              controllerId,
              stage,
              bytesSent: 0,
              totalBytes: 0,
              detail: '',
            },
          });
        }
      }
      fx.bus.deliverDeployEvent(result.transferId, {
        kind: 'done',
        payload: {
          transferId: result.transferId,
          results: result.targets.map((id) => ({
            controllerId: id,
            outcome: 'OK',
            finalVersion: '1.4.0',
            error: '',
          })),
        },
      });
      expect(vi.getTimerCount()).toBe(1);

      // Advance just under the configured timeout — must NOT have released yet.
      advance(4_999);
      expect(fx.jobLock.isLocked()).toBe(true);
      // Cross the 5s threshold — release fires.
      advance(2);
      expect(fx.jobLock.isLocked()).toBe(false);
    });

    it('heartbeat called twice: first releases; second is a no-op (no double-release)', async () => {
      const fx = setupHappyPath({ clock: fakeClock });
      await startAndCompleteDeploy(fx);

      fx.orchestrator.notifyMasterHeartbeat('1.4.0');
      const lockEventsAfterFirst = emittedFrames(
        fx.emitWs,
        TransmissionType.lockStateChanged,
      ).length;
      expect(fx.jobLock.isLocked()).toBe(false);

      // Second heartbeat — rebootTimer is null now, so the guard short-circuits
      // before any emit / lock-release work.
      fx.orchestrator.notifyMasterHeartbeat('1.4.0');
      expect(emittedFrames(fx.emitWs, TransmissionType.lockStateChanged)).toHaveLength(
        lockEventsAfterFirst,
      );
      expect(fx.jobLock.isLocked()).toBe(false);
    });

    it('heartbeat called with no active job: no-op (no emit, no error)', async () => {
      // Brand-new orchestrator; nothing has been started.
      const fx = setupHappyPath({ clock: fakeClock });

      fx.orchestrator.notifyMasterHeartbeat('1.4.0');

      expect(fx.emitWs).not.toHaveBeenCalled();
      expect(fx.jobLock.isLocked()).toBe(false);
      expect(fx.orchestrator.getCurrentJob()).toBeNull();
    });

    it('heartbeat called mid-upload (out-of-protocol): no-op (rebootTimer null)', async () => {
      // Driving start() up to the streamer-awaiting point means the upload
      // phase is in flight; rebootTimer is null. A heartbeat arriving here is
      // protocol garbage (the master can't have rebooted) — must be ignored.
      const fx = setupHappyPath({ clock: fakeClock });
      const startPromise = fx.orchestrator.start(fx.request);
      await vi.waitFor(() => expect(fx.streamerControls.runs.length).toBe(1));
      const lockEventsBefore = emittedFrames(fx.emitWs, TransmissionType.lockStateChanged).length;
      const allEventsBefore = fx.emitWs.mock.calls.length;

      fx.orchestrator.notifyMasterHeartbeat('1.4.0');

      // No emit, no lock change, no currentJob change.
      expect(fx.emitWs.mock.calls.length).toBe(allEventsBefore);
      expect(emittedFrames(fx.emitWs, TransmissionType.lockStateChanged)).toHaveLength(
        lockEventsBefore,
      );
      expect(fx.jobLock.isLocked()).toBe(true);
      expect(fx.orchestrator.getCurrentJob()).not.toBeNull();

      // Drain the streamer + deploy phase so the test exits cleanly. We
      // can't `await` the deploy phase to terminal here because that would
      // arm the reboot timer and pollute teardown — just resolve the
      // streamer and the start() promise; the deploy subscriber is
      // disposed when the orchestrator is GC'd.
      fx.streamerControls.resolve(makeTransferResult(fx.streamerControls.runs[0].spec));
      await startPromise;
    });

    it('heartbeat called mid-deploy (post-streamer, pre-FW_DEPLOY_DONE): no-op (rebootTimer null)', async () => {
      // Heartbeat arriving between FW_DEPLOY_BEGIN and FW_DEPLOY_DONE — the
      // master might be rebooting one controller while another is still
      // deploying. rebootTimer is only armed AFTER all controllers terminal,
      // so this must be a no-op too.
      const fx = setupHappyPath({ clock: fakeClock });
      const startPromise = fx.orchestrator.start(fx.request);
      await vi.waitFor(() => expect(fx.streamerControls.runs.length).toBe(1));
      const run = fx.streamerControls.runs[0];
      run.observer.onTransferBegun?.({ transferId: run.spec.transferId, status: 'OK' });
      fx.streamerControls.resolve(makeTransferResult(run.spec));
      const armed = await startPromise;

      // We're now post-FW_DEPLOY_BEGIN, mid-deploy. Subscribers armed; no
      // reboot timer yet.
      expect(fx.bus.deploySubscribers.has(armed.transferId)).toBe(true);
      expect(vi.getTimerCount()).toBe(0);

      const allEventsBefore = fx.emitWs.mock.calls.length;
      fx.orchestrator.notifyMasterHeartbeat('1.4.0');

      // No emit, no state change.
      expect(fx.emitWs.mock.calls.length).toBe(allEventsBefore);
      expect(fx.jobLock.isLocked()).toBe(true);
      expect(fx.orchestrator.getCurrentJob()).not.toBeNull();
      expect(fx.bus.deploySubscribers.has(armed.transferId)).toBe(true);
    });

    it('heartbeat ignores its version argument (api_server is responsible for version validation)', async () => {
      // The orchestrator's contract: the caller (api_server's POLL handler)
      // is responsible for the version match. The orchestrator just clears
      // the timer + releases the lock when a heartbeat lands. A wrong-version
      // call should still proceed — that's the api_server's bug, not ours.
      const fx = setupHappyPath({ clock: fakeClock });
      await startAndCompleteDeploy(fx);

      fx.orchestrator.notifyMasterHeartbeat('totally-wrong-version');

      expect(fx.jobLock.isLocked()).toBe(false);
      expect(fx.orchestrator.getCurrentJob()).toBeNull();
    });
  });

  it('safeEmitWs error log includes the readable TransmissionType name (not just the numeric value)', async () => {
    // Operational ergonomics: TransmissionType is a numeric enum, so logging
    // bare `String(msg.type)` would produce numbers like "13" — hard to
    // grep, hard to diagnose. The log line must include the reverse-mapped
    // enum key (e.g., "lockStateChanged") alongside the numeric value.
    const fx = setupHappyPath();
    // Make ONLY the lockStateChanged emits throw; let the others succeed
    // so start() can complete normally (otherwise the test hangs awaiting
    // streamer.run). The orchestrator's safeEmitWs catches the throws +
    // logs; start() proceeds because the catch swallows.
    fx.emitWs.mockImplementation((msg: { type: number }) => {
      if (msg.type === TransmissionType.lockStateChanged) {
        throw new Error('ws server mid-shutdown');
      }
    });
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);

    try {
      const startPromise = fx.orchestrator.start(fx.request);
      // Drive the streamer to completion so start() resolves rather than
      // hanging on the inner await. After Task 8, the only lockStateChanged
      // emit during start() is the acquire — the release fires later (Task 9
      // post-FW_DEPLOY_DONE), but one log line is enough to assert format.
      await vi.waitFor(() => expect(fx.streamerControls.runs.length).toBe(1));
      fx.streamerControls.resolve(makeTransferResult(fx.streamerControls.runs[0].spec));
      await startPromise;

      expect(errorSpy).toHaveBeenCalled();
      const logLine = errorSpy.mock.calls[0]?.[0] as string;
      // Readable enum name surfaces.
      expect(logLine).toContain('lockStateChanged');
      // Numeric value surfaces too — preserves grep-by-number diagnostics.
      expect(logLine).toContain(String(TransmissionType.lockStateChanged));
      // Underlying error message surfaces.
      expect(logLine).toContain('ws server mid-shutdown');
    } finally {
      errorSpy.mockRestore();
    }
  });

  describe('error path consolidation (Task 11)', () => {
    // All 12 c.6b TransferErrorCode values. Pinning the full set as a
    // single source of truth so a future c.6b extension that adds a new
    // code surfaces here as a missing-coverage signal rather than a
    // silent fall-through.
    const TRANSFER_ERROR_CODES: TransferErrorCode[] = [
      'source_read_failed',
      'source_size_mismatch',
      'begin_timeout',
      'begin_rejected',
      'chunk_retry_exhausted',
      'flash_full',
      'transfer_timeout',
      'aborted',
      'end_timeout',
      'hash_mismatch',
      'master_io_error',
      'bus_send_failed',
    ];

    function controllerResults(emitWs: ReturnType<typeof vi.fn>): Array<{
      jobId: string;
      controller: ControllerFlashState;
    }> {
      return emittedFrames(emitWs, TransmissionType.flashControllerResult).map(
        (frame) => (frame as { data: { jobId: string; controller: ControllerFlashState } }).data,
      );
    }

    // Parameterized over all 12 codes. Each one drives start() to the
    // streamer-awaiting state, rejects with that TransferError, and
    // verifies the bucket-B emit shape (typed reason === code, abortReason
    // === code, controllers cleaned up, lock released).
    for (const code of TRANSFER_ERROR_CODES) {
      it(`TransferError '${code}' → flashJobFailed with reason+abortReason=${code}; controllers Failed; lock released`, async () => {
        const fx = setupHappyPath();
        const startPromise = fx.orchestrator.start(fx.request);
        await vi.waitFor(() => expect(fx.streamerControls.runs.length).toBe(1));
        const transferId = fx.streamerControls.runs[0].spec.transferId;

        // Currentjob is set + in upload phase before rejection.
        expect(fx.orchestrator.getCurrentJob()).not.toBeNull();

        fx.streamerControls.reject(new TransferError(code, transferId, 'upstream detail'));

        let caught: unknown;
        try {
          await startPromise;
        } catch (err) {
          caught = err;
        }
        expect(caught).toBeInstanceOf(TransferError);
        expect((caught as TransferError).code).toBe(code);

        // flashJobFailed: typed reason === code, abortReason === code, detail.
        const failed = emittedFrames(fx.emitWs, TransmissionType.flashJobFailed);
        expect(failed).toHaveLength(1);
        expect(failed[0].data).toMatchObject({
          reason: code,
          abortReason: code,
          detail: 'upstream detail',
        });

        // Per-controller cleanup: every controller transitioned to Failed +
        // got a flashControllerResult emission (UploadingToMaster is
        // non-terminal so failNonTerminalControllers fired for both).
        const results = controllerResults(fx.emitWs);
        expect(results).toHaveLength(2);
        expect(results.every((r) => r.controller.stage === FwStage.Failed)).toBe(true);

        // Lock released; currentJob cleared; subscriber + throttle disposed.
        expect(fx.jobLock.isLocked()).toBe(false);
        expect(fx.orchestrator.getCurrentJob()).toBeNull();
        expect(fx.bus.deploySubscribers.size).toBe(0);
      });
    }

    it('subscriber_attach_failed: bus.subscribeDeployEvents throws → flashJobFailed; controllers Failed; lock released', async () => {
      // FMI §1: subscribeDeployEvents shouldn't throw under normal
      // conditions, but a hypothetical listener-limit / disposed-bus
      // failure must still produce a typed flashJobFailed rather than an
      // untyped catch fall-through. Note that by this point FW_DEPLOY_BEGIN
      // was already sent — the master may proceed without a server-side
      // observer; the operator UI sees Failed and the lock releases.
      const fx = setupHappyPath();
      // The fixture is local to this test; no need to restore the
      // original subscribeDeployEvents after the override.
      fx.bus.subscribeDeployEvents = (transferId, handler) => {
        void transferId;
        void handler;
        throw new Error('listener limit reached');
      };

      const startPromise = fx.orchestrator.start(fx.request);
      await vi.waitFor(() => expect(fx.streamerControls.runs.length).toBe(1));
      const run = fx.streamerControls.runs[0];
      run.observer.onTransferBegun?.({ transferId: run.spec.transferId, status: 'OK' });
      fx.streamerControls.resolve(makeTransferResult(run.spec));

      let caught: unknown;
      try {
        await startPromise;
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(FlashOrchestratorError);
      expect((caught as FlashOrchestratorError).reason).toBe('subscriber_attach_failed');
      expect((caught as FlashOrchestratorError).detail).toContain('listener limit reached');

      const failed = emittedFrames(fx.emitWs, TransmissionType.flashJobFailed);
      expect(failed).toHaveLength(1);
      expect(failed[0].data).toMatchObject({ reason: 'subscriber_attach_failed' });

      // Controllers transitioned to Failed (they were in Sending after the
      // streamer.run resolved + the post-streamer Sending transition fired).
      const results = controllerResults(fx.emitWs);
      expect(results).toHaveLength(2);
      expect(results.every((r) => r.controller.stage === FwStage.Failed)).toBe(true);

      expect(fx.jobLock.isLocked()).toBe(false);
      expect(fx.orchestrator.getCurrentJob()).toBeNull();
    });

    // Exhaustive lock + currentJob discipline check across every error
    // entry point. Mutation discipline: if a future refactor drops the
    // `releaseLock(jobId)` call from `failJob`, every one of these
    // parameterized cases would fail simultaneously — single source of
    // truth for "every error path releases the lock and clears
    // currentJob."
    type LockReleaseScenario = {
      name: string;
      drive: (fx: ReturnType<typeof setupHappyPath>) => Promise<void>;
    };
    const lockReleaseScenarios: LockReleaseScenario[] = [
      {
        name: 'no_controllers',
        drive: async (fx) => {
          fx.controllersStore.listFlashTargets.mockResolvedValue([]);
          await fx.orchestrator.start(fx.request).catch(() => undefined);
        },
      },
      {
        name: 'variant_mismatch',
        drive: async (fx) => {
          fx.controllersStore.listFlashTargets.mockResolvedValue([
            { id: 'a', variant: 'lolin_d32_pro' },
            { id: 'b', variant: 'metro_s3' },
          ]);
          await fx.orchestrator.start(fx.request).catch(() => undefined);
        },
      },
      {
        name: 'variant_unknown',
        drive: async (fx) => {
          fx.controllersStore.listFlashTargets.mockResolvedValue([
            { id: 'a', variant: 'lolin_d32_pro' },
            { id: 'b', variant: '' },
          ]);
          await fx.orchestrator.start(fx.request).catch(() => undefined);
        },
      },
      {
        name: 'controllers_lookup_failed',
        drive: async (fx) => {
          fx.controllersStore.listFlashTargets.mockRejectedValue(new Error('db down'));
          await fx.orchestrator.start(fx.request).catch(() => undefined);
        },
      },
      {
        name: 'release_lookup_failed',
        drive: async (fx) => {
          fx.releaseService.getReleases.mockRejectedValue(new Error('upstream'));
          await fx.orchestrator.start(fx.request).catch(() => undefined);
        },
      },
      {
        name: 'release_not_found',
        drive: async (fx) => {
          fx.releaseService.getReleases.mockResolvedValue({ releases: [], staleSince: null });
          await fx.orchestrator.start(fx.request).catch(() => undefined);
        },
      },
      {
        name: 'asset_not_found',
        drive: async (fx) => {
          fx.releaseService.getReleases.mockResolvedValue({
            releases: [makeRelease({ assets: [makeAsset({ variant: 'metro_s3' })] })],
            staleSince: null,
          });
          await fx.orchestrator.start(fx.request).catch(() => undefined);
        },
      },
      {
        name: 'source_resolution_failed (cache.fetch reject)',
        drive: async (fx) => {
          fx.cache.fetch.mockRejectedValue(new Error('fs'));
          await fx.orchestrator.start(fx.request).catch(() => undefined);
        },
      },
      {
        name: 'no_upload',
        drive: async (fx) => {
          // Upload source with empty store.
          fx.upload.latest.mockResolvedValue(null);
          await fx.orchestrator
            .start({ source: { kind: 'upload' } } as FlashRequest)
            .catch(() => undefined);
        },
      },
      {
        name: 'streamer TransferError',
        drive: async (fx) => {
          const startPromise = fx.orchestrator.start(fx.request);
          await vi.waitFor(() => expect(fx.streamerControls.runs.length).toBe(1));
          fx.streamerControls.reject(
            new TransferError('begin_timeout', fx.streamerControls.runs[0].spec.transferId),
          );
          await startPromise.catch(() => undefined);
        },
      },
      {
        name: 'streamer unknown error',
        drive: async (fx) => {
          const startPromise = fx.orchestrator.start(fx.request);
          await vi.waitFor(() => expect(fx.streamerControls.runs.length).toBe(1));
          fx.streamerControls.reject(new Error('mystery'));
          await startPromise.catch(() => undefined);
        },
      },
    ];

    for (const scenario of lockReleaseScenarios) {
      it(`every error path releases lock + clears currentJob + emits flashJobFailed: ${scenario.name}`, async () => {
        const fx = setupHappyPath();
        await scenario.drive(fx);

        expect(fx.jobLock.isLocked()).toBe(false);
        expect(fx.orchestrator.getCurrentJob()).toBeNull();
        const failed = emittedFrames(fx.emitWs, TransmissionType.flashJobFailed);
        expect(failed).toHaveLength(1);
      });
    }

    it('mid-deploy failure (bus.send throws): controllers transitioned via failJob; lock released', async () => {
      // Already covered by the existing bus_send_failed test in the
      // deploy-phase block, but pinned here against the failJob
      // consolidation: failJob is the single emitter of flashJobFailed
      // for this path now (was an inline emit in the catch pre-Task 11).
      const fx = setupHappyPath();
      const originalSend = fx.bus.send.bind(fx.bus);
      fx.bus.send = (payload, opts) => {
        if (opts.kind === 'firmware') throw new Error('worker channel closed');
        originalSend(payload, opts);
      };

      const startPromise = fx.orchestrator.start(fx.request);
      await vi.waitFor(() => expect(fx.streamerControls.runs.length).toBe(1));
      const run = fx.streamerControls.runs[0];
      run.observer.onTransferBegun?.({ transferId: run.spec.transferId, status: 'OK' });
      fx.streamerControls.resolve(makeTransferResult(run.spec));

      let caught: unknown;
      try {
        await startPromise;
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(FlashOrchestratorError);
      expect((caught as FlashOrchestratorError).reason).toBe('bus_send_failed');

      // Exactly one flashJobFailed frame — pinning that the catch block
      // doesn't double-emit (it would if the inline failNonTerminalControllers
      // pre-call had stayed alongside the failJob delegation).
      const failed = emittedFrames(fx.emitWs, TransmissionType.flashJobFailed);
      expect(failed).toHaveLength(1);
      expect(failed[0].data).toMatchObject({ reason: 'bus_send_failed' });

      // Per-controller results emitted exactly once each (failJob's
      // failNonTerminalControllers is the sole emitter; the duplicated
      // inline call has been removed).
      const results = controllerResults(fx.emitWs);
      expect(results).toHaveLength(2);
      expect(results.every((r) => r.controller.stage === FwStage.Failed)).toBe(true);

      expect(fx.jobLock.isLocked()).toBe(false);
      expect(fx.orchestrator.getCurrentJob()).toBeNull();
    });

    it('protocol_violation through failJob (mutation-discipline pin for the failDeployPhase delegation)', async () => {
      // Reverting failDeployPhase to its pre-Task 11 inline emit (rather
      // than delegating to failJob) wouldn't break anything observable —
      // both produce the same shape — but this test pins the consolidation
      // by checking that the protocol_violation path still emits the
      // flashJobFailed shape with all four bucket-shape fields
      // (jobId, reason, detail, endedAt). The detail surfaces the
      // wire-validation message.
      const fx = setupHappyPath();
      const startPromise = fx.orchestrator.start(fx.request);
      await vi.waitFor(() => expect(fx.streamerControls.runs.length).toBe(1));
      const run = fx.streamerControls.runs[0];
      run.observer.onTransferBegun?.({ transferId: run.spec.transferId, status: 'OK' });
      fx.streamerControls.resolve(makeTransferResult(run.spec));
      const armed = await startPromise;

      fx.bus.deliverDeployEvent(armed.transferId, {
        kind: 'progress',
        payload: {
          transferId: armed.transferId,
          controllerId: 'controller-a',
          stage: 'BOGUS' as unknown as FwStage,
          bytesSent: 0,
          totalBytes: 0,
          detail: '',
        },
      });

      const failed = emittedFrames(fx.emitWs, TransmissionType.flashJobFailed);
      expect(failed).toHaveLength(1);
      const data = failed[0].data as {
        jobId: string;
        reason: string;
        detail: string;
        endedAt: string;
      };
      expect(data.jobId).toBe(armed.jobId);
      expect(data.reason).toBe('protocol_violation');
      expect(data.detail).toContain('BOGUS');
      expect(data.endedAt).toMatch(/^\d{4}-/);
    });

    it('failJob is load-bearing: TransferError without bucket-B handling would skip controller cleanup (mutation-discipline pin)', async () => {
      // If start()'s catch block only emitted flashJobFailed for
      // FlashOrchestratorError (the pre-Task 11 behavior), a TransferError
      // would fall through with NO flashJobFailed and NO per-controller
      // failNonTerminal cleanup. This test pins both: TransferError fires
      // a typed flashJobFailed AND transitions every controller to Failed.
      // A regression that drops the `else if (err instanceof TransferError)`
      // branch fails this assertion.
      const fx = setupHappyPath();
      const startPromise = fx.orchestrator.start(fx.request);
      await vi.waitFor(() => expect(fx.streamerControls.runs.length).toBe(1));
      const run = fx.streamerControls.runs[0];
      run.observer.onTransferBegun?.({ transferId: run.spec.transferId, status: 'OK' });
      fx.streamerControls.reject(new TransferError('hash_mismatch', run.spec.transferId, 'h'));
      await expect(startPromise).rejects.toBeInstanceOf(TransferError);

      const failed = emittedFrames(fx.emitWs, TransmissionType.flashJobFailed);
      expect(failed).toHaveLength(1);
      expect(failed[0].data).toMatchObject({
        reason: 'hash_mismatch',
        abortReason: 'hash_mismatch',
      });
      const results = controllerResults(fx.emitWs);
      // 2 controllers, every one transitioned to Failed. Without the
      // bucket-B handling, results would be 0 (no failNonTerminalControllers
      // call from the catch).
      expect(results).toHaveLength(2);
      expect(results.every((r) => r.controller.stage === FwStage.Failed)).toBe(true);
    });
  });

  describe('cancel', () => {
    // Same fake-timer pattern as the deploy-phase / reboot-timer blocks:
    // counter-backed clock + faked setTimeout/clearTimeout so the throttle
    // window math + reboot timer stay deterministic. Cancel-during-deploy
    // doesn't strictly need the throttle to advance, but the orchestrator's
    // throttle is constructed against the injected clock and asserts on
    // controllers' `flashControllerResult` emits which run through that
    // clock — keeping the pattern uniform avoids subtle ordering surprises.
    let nowMs = 0;

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      nowMs = 0;
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    function advance(ms: number): void {
      nowMs += ms;
      vi.advanceTimersByTime(ms);
    }

    const fakeClock: Clock = {
      now: () => nowMs,
      setTimeout: (cb, ms) => globalThis.setTimeout(cb, ms),
      clearTimeout: (t) => globalThis.clearTimeout(t),
    };

    function controllerResults(emitWs: ReturnType<typeof vi.fn>): Array<{
      jobId: string;
      controller: ControllerFlashState;
    }> {
      return emittedFrames(emitWs, TransmissionType.flashControllerResult).map(
        (frame) => (frame as { data: { jobId: string; controller: ControllerFlashState } }).data,
      );
    }

    it('cancel with no active job: returns null (no emits, lock unchanged)', async () => {
      const fx = setupHappyPath({ clock: fakeClock });
      const result = await fx.orchestrator.cancel('test');

      expect(result).toBeNull();
      expect(fx.emitWs).not.toHaveBeenCalled();
      expect(fx.jobLock.isLocked()).toBe(false);
      expect(fx.orchestrator.getCurrentJob()).toBeNull();
    });

    it('cancel during upload: fires AbortController; streamer rejection cleans up; returns jobId', async () => {
      const fx = setupHappyPath({ clock: fakeClock });

      const startPromise = fx.orchestrator.start(fx.request);
      await vi.waitFor(() => expect(fx.streamerControls.runs.length).toBe(1));

      // The orchestrator passed an AbortSignal to streamer.run.
      const run = fx.streamerControls.runs[0];
      expect(run.signal).toBeDefined();
      expect(run.signal?.aborted).toBe(false);

      const inflight = fx.orchestrator.getCurrentJob();
      expect(inflight).not.toBeNull();
      const expectedJobId = inflight?.jobId;

      // Cancel mid-upload. The stub-streamer doesn't itself listen for the
      // signal (it returns a controllable promise), so we observe the abort
      // via `signal.aborted` and then drive the rejection by calling
      // `controls.reject(...)` with TransferError('aborted', ...) — c.6b's
      // real ChunkStreamer would do the same when its own abort listener
      // fires. The cancel() promise resolves once it's handed control off
      // to the streamer; we don't await `startPromise` until after we
      // simulate the rejection.
      const cancelResult = fx.orchestrator.cancel('user-initiated');

      expect(run.signal?.aborted).toBe(true);
      // .reason carries the cancel reason (Node 18+ AbortController behavior).
      expect(run.signal?.reason).toBe('user-initiated');
      const resolved = await cancelResult;
      expect(resolved).toEqual({ jobId: expectedJobId });

      // Drive the streamer rejection — TransferError('aborted', ...) is what
      // the real ChunkStreamer rejects with on signal-fire.
      fx.streamerControls.reject(new TransferError('aborted', run.spec.transferId));

      // start() rethrows the streamer rejection.
      let caught: unknown;
      try {
        await startPromise;
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(TransferError);
      expect((caught as TransferError).code).toBe('aborted');

      // After the catch block: lock released, currentJob cleared.
      expect(fx.jobLock.isLocked()).toBe(false);
      expect(fx.orchestrator.getCurrentJob()).toBeNull();
      // No deploy subscriber was attached (we never reached deploy phase).
      expect(fx.bus.deploySubscribers.size).toBe(0);

      // Task 11: the cancel-during-upload path now emits a typed
      // flashJobFailed via failJob — the TransferError 'aborted' code is
      // surfaced as both the `reason` and `abortReason`. Operator UIs
      // distinguish "the streamer aborted" from "it just hung" without
      // having to read the lockStateChanged event in isolation.
      const failed = emittedFrames(fx.emitWs, TransmissionType.flashJobFailed);
      expect(failed).toHaveLength(1);
      expect(failed[0].data).toMatchObject({
        reason: 'aborted',
        abortReason: 'aborted',
      });
      // Both controllers were transitioned to Failed before the lock
      // released (failNonTerminalControllers fires for the streamer-
      // rejection bucket).
      const results = controllerResults(fx.emitWs);
      expect(results).toHaveLength(2);
      expect(results.every((r) => r.controller.stage === FwStage.Failed)).toBe(true);
    });

    it('cancel during upload: requires AbortController setup in start() (mutation-discipline pin)', async () => {
      // This test fails if `this.abortController = new AbortController()` is
      // removed from start(): no signal would land in streamer.run, so
      // run.signal would be undefined and the cancel-during-upload path
      // would have nothing to fire. Pinning the signal threading.
      const fx = setupHappyPath({ clock: fakeClock });
      const startPromise = fx.orchestrator.start(fx.request);
      await vi.waitFor(() => expect(fx.streamerControls.runs.length).toBe(1));

      expect(fx.streamerControls.runs[0].signal).toBeInstanceOf(AbortSignal);

      // Drain so the test exits cleanly.
      fx.streamerControls.resolve(makeTransferResult(fx.streamerControls.runs[0].spec));
      await startPromise;
    });

    it('cancel during deploy: disposes deploy subscriber, fails non-terminal controllers, emits flashJobFailed with abortReason, releases lock', async () => {
      const fx = setupHappyPath({ clock: fakeClock });

      // Drive into the deploy phase: streamer resolves, FW_DEPLOY_BEGIN
      // sent, deploy subscriber armed. Don't deliver any FW_PROGRESS so
      // both controllers stay in `Sending` (non-terminal).
      const startPromise = fx.orchestrator.start(fx.request);
      await vi.waitFor(() => expect(fx.streamerControls.runs.length).toBe(1));
      const run = fx.streamerControls.runs[0];
      run.observer.onTransferBegun?.({ transferId: run.spec.transferId, status: 'OK' });
      fx.streamerControls.resolve(makeTransferResult(run.spec));
      const armed = await startPromise;

      expect(fx.bus.deploySubscribers.has(armed.transferId)).toBe(true);
      expect(fx.jobLock.isLocked()).toBe(true);
      const baselineResults = controllerResults(fx.emitWs).length;
      const lockEventsBefore = emittedFrames(fx.emitWs, TransmissionType.lockStateChanged).length;

      // Cancel mid-deploy.
      const cancelResult = await fx.orchestrator.cancel('operator-cancel');
      expect(cancelResult).toEqual({ jobId: armed.jobId });

      // Subscriber disposed.
      expect(fx.bus.deploySubscribers.has(armed.transferId)).toBe(false);

      // Each non-terminal controller transitioned to Failed with the cancel
      // reason as the error string + got a flashControllerResult emission.
      const newResults = controllerResults(fx.emitWs).slice(baselineResults);
      expect(newResults).toHaveLength(2);
      for (const r of newResults) {
        expect(r.jobId).toBe(armed.jobId);
        expect(r.controller.stage).toBe(FwStage.Failed);
        if (r.controller.stage === FwStage.Failed) {
          expect(r.controller.error).toBe('operator-cancel');
        }
      }

      // flashJobFailed emitted with abortReason carrying the cancel reason.
      const failed = emittedFrames(fx.emitWs, TransmissionType.flashJobFailed);
      expect(failed).toHaveLength(1);
      expect(failed[0].data).toMatchObject({
        jobId: armed.jobId,
        abortReason: 'operator-cancel',
      });
      expect((failed[0].data as { endedAt: string }).endedAt).toMatch(/^\d{4}-/);

      // Lock released; lockStateChanged emitted; currentJob cleared.
      expect(fx.jobLock.isLocked()).toBe(false);
      expect(fx.orchestrator.getCurrentJob()).toBeNull();
      expect(emittedFrames(fx.emitWs, TransmissionType.lockStateChanged)).toHaveLength(
        lockEventsBefore + 1,
      );
    });

    it('cancel during reboot-timer wait (post-flashJobDone): no-op (returns null, lock still held until timer/heartbeat)', async () => {
      // Drive a happy path job all the way through to flashJobDone so the
      // phase is 'done' and the reboot timer is armed.
      const fx = setupHappyPath({ clock: fakeClock });
      const startPromise = fx.orchestrator.start(fx.request);
      await vi.waitFor(() => expect(fx.streamerControls.runs.length).toBe(1));
      const run = fx.streamerControls.runs[0];
      run.observer.onTransferBegun?.({ transferId: run.spec.transferId, status: 'OK' });
      fx.streamerControls.resolve(makeTransferResult(run.spec));
      const armed = await startPromise;

      // Walk both controllers to Rebooting then deliver FW_DEPLOY_DONE all OK.
      for (const controllerId of armed.targets) {
        for (const stage of [FwStage.Verifying, FwStage.Rebooting]) {
          fx.bus.deliverDeployEvent(armed.transferId, {
            kind: 'progress',
            payload: {
              transferId: armed.transferId,
              controllerId,
              stage,
              bytesSent: 0,
              totalBytes: 0,
              detail: '',
            },
          });
        }
      }
      fx.bus.deliverDeployEvent(armed.transferId, {
        kind: 'done',
        payload: {
          transferId: armed.transferId,
          results: armed.targets.map((id) => ({
            controllerId: id,
            outcome: 'OK',
            finalVersion: '1.4.0',
            error: '',
          })),
        },
      });

      // We're now in the post-flashJobDone, pre-release window. Lock still
      // held; reboot timer armed; phase === 'done'.
      expect(fx.jobLock.isLocked()).toBe(true);
      expect(vi.getTimerCount()).toBe(1);
      const failedBefore = emittedFrames(fx.emitWs, TransmissionType.flashJobFailed).length;
      const lockEventsBefore = emittedFrames(fx.emitWs, TransmissionType.lockStateChanged).length;

      // Cancel arrives. Per spec §"Cancel race windows": "cancel in window 2
      // is a no-op since the work is already done."
      const cancelResult = await fx.orchestrator.cancel('too-late');
      expect(cancelResult).toBeNull();

      // No flashJobFailed emit, no lock release, currentJob still set, timer
      // still armed.
      expect(emittedFrames(fx.emitWs, TransmissionType.flashJobFailed)).toHaveLength(failedBefore);
      expect(emittedFrames(fx.emitWs, TransmissionType.lockStateChanged)).toHaveLength(
        lockEventsBefore,
      );
      expect(fx.jobLock.isLocked()).toBe(true);
      expect(fx.orchestrator.getCurrentJob()).not.toBeNull();
      expect(vi.getTimerCount()).toBe(1);

      // Drain the timer so the test exits cleanly.
      advance(15_000);
      expect(fx.jobLock.isLocked()).toBe(false);
    });

    it('cancel race: arrives before currentJob is set (mid-source-resolution): returns null; start continues', async () => {
      // Hold up source resolution by making releaseService.getReleases return
      // a never-settling promise; cancel() arrives in that window. Per spec
      // §"Cancel race windows": "cancel in window 1 returns 404 (no
      // currentJob yet); operator retries cancel after flashJobStarted."
      let releaseGate: () => void = () => {
        throw new Error('gate not yet captured');
      };
      const release = makeRelease();
      const cachedAsset = makeCachedAsset();
      const bus = new FakeSerialBus();
      const cache = { fetch: vi.fn().mockResolvedValue(cachedAsset) };
      const upload = { latest: vi.fn().mockResolvedValue(null) };
      const releaseService = {
        getReleases: vi.fn().mockImplementation(
          () =>
            new Promise<ReleaseListResult>((resolve) => {
              releaseGate = () => resolve(makeReleaseList([release]));
            }),
        ),
      };
      const controllersStore = {
        listFlashTargets: vi.fn().mockResolvedValue([
          { id: 'controller-a', variant: 'lolin_d32_pro' },
          { id: 'controller-b', variant: 'lolin_d32_pro' },
        ]),
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
        clock: fakeClock,
      });

      // Kick off start(); it will block in releaseService.getReleases().
      const startPromise = orchestrator.start({ source: { kind: 'github', version: '1.4.0' } });
      // Yield enough microtasks for the orchestrator to land in the
      // `getReleases()` await — controllersStore + lock acquisition are
      // synchronous and the resolveFlashSource entry point hits the
      // releaseService first.
      await vi.waitFor(() => expect(releaseService.getReleases).toHaveBeenCalled());

      // currentJob is NOT yet set (source resolution hasn't completed).
      expect(orchestrator.getCurrentJob()).toBeNull();
      // Lock IS held (window 1 of the race).
      expect(jobLock.isLocked()).toBe(true);

      // Cancel returns null (no currentJob to capture jobId from).
      const cancelResult = await orchestrator.cancel('mid-resolve');
      expect(cancelResult).toBeNull();

      // Unblock the resolver; start() proceeds to streamer.run.
      releaseGate();
      await vi.waitFor(() => expect(streamerControls.runs.length).toBe(1));

      // Drain to completion so the test exits cleanly.
      streamerControls.resolve(makeTransferResult(streamerControls.runs[0].spec));
      await startPromise;
    });

    it('cancel during deploy: requires phase tracking (mutation-discipline pin for the deploy branch)', async () => {
      // If the phase==='deploy' branch were collapsed into the upload
      // branch (i.e., always abort the controller), the cancel-during-deploy
      // call would be a no-op against the already-settled streamer — no
      // flashJobFailed emit, no controller cleanup, no lock release. This
      // test pins that the deploy branch runs the inline cleanup.
      const fx = setupHappyPath({ clock: fakeClock });
      const startPromise = fx.orchestrator.start(fx.request);
      await vi.waitFor(() => expect(fx.streamerControls.runs.length).toBe(1));
      const run = fx.streamerControls.runs[0];
      run.observer.onTransferBegun?.({ transferId: run.spec.transferId, status: 'OK' });
      fx.streamerControls.resolve(makeTransferResult(run.spec));
      await startPromise;

      // Mid-deploy cancel: must produce flashJobFailed + release lock.
      await fx.orchestrator.cancel('verify-deploy-branch');

      const failed = emittedFrames(fx.emitWs, TransmissionType.flashJobFailed);
      expect(failed).toHaveLength(1);
      expect(fx.jobLock.isLocked()).toBe(false);
    });

    it('cancel during reboot wait: phase === "done" guard fires (mutation-discipline pin)', async () => {
      // Reverting `if (this.phase === 'done') return null;` makes this fail —
      // cancel would fall through to the deploy branch, attempt to dispose
      // an already-disposed deployUnsubscriber, then call
      // failNonTerminalControllers which would either throw (terminal
      // controllers can't transition further) or emit spurious results, and
      // would emit an extra flashJobFailed for an already-done job.
      const fx = setupHappyPath({ clock: fakeClock });
      const startPromise = fx.orchestrator.start(fx.request);
      await vi.waitFor(() => expect(fx.streamerControls.runs.length).toBe(1));
      const run = fx.streamerControls.runs[0];
      run.observer.onTransferBegun?.({ transferId: run.spec.transferId, status: 'OK' });
      fx.streamerControls.resolve(makeTransferResult(run.spec));
      const armed = await startPromise;

      for (const controllerId of armed.targets) {
        for (const stage of [FwStage.Verifying, FwStage.Rebooting]) {
          fx.bus.deliverDeployEvent(armed.transferId, {
            kind: 'progress',
            payload: {
              transferId: armed.transferId,
              controllerId,
              stage,
              bytesSent: 0,
              totalBytes: 0,
              detail: '',
            },
          });
        }
      }
      fx.bus.deliverDeployEvent(armed.transferId, {
        kind: 'done',
        payload: {
          transferId: armed.transferId,
          results: armed.targets.map((id) => ({
            controllerId: id,
            outcome: 'OK',
            finalVersion: '1.4.0',
            error: '',
          })),
        },
      });

      const failedBefore = emittedFrames(fx.emitWs, TransmissionType.flashJobFailed).length;

      // Cancel — must be a no-op.
      const result = await fx.orchestrator.cancel('after-done');
      expect(result).toBeNull();

      // No additional flashJobFailed.
      expect(emittedFrames(fx.emitWs, TransmissionType.flashJobFailed)).toHaveLength(failedBefore);

      // Drain timer.
      advance(15_000);
    });
  });
});
