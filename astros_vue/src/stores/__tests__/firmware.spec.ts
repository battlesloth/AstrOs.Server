import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('@/api/apiService', () => ({
  default: {
    get: vi.fn(),
  },
}));

import apiService from '@/api/apiService';
import { useFirmwareStore } from '../firmware';
import type { FirmwareControllerView, ReleaseInfo, ReleaseListResult } from '@/types/firmware';

const sampleControllers: FirmwareControllerView[] = [
  { id: 'body', label: 'Body', glyph: 'B', current: 'v1.3.0', status: 'up', isMaster: true },
  { id: 'core', label: 'Core', glyph: 'C', current: 'v1.4.0', status: 'up', isMaster: false },
  { id: 'dome', label: 'Dome', glyph: 'D', current: 'v1.4.0', status: 'down', isMaster: false },
];

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
      expect(store.selectedReleaseTag).toBeNull();
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
    it('allows direct mutation of sourceMode, selectedReleaseTag, and uploadedFilename', () => {
      const store = useFirmwareStore();

      store.sourceMode = 'upload';
      store.uploadedFilename = 'custom-firmware.bin';
      expect(store.sourceMode).toBe('upload');
      expect(store.uploadedFilename).toBe('custom-firmware.bin');

      store.sourceMode = 'github';
      store.selectedReleaseTag = 'v1.4.2';
      expect(store.sourceMode).toBe('github');
      expect(store.selectedReleaseTag).toBe('v1.4.2');
      // Upload filename is preserved across mode switches per the design
      // handoff §Source toggle ("preserves their respective state").
      expect(store.uploadedFilename).toBe('custom-firmware.bin');
    });
  });

  describe('target computed', () => {
    it('returns the selected release tag in github mode', () => {
      const store = useFirmwareStore();
      store.sourceMode = 'github';
      store.selectedReleaseTag = 'v1.4.2';
      expect(store.target).toBe('v1.4.2');
    });

    it('returns null in github mode with no release selected', () => {
      const store = useFirmwareStore();
      store.sourceMode = 'github';
      store.selectedReleaseTag = null;
      expect(store.target).toBeNull();
    });

    it("returns 'local-build' sentinel in upload mode with a filename", () => {
      const store = useFirmwareStore();
      store.sourceMode = 'upload';
      store.uploadedFilename = 'custom.bin';
      expect(store.target).toBe('local-build');
    });

    it('returns null in upload mode with no file', () => {
      const store = useFirmwareStore();
      store.sourceMode = 'upload';
      store.uploadedFilename = null;
      expect(store.target).toBeNull();
    });
  });

  describe('selection actions', () => {
    it('toggle adds an id when absent and removes it when present', () => {
      const store = useFirmwareStore();
      store.controllers = sampleControllers;

      store.toggle('body');
      expect([...store.selectedControllerIds]).toEqual(['body']);
      store.toggle('core');
      expect([...store.selectedControllerIds].sort()).toEqual(['body', 'core']);
      store.toggle('body');
      expect([...store.selectedControllerIds]).toEqual(['core']);
    });

    it('toggle replaces the Set reference so Vue reactivity observes the change', () => {
      const store = useFirmwareStore();
      store.controllers = sampleControllers;
      const before = store.selectedControllerIds;
      store.toggle('body');
      expect(store.selectedControllerIds).not.toBe(before);
    });

    it('selectAll picks every online, non-downgrade controller', () => {
      const store = useFirmwareStore();
      store.controllers = sampleControllers;
      store.sourceMode = 'github';
      store.selectedReleaseTag = 'v1.4.2';

      const before = store.selectedControllerIds;
      store.selectAll();
      // Body (v1.3.0 → v1.4.2: upgrade, online) included.
      // Core (v1.4.0 → v1.4.2: upgrade, online) included.
      // Dome offline → excluded.
      expect([...store.selectedControllerIds].sort()).toEqual(['body', 'core']);
      expect(store.selectedControllerIds).not.toBe(before);
    });

    it('selectAll skips controllers whose current version is newer than target (downgrade)', () => {
      const store = useFirmwareStore();
      store.controllers = sampleControllers;
      store.sourceMode = 'github';
      store.selectedReleaseTag = 'v1.3.5';

      store.selectAll();
      // Body (v1.3.0 → v1.3.5: upgrade, online) included.
      // Core (v1.4.0 → v1.3.5: downgrade) excluded.
      // Dome offline excluded.
      expect([...store.selectedControllerIds]).toEqual(['body']);
    });

    it('clear empties the selection and replaces the Set reference', () => {
      const store = useFirmwareStore();
      store.controllers = sampleControllers;
      store.toggle('body');
      store.toggle('core');
      const before = store.selectedControllerIds;
      store.clear();
      expect(store.selectedControllerIds.size).toBe(0);
      expect(store.selectedControllerIds).not.toBe(before);
    });
  });

  describe('anyDowngradeBlocked', () => {
    it('returns false when nothing is selected', () => {
      const store = useFirmwareStore();
      store.controllers = sampleControllers;
      store.sourceMode = 'github';
      store.selectedReleaseTag = 'v1.3.5';
      expect(store.anyDowngradeBlocked).toBe(false);
    });

    it('returns true when a selected controller would downgrade', () => {
      const store = useFirmwareStore();
      store.controllers = sampleControllers;
      store.sourceMode = 'github';
      store.selectedReleaseTag = 'v1.3.5';
      store.toggle('core'); // core is v1.4.0; v1.4.0 > v1.3.5
      expect(store.anyDowngradeBlocked).toBe(true);
    });

    it('treats current === target as not a downgrade (boundary: cmp === 0)', () => {
      // Pins the strict-inequality `cmp > 0` semantics in isDowngrade. A
      // mutation to `cmp >= 0` would flag an equal version as a downgrade
      // and this test would fail.
      const store = useFirmwareStore();
      store.controllers = sampleControllers;
      store.sourceMode = 'github';
      store.selectedReleaseTag = 'v1.4.0';
      store.toggle('core'); // core is v1.4.0; target is v1.4.0
      expect(store.anyDowngradeBlocked).toBe(false);
    });

    it('treats a malformed current version as not a downgrade (NaN > 0 is false)', () => {
      const store = useFirmwareStore();
      store.controllers = [
        {
          id: 'weird',
          label: 'Weird',
          glyph: 'W',
          current: 'not-a-version',
          status: 'up',
          isMaster: false,
        },
      ];
      store.sourceMode = 'github';
      store.selectedReleaseTag = 'v1.4.2';
      store.toggle('weird');
      expect(store.anyDowngradeBlocked).toBe(false);
    });
  });

  describe('controllers reconciler', () => {
    it('prunes selected ids that no longer exist after controllers is reassigned', async () => {
      const store = useFirmwareStore();
      store.controllers = sampleControllers;
      store.toggle('body');
      store.toggle('core');
      expect(store.selectedControllerIds.size).toBe(2);

      // Reassign with dome removed and core renamed.
      store.controllers = [
        { id: 'body', label: 'Body', glyph: 'B', current: 'v1.3.0', status: 'up', isMaster: true },
      ];
      // watch is async; flush via microtask.
      await Promise.resolve();
      expect([...store.selectedControllerIds]).toEqual(['body']);
    });

    it('does not touch the Set when no ids are orphaned', async () => {
      const store = useFirmwareStore();
      store.controllers = sampleControllers;
      store.toggle('body');
      const before = store.selectedControllerIds;
      store.controllers = [...sampleControllers]; // new reference, same ids
      await Promise.resolve();
      expect(store.selectedControllerIds).toBe(before);
    });
  });

  describe('canFlash', () => {
    it('is false with no target', () => {
      const store = useFirmwareStore();
      store.controllers = sampleControllers;
      store.toggle('body');
      expect(store.canFlash).toBe(false);
    });

    it('is false with target but no selection', () => {
      const store = useFirmwareStore();
      store.controllers = sampleControllers;
      store.sourceMode = 'github';
      store.selectedReleaseTag = 'v1.4.2';
      expect(store.canFlash).toBe(false);
    });

    it('is true with target + at least one upgrade selection', () => {
      const store = useFirmwareStore();
      store.controllers = sampleControllers;
      store.sourceMode = 'github';
      store.selectedReleaseTag = 'v1.4.2';
      store.toggle('body');
      expect(store.canFlash).toBe(true);
    });

    it('is false with target + selection but any selected controller would downgrade', () => {
      const store = useFirmwareStore();
      store.controllers = sampleControllers;
      store.sourceMode = 'github';
      store.selectedReleaseTag = 'v1.3.5';
      store.toggle('body'); // upgrade
      store.toggle('core'); // downgrade
      expect(store.canFlash).toBe(false);
    });
  });
});
