import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getReleases } from './firmware_releases_controller.js';
import type { GitHubReleaseService } from '../firmware/github_release_service.js';
import type { ReleaseInfo, ReleaseListResult } from '../models/firmware/release.js';
import { logger } from '../logger.js';

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

interface FakeReleaseService {
  getReleases: ReturnType<typeof vi.fn>;
}

function fakeReleaseService(): FakeReleaseService {
  return { getReleases: vi.fn() };
}

const sampleRelease: ReleaseInfo = {
  tag: 'v1.4.0',
  version: '1.4.0',
  publishedAt: '2026-03-30T12:00:00Z',
  prerelease: false,
  assets: [
    {
      variant: 'lolin_d32_pro',
      version: '1.4.0',
      assetName: 'astros-esp-1.4.0-lolin_d32_pro-app.bin',
      assetUrl: 'https://example.invalid/astros-esp-1.4.0-lolin_d32_pro-app.bin',
      sizeBytes: 1_200_000,
    },
  ],
};

describe('Firmware Releases Controller', () => {
  let service: FakeReleaseService;

  beforeEach(() => {
    service = fakeReleaseService();
  });

  describe('GET /api/firmware/releases', () => {
    it('returns 200 with the service envelope on a fresh fetch', async () => {
      const envelope: ReleaseListResult = {
        releases: [sampleRelease],
        staleSince: null,
      };
      service.getReleases.mockResolvedValueOnce(envelope);

      const req: any = {};
      const res = mockRes();

      await getReleases(service as unknown as GitHubReleaseService, req, res, vi.fn());

      expect(service.getReleases).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(envelope);
    });

    it('returns 200 with staleSince populated when serving stale cache', async () => {
      const envelope: ReleaseListResult = {
        releases: [sampleRelease],
        staleSince: '2026-04-25T12:00:00.000Z',
      };
      service.getReleases.mockResolvedValueOnce(envelope);

      const req: any = {};
      const res = mockRes();

      await getReleases(service as unknown as GitHubReleaseService, req, res, vi.fn());

      expect(service.getReleases).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(envelope);
    });

    it('returns 502 release_lookup_failed when the service throws (cold cache failure)', async () => {
      const upstreamMessage = 'GitHub releases endpoint returned 503 Service Unavailable';
      service.getReleases.mockRejectedValueOnce(new Error(upstreamMessage));
      const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined as any);

      const req: any = {};
      const res = mockRes();

      await getReleases(service as unknown as GitHubReleaseService, req, res, vi.fn());

      expect(service.getReleases).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(502);
      expect(res.json).toHaveBeenCalledWith({
        error: 'release_lookup_failed',
        detail: upstreamMessage,
      });
      // Pass-through of the original Error preserves stack/cause; the
      // contextual message goes in the second argument per pino's
      // `(err, msg)` overload. This is what the flash controller does too.
      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({ message: upstreamMessage }),
        'firmware releases fetch failed',
      );
      errorSpy.mockRestore();
    });
  });
});
