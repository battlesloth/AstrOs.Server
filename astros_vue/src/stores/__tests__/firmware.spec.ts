import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('@/api/apiService', () => ({
  default: {
    get: vi.fn(),
  },
}));

import apiService from '@/api/apiService';
import { useFirmwareStore } from '../firmware';
import type { ReleaseInfo, ReleaseListResult } from '@/types/firmware';

const apiGet = apiService.get as ReturnType<typeof vi.fn>;

const sampleReleases: ReleaseInfo[] = [
  {
    tag: 'v1.4.2',
    version: '1.4.2',
    publishedAt: '2026-04-18T12:00:00Z',
    prerelease: false,
    assets: [
      {
        variant: 'lolin_d32_pro',
        version: '1.4.2',
        assetName: 'astros-esp-1.4.2-lolin_d32_pro-app.bin',
        assetUrl: 'https://example.invalid/v1.4.2.bin',
        sizeBytes: 1_210_000,
      },
    ],
  },
  {
    tag: 'v1.4.0',
    version: '1.4.0',
    publishedAt: '2026-03-30T12:00:00Z',
    prerelease: false,
    assets: [
      {
        variant: 'lolin_d32_pro',
        version: '1.4.0',
        assetName: 'astros-esp-1.4.0-lolin_d32_pro-app.bin',
        assetUrl: 'https://example.invalid/v1.4.0.bin',
        sizeBytes: 1_190_000,
      },
    ],
  },
];

describe('firmware store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    apiGet.mockReset();
  });

  describe('initial state', () => {
    it('starts with empty releases, github source mode, and idle load state', () => {
      const store = useFirmwareStore();

      expect(store.releases).toEqual([]);
      expect(store.releasesLoadState).toBe('idle');
      expect(store.staleSince).toBeNull();
      expect(store.sourceMode).toBe('github');
      expect(store.selectedReleaseVersion).toBeNull();
      expect(store.uploadedFilename).toBeNull();
    });
  });

  describe('fetchReleases', () => {
    it('hits GET /api/firmware/releases and populates state on success', async () => {
      const envelope: ReleaseListResult = {
        releases: sampleReleases,
        staleSince: null,
      };
      apiGet.mockResolvedValueOnce(envelope);

      const store = useFirmwareStore();
      await store.fetchReleases();

      expect(apiGet).toHaveBeenCalledWith('api/firmware/releases');
      expect(apiGet).toHaveBeenCalledTimes(1);
      expect(store.releases).toEqual(sampleReleases);
      expect(store.releasesLoadState).toBe('loaded');
      expect(store.staleSince).toBeNull();
    });

    it('marks state as `stale` and surfaces staleSince when the server is serving stale cache', async () => {
      const envelope: ReleaseListResult = {
        releases: sampleReleases,
        staleSince: '2026-04-25T12:00:00.000Z',
      };
      apiGet.mockResolvedValueOnce(envelope);

      const store = useFirmwareStore();
      await store.fetchReleases();

      expect(store.releases).toEqual(sampleReleases);
      expect(store.releasesLoadState).toBe('stale');
      expect(store.staleSince).toBe('2026-04-25T12:00:00.000Z');
    });

    it('transitions to `error` and preserves prior releases on failure', async () => {
      const initialEnvelope: ReleaseListResult = {
        releases: sampleReleases,
        staleSince: null,
      };
      apiGet.mockResolvedValueOnce(initialEnvelope);

      const store = useFirmwareStore();
      await store.fetchReleases();

      apiGet.mockRejectedValueOnce(new Error('network'));
      await store.fetchReleases();

      expect(store.releasesLoadState).toBe('error');
      // Prior releases are intentionally preserved so the UI can keep
      // displaying the last known list while showing an error indicator.
      expect(store.releases).toEqual(sampleReleases);
    });

    it('sets state to `loading` while the fetch is in flight', async () => {
      let resolveFetch: ((value: ReleaseListResult) => void) | null = null;
      apiGet.mockImplementationOnce(
        () =>
          new Promise<ReleaseListResult>((resolve) => {
            resolveFetch = resolve;
          }),
      );

      const store = useFirmwareStore();
      const promise = store.fetchReleases();

      expect(store.releasesLoadState).toBe('loading');
      expect(resolveFetch).not.toBeNull();

      resolveFetch!({ releases: sampleReleases, staleSince: null });
      await promise;

      expect(store.releasesLoadState).toBe('loaded');
    });
  });

  describe('user selection state', () => {
    it('allows direct mutation of sourceMode, selectedReleaseVersion, and uploadedFilename', () => {
      const store = useFirmwareStore();

      store.sourceMode = 'upload';
      store.uploadedFilename = 'custom-firmware.bin';
      expect(store.sourceMode).toBe('upload');
      expect(store.uploadedFilename).toBe('custom-firmware.bin');

      store.sourceMode = 'github';
      store.selectedReleaseVersion = 'v1.4.2';
      expect(store.sourceMode).toBe('github');
      expect(store.selectedReleaseVersion).toBe('v1.4.2');
      // Upload filename is preserved across mode switches per the design
      // handoff §Source toggle ("preserves their respective state").
      expect(store.uploadedFilename).toBe('custom-firmware.bin');
    });
  });
});
