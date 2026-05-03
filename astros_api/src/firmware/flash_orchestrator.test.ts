import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFlashProgressThrottle, resolveFlashSource } from './flash_orchestrator.js';
import type { Clock, FlashRequest } from '../models/firmware/flash_orchestrator.js';
import type { ControllerFlashState } from '../models/firmware/flash_job_state.js';
import { FwStage } from '../models/firmware/firmware_messages.js';
import type { AssetInfo, ReleaseInfo, ReleaseListResult } from '../models/firmware/release.js';
import type { CachedAsset } from '../models/firmware/cache.js';
import type { StoredUpload } from '../models/firmware/upload.js';

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
  it('returns FlashSource with kind=github and variant in displayName on happy path', async () => {
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
      kind: 'github',
      version: '1.4.0',
      sha256: 'a'.repeat(64),
      sizeBytes: 1_200_000,
      displayName: 'astros-esp 1.4.0 (lolin_d32_pro)',
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

    expect(result.kind).toBe('github');
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
  it('returns FlashSource with kind=upload and displayName from originalFilename', async () => {
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
      kind: 'upload',
      version: '1.5.0-dev',
      sha256: 'b'.repeat(64),
      sizeBytes: 950_000,
      displayName: 'my-custom-build.bin',
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
});
