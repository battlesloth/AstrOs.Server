import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('@/api/apiService', () => ({
  default: {
    get: vi.fn(),
  },
  apiClient: {
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

import apiService, { apiClient } from '@/api/apiService';
import { useFirmwareStore } from '../firmware';
import type { FirmwareControllerView, ReleaseInfo, ReleaseListResult } from '@/types/firmware';

const sampleControllers: FirmwareControllerView[] = [
  { id: 'body', label: 'Body', glyph: 'B', current: 'v1.3.0', status: 'up', isMaster: true },
  { id: 'core', label: 'Core', glyph: 'C', current: 'v1.4.0', status: 'up', isMaster: false },
  { id: 'dome', label: 'Dome', glyph: 'D', current: 'v1.4.0', status: 'down', isMaster: false },
];

const apiGet = apiService.get as ReturnType<typeof vi.fn>;
const apiPost = apiClient.post as ReturnType<typeof vi.fn>;
const apiDelete = apiClient.delete as ReturnType<typeof vi.fn>;

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
    apiPost.mockReset();
    apiDelete.mockReset();
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

  describe('phase transitions', () => {
    it("starts in 'idle'", () => {
      const store = useFirmwareStore();
      expect(store.phase).toBe('idle');
    });

    it('setPhase replaces the current phase', () => {
      const store = useFirmwareStore();
      store.setPhase('select');
      expect(store.phase).toBe('select');
      store.setPhase('flashing');
      expect(store.phase).toBe('flashing');
    });

    it("resetToSelect clears currentStage, flashError, failedController and sets phase to 'select'", () => {
      const store = useFirmwareStore();
      store.setPhase('failed');
      store.currentStage = 'transfer';
      store.flashError = { reason: 'job_already_running' };
      store.failedController = { id: 'core', label: 'Core', stage: 'transfer' };

      store.resetToSelect();

      expect(store.phase).toBe('select');
      expect(store.currentStage).toBeNull();
      expect(store.flashError).toBeNull();
      expect(store.failedController).toBeNull();
    });

    it('dismissError clears flashError without changing phase', () => {
      const store = useFirmwareStore();
      store.setPhase('select');
      store.flashError = { reason: 'release_not_found' };
      store.dismissError();
      expect(store.flashError).toBeNull();
      expect(store.phase).toBe('select');
    });
  });

  describe('startFlash', () => {
    function readyStore() {
      const store = useFirmwareStore();
      store.controllers = sampleControllers;
      store.sourceMode = 'github';
      store.selectedReleaseTag = 'v1.4.2';
      store.toggle('body');
      store.setPhase('select');
      return store;
    }

    it("POSTs the github source shape and transitions to 'flashing' on 200", async () => {
      apiPost.mockResolvedValueOnce({ data: { jobId: 'job-1' } });
      const store = readyStore();

      await store.startFlash();

      expect(apiPost).toHaveBeenCalledWith(
        'api/firmware/flash',
        { source: { kind: 'github', version: 'v1.4.2' } },
        expect.objectContaining({ timeout: 30_000 }),
      );
      expect(store.phase).toBe('flashing');
      expect(store.flashError).toBeNull();
    });

    it("POSTs the upload source shape when sourceMode is 'upload'", async () => {
      apiPost.mockResolvedValueOnce({ data: { jobId: 'job-2' } });
      const store = useFirmwareStore();
      store.controllers = sampleControllers;
      store.sourceMode = 'upload';
      store.uploadedFilename = 'custom.bin';
      store.toggle('body');

      await store.startFlash();

      expect(apiPost).toHaveBeenCalledWith(
        'api/firmware/flash',
        { source: { kind: 'upload' } },
        expect.objectContaining({ timeout: 30_000 }),
      );
      expect(store.phase).toBe('flashing');
      expect(store.flashError).toBeNull();
    });

    it('clears a prior flashError when a retry POST succeeds', async () => {
      apiPost.mockResolvedValueOnce({ data: { jobId: 'job-retry' } });
      const store = readyStore();
      store.flashError = { reason: 'job_already_running', currentJobId: 'job-x' };

      await store.startFlash();

      expect(store.flashError).toBeNull();
      expect(store.phase).toBe('flashing');
    });

    it('replaces a prior flashError when a retry POST fails with a different reason', async () => {
      // Pins both that the prior envelope is cleared on retry AND that the
      // new envelope reflects the latest failure (not the earlier one).
      apiPost.mockRejectedValueOnce({
        response: { status: 400, data: { error: 'release_not_found' } },
      });
      const store = readyStore();
      store.flashError = { reason: 'job_already_running', currentJobId: 'job-x' };

      await store.startFlash();

      expect(store.flashError).toEqual({ reason: 'release_not_found' });
    });

    it("rolls phase back to 'select' and surfaces the error envelope on failure", async () => {
      apiPost.mockRejectedValueOnce({
        response: { status: 409, data: { error: 'job_already_running', currentJobId: 'job-x' } },
      });
      const store = readyStore();

      await store.startFlash();

      expect(store.phase).toBe('select');
      expect(store.flashError).toEqual({
        reason: 'job_already_running',
        currentJobId: 'job-x',
      });
    });

    it('surfaces network_error when the request never reaches the server', async () => {
      apiPost.mockRejectedValueOnce(new Error('Network Error'));
      const store = readyStore();

      await store.startFlash();

      expect(store.phase).toBe('select');
      expect(store.flashError).toEqual({ reason: 'network_error' });
    });

    it('is a no-op when canFlash is false (e.g. no controllers selected)', async () => {
      const store = useFirmwareStore();
      store.controllers = sampleControllers;
      store.sourceMode = 'github';
      store.selectedReleaseTag = 'v1.4.2';
      // No selection.
      await store.startFlash();
      expect(apiPost).not.toHaveBeenCalled();
      expect(store.phase).toBe('idle');
    });

    it("is a no-op when phase is already 'flashing' (double-click guard)", async () => {
      const store = readyStore();
      store.setPhase('flashing');
      await store.startFlash();
      expect(apiPost).not.toHaveBeenCalled();
    });
  });

  describe('cancelFlash', () => {
    it('sends a DELETE with the provided reason in the request body', async () => {
      apiDelete.mockResolvedValueOnce({ jobId: 'job-1', cancelled: true });
      const store = useFirmwareStore();
      await store.cancelFlash('operator-clicked-cancel');
      expect(apiDelete).toHaveBeenCalledWith('api/firmware/flash', {
        data: { reason: 'operator-clicked-cancel' },
      });
    });

    it('defaults to reason="operator" when no reason is provided', async () => {
      apiDelete.mockResolvedValueOnce({ jobId: 'job-1', cancelled: true });
      const store = useFirmwareStore();
      await store.cancelFlash();
      expect(apiDelete).toHaveBeenCalledWith('api/firmware/flash', {
        data: { reason: 'operator' },
      });
    });

    it('swallows errors — cancel is best-effort and phase truth lives on WS', async () => {
      apiDelete.mockRejectedValueOnce(new Error('network'));
      const store = useFirmwareStore();
      store.setPhase('flashing');
      await store.cancelFlash();
      // Did not throw; phase unchanged (WS dispatcher owns terminal state).
      expect(store.phase).toBe('flashing');
    });
  });
});
