import { describe, it, expect, vi } from 'vitest';
import { resolveFlashSource } from './flash_orchestrator.js';
import type { FlashRequest } from '../models/firmware/flash_orchestrator.js';
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
