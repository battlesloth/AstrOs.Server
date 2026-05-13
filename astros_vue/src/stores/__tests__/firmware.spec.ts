import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('@/api/apiService', () => ({
  default: {
    get: vi.fn(),
  },
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

import apiService, { apiClient } from '@/api/apiService';
import { useFirmwareStore } from '../firmware';
import { useControllerStore } from '@/stores/controller';
import { ControllerStatus, Location } from '@/enums';
import type {
  ControllerFlashState,
  FlashJobFailedData,
  FlashJobState,
  ReleaseInfo,
  ReleaseListResult,
} from '@/types/firmware';

/**
 * Seed the controllerStore so the firmwareStore's `controllers` computed
 * projects the expected fleet. Replaces direct `store.controllers = ...`
 * assignments (the computed is read-only).
 */
function seedSampleFleet(opts: { domeStatus?: ControllerStatus } = {}) {
  const cs = useControllerStore();
  cs.bodyStatus = ControllerStatus.UP;
  cs.bodyFirmware = 'v1.3.0';
  cs.coreStatus = ControllerStatus.UP;
  cs.coreFirmware = 'v1.4.0';
  cs.domeStatus = opts.domeStatus ?? ControllerStatus.DOWN;
  cs.domeFirmware = 'v1.4.0';
  // Body uses the master sentinel MAC; padawan MACs would normally arrive
  // via LocationStatus messages. Seed deterministic test MACs so the
  // firmwareStore's resolver can translate WS controllerIds to slots.
  cs.setControllerMac(Location.BODY, '00:00:00:00:00:00');
  cs.setControllerMac(Location.CORE, 'aa:bb:cc:dd:ee:01');
  cs.setControllerMac(Location.DOME, 'aa:bb:cc:dd:ee:02');
}

const apiGet = apiService.get as ReturnType<typeof vi.fn>;
const apiClientGet = apiClient.get as ReturnType<typeof vi.fn>;
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
    apiClientGet.mockReset();
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
      seedSampleFleet();

      store.toggle('body');
      expect([...store.selectedControllerIds]).toEqual(['body']);
      store.toggle('core');
      expect([...store.selectedControllerIds].sort()).toEqual(['body', 'core']);
      store.toggle('body');
      expect([...store.selectedControllerIds]).toEqual(['core']);
    });

    it('toggle replaces the Set reference so Vue reactivity observes the change', () => {
      const store = useFirmwareStore();
      seedSampleFleet();
      const before = store.selectedControllerIds;
      store.toggle('body');
      expect(store.selectedControllerIds).not.toBe(before);
    });

    it('selectAll picks every online, non-downgrade controller', () => {
      const store = useFirmwareStore();
      seedSampleFleet();
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
      seedSampleFleet();
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
      seedSampleFleet();
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
      seedSampleFleet();
      store.sourceMode = 'github';
      store.selectedReleaseTag = 'v1.3.5';
      expect(store.anyDowngradeBlocked).toBe(false);
    });

    it('returns true when a selected controller would downgrade', () => {
      const store = useFirmwareStore();
      seedSampleFleet();
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
      seedSampleFleet();
      store.sourceMode = 'github';
      store.selectedReleaseTag = 'v1.4.0';
      store.toggle('core'); // core is v1.4.0; target is v1.4.0
      expect(store.anyDowngradeBlocked).toBe(false);
    });

    it('treats a malformed current version as not a downgrade (NaN > 0 is false)', () => {
      const store = useFirmwareStore();
      const cs = useControllerStore();
      seedSampleFleet();
      cs.bodyFirmware = 'not-a-version';
      store.sourceMode = 'github';
      store.selectedReleaseTag = 'v1.4.2';
      store.toggle('body');
      expect(store.anyDowngradeBlocked).toBe(false);
    });
  });

  describe('canFlash', () => {
    it('is false with no target', () => {
      const store = useFirmwareStore();
      seedSampleFleet();
      store.toggle('body');
      expect(store.canFlash).toBe(false);
    });

    it('is false with target but no selection', () => {
      const store = useFirmwareStore();
      seedSampleFleet();
      store.sourceMode = 'github';
      store.selectedReleaseTag = 'v1.4.2';
      expect(store.canFlash).toBe(false);
    });

    it('is true with target + at least one upgrade selection', () => {
      const store = useFirmwareStore();
      seedSampleFleet();
      store.sourceMode = 'github';
      store.selectedReleaseTag = 'v1.4.2';
      store.toggle('body');
      expect(store.canFlash).toBe(true);
    });

    it('is false with target + selection but any selected controller would downgrade', () => {
      const store = useFirmwareStore();
      seedSampleFleet();
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

    it("resetToSelect clears currentStage, flashError, failedControllers and sets phase to 'select'", () => {
      const store = useFirmwareStore();
      store.setPhase('failed');
      store.currentStage = 'transfer';
      store.flashError = { reason: 'job_already_running' };
      store.failedControllers = [{ id: 'core', label: 'Core', stage: 'transfer' }];

      store.resetToSelect();

      expect(store.phase).toBe('select');
      expect(store.currentStage).toBeNull();
      expect(store.flashError).toBeNull();
      expect(store.failedControllers).toEqual([]);
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
      seedSampleFleet();
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
      seedSampleFleet();
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
      seedSampleFleet();
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

    it("re-asserts phase='flashing' if a malformed-WS rollback raced the pending POST", async () => {
      // I5 race: useWebsocket.handleFlashJobStarted defensively calls
      // setPhase('select') on a malformed WS payload. If that arrives during
      // the POST window, the success path must re-assert 'flashing' so the
      // UI reflects that the server actually accepted the job.
      let resolvePost: (value: { data: { jobId: string } }) => void = () => {};
      apiPost.mockReturnValueOnce(
        new Promise((res) => {
          resolvePost = res;
        }),
      );
      const store = readyStore();

      const inFlight = store.startFlash();
      // Mid-flight: simulate the malformed-WS rollback.
      store.setPhase('select');
      store.flashError = {
        reason: 'internal_server_error',
        detail: 'Malformed flashJobStarted from server',
      };

      resolvePost({ data: { jobId: 'job-race' } });
      await inFlight;

      expect(store.phase).toBe('flashing');
      expect(store.flashError).toBeNull();
      expect(store.ownJobId).toBe('job-race');
    });

    it("preserves phase='done' if WS completion legitimately raced the pending POST", async () => {
      // Negative side of the race-fix: if applyJobDone fired between the
      // POST and the response (legitimate fast-flash), we must NOT clobber
      // 'done' by re-asserting 'flashing'. The re-assertion only fires when
      // phase has dropped to 'select'.
      let resolvePost: (value: { data: { jobId: string } }) => void = () => {};
      apiPost.mockReturnValueOnce(
        new Promise((res) => {
          resolvePost = res;
        }),
      );
      const store = readyStore();

      const inFlight = store.startFlash();
      store.setPhase('done');

      resolvePost({ data: { jobId: 'job-fast' } });
      await inFlight;

      expect(store.phase).toBe('done');
      expect(store.ownJobId).toBe('job-fast');
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

  // ------------------------------------------------------------------
  // WebSocket-driven state
  // ------------------------------------------------------------------

  // MAC values must match seedSampleFleet's setControllerMac() seeding so the
  // firmwareStore's resolver translates them to body/core slot ids.
  const BODY_MAC = '00:00:00:00:00:00';
  const CORE_MAC = 'aa:bb:cc:dd:ee:01';

  function sampleJobState(overrides: Partial<FlashJobState> = {}): FlashJobState {
    return {
      jobId: 'job-1',
      source: { kind: 'github', version: 'v1.4.2' },
      controllers: [
        { controllerId: BODY_MAC, stage: 'QUEUED' },
        { controllerId: CORE_MAC, stage: 'QUEUED' },
      ],
      startedAt: '2026-05-12T08:00:00Z',
      ...overrides,
    };
  }

  describe('applyJobStarted', () => {
    it("transitions phase 'select' → 'flashing' and seeds controllerStates from data.controllers", () => {
      const store = useFirmwareStore();
      seedSampleFleet();
      store.setPhase('select');

      store.applyJobStarted(sampleJobState());

      expect(store.phase).toBe('flashing');
      expect(store.currentJob?.jobId).toBe('job-1');
      expect(store.controllerStates.size).toBe(2);
      expect(store.controllerStates.get('body')?.stage).toBe('QUEUED');
    });

    it('is idempotent when called twice with the same jobId (WS reconnect / late-join)', () => {
      // FMI hazard: late-join + cold-load fetch race. Both fetchCurrentJob
      // (HTTP) and the WS replay can fire on view enter; both must converge
      // on identical state without merging or doubling effects.
      const store = useFirmwareStore();
      seedSampleFleet();
      store.applyJobStarted(sampleJobState());
      store.applyJobStarted(sampleJobState()); // distinct object, same jobId
      expect(store.currentJob?.jobId).toBe('job-1');
      expect(store.phase).toBe('flashing');
      expect(store.controllerStates.size).toBe(2);
    });

    it('REPLACES (not merges) controllerStates on duplicate — stale entries do not survive', () => {
      // FMI hazard: WS reconnect during flash. The server sends a fresh
      // flashJobStarted snapshot; the client must NOT keep stale per-
      // controller stages from before the disconnect.
      const store = useFirmwareStore();
      seedSampleFleet();
      store.applyJobStarted(sampleJobState());
      store.applyControllerUpdate({ controllerId: BODY_MAC, stage: 'SENDING' });
      // Simulate reconnect with controllers in a different state.
      const fresh: FlashJobState = sampleJobState({
        controllers: [{ controllerId: BODY_MAC, stage: 'VERIFYING' }],
      });
      store.applyJobStarted(fresh);
      expect(store.controllerStates.size).toBe(1);
      expect(store.controllerStates.get('body')?.stage).toBe('VERIFYING');
      expect(store.controllerStates.get('core')).toBeUndefined();
    });

    it('translates MAC controllerIds to slot ids (body/core/dome) via the controllerStore resolver', () => {
      // Server sends MAC addresses as controllerId; the firmwareStore must
      // translate them to slot ids so the panel's progressByControllerId[c.id]
      // lookup (where c.id is 'body'/'core'/'dome') resolves correctly.
      const store = useFirmwareStore();
      seedSampleFleet();
      store.applyJobStarted(sampleJobState());
      // sampleJobState sends BODY_MAC + CORE_MAC; after translation the Map
      // is keyed by slot ids, NOT by the raw MAC strings.
      expect(store.controllerStates.get('body')?.stage).toBe('QUEUED');
      expect(store.controllerStates.get('core')?.stage).toBe('QUEUED');
      expect(store.controllerStates.get(BODY_MAC)).toBeUndefined();
      expect(store.controllerStates.get(CORE_MAC)).toBeUndefined();
    });

    it('drops entries with unknown controllerIds (MAC mapping not yet learned)', () => {
      // Edge: applyJobStarted arrives BEFORE LocationStatus has populated
      // MACs (e.g., cold-load with no prior status). Unknown MACs are
      // dropped rather than silently keyed by raw MAC.
      const store = useFirmwareStore();
      // No seedSampleFleet() — no MAC mappings exist.
      store.applyJobStarted({
        ...sampleJobState(),
        controllers: [{ controllerId: 'unknown-mac', stage: 'QUEUED' }],
      });
      expect(store.controllerStates.size).toBe(0);
    });

    it('does not throw when data.controllers is missing or malformed (defensive)', () => {
      // FMI hazard: malformed flashJobStarted payload must not lock the UI
      // in 'flashing' forever. buildControllerStatesMap accepts undefined.
      const store = useFirmwareStore();
      seedSampleFleet();
      expect(() =>
        store.applyJobStarted({
          jobId: 'job-malformed',
          source: { kind: 'github', version: 'v1.4.2' },
          startedAt: '2026-05-12T08:00:00Z',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any),
      ).not.toThrow();
      expect(store.phase).toBe('flashing');
      expect(store.controllerStates.size).toBe(0);
    });

    it('clears flashError and failedControllers so a previous failure does not bleed into the new job', () => {
      const store = useFirmwareStore();
      seedSampleFleet();
      store.flashError = { reason: 'internal_server_error' };
      store.failedControllers = [{ id: 'core', label: 'Core', stage: 'transfer' }];
      store.applyJobStarted(sampleJobState());
      expect(store.flashError).toBeNull();
      expect(store.failedControllers).toEqual([]);
    });

    it('clears currentJobLoadFailed — WS snapshot supersedes HTTP staleness (I4 fix)', () => {
      // A failed fetchCurrentJob lit the staleness banner; when the WS late-
      // join snapshot lands, live state is available again and the banner
      // is no longer accurate.
      const store = useFirmwareStore();
      seedSampleFleet();
      store.currentJobLoadFailed = true;
      store.applyJobStarted(sampleJobState());
      expect(store.currentJobLoadFailed).toBe(false);
    });

    it('clears pendingByMac so orphan entries from a prior job cannot replay against the new one (I10 fix)', () => {
      // Operator runs flash A; a padawan's LocationStatus never arrived, so
      // its entries stay queued. Flash A ends without resetToSelect (e.g.,
      // server-initiated reconnect mid-job). Flash B's snapshot arrives.
      // Without this clear, when LocationStatus finally arrives for that
      // MAC, the queued entries would replay against the new job's state.
      const store = useFirmwareStore();
      store.applyControllerUpdate({ controllerId: 'orphan-mac', stage: 'SENDING' });
      expect(store.pendingByMac.size).toBe(1);

      seedSampleFleet();
      store.applyJobStarted(sampleJobState({ jobId: 'job-B' }));

      expect(store.pendingByMac.size).toBe(0);
    });
  });

  describe('applyControllerUpdate', () => {
    it('replaces the per-controller state in the map and projects the UI stage', () => {
      const store = useFirmwareStore();
      seedSampleFleet();
      store.applyJobStarted(sampleJobState());

      store.applyControllerUpdate({ controllerId: BODY_MAC, stage: 'UPLOADING_TO_MASTER' });
      expect(store.controllerStates.get('body')?.stage).toBe('UPLOADING_TO_MASTER');
      expect(store.currentStage).toBe('download');

      store.applyControllerUpdate({ controllerId: BODY_MAC, stage: 'VERIFYING' });
      expect(store.currentStage).toBe('verify');
    });

    it('leaves currentStage untouched for terminal stages (VERSION_CONFIRMED / FAILED / QUEUED)', () => {
      const store = useFirmwareStore();
      seedSampleFleet();
      store.applyJobStarted(sampleJobState());
      store.applyControllerUpdate({ controllerId: BODY_MAC, stage: 'SENDING' });
      const before = store.currentStage;
      store.applyControllerUpdate({
        controllerId: BODY_MAC,
        stage: 'VERSION_CONFIRMED',
        finalVersion: 'v1.4.2',
      });
      expect(store.currentStage).toBe(before);
    });

    it('replaces the Map reference (Vue reactivity)', () => {
      const store = useFirmwareStore();
      seedSampleFleet();
      store.applyJobStarted(sampleJobState());
      const before = store.controllerStates;
      store.applyControllerUpdate({ controllerId: BODY_MAC, stage: 'SENDING' });
      expect(store.controllerStates).not.toBe(before);
    });

    it('clears currentJobLoadFailed on a successful update — belt-and-suspenders (I4 fix)', () => {
      // If applyJobStarted was missed (unusual reconnect ordering), a
      // successful per-controller update is still proof that live state is
      // flowing for a known controller. Clear the staleness banner.
      const store = useFirmwareStore();
      seedSampleFleet();
      store.currentJobLoadFailed = true;
      store.applyControllerUpdate({ controllerId: BODY_MAC, stage: 'SENDING' });
      expect(store.currentJobLoadFailed).toBe(false);
    });

    it('does NOT clear currentJobLoadFailed when the update is queued (C1 fix)', () => {
      // The clear MUST stay below the null-slot return. An unmapped MAC
      // means we can't trust the update yet; clearing the banner here would
      // silently dismiss the operator's only "something wrong" signal.
      const store = useFirmwareStore();
      // No seedSampleFleet — MAC mappings are absent.
      store.currentJobLoadFailed = true;
      store.applyControllerUpdate({ controllerId: 'unmapped-mac', stage: 'SENDING' });
      expect(store.currentJobLoadFailed).toBe(true);
    });
  });

  describe('applyControllerResult', () => {
    it('routes the contained controller state through applyControllerUpdate', () => {
      const store = useFirmwareStore();
      seedSampleFleet();
      store.applyJobStarted(sampleJobState());
      store.applyControllerResult({
        jobId: 'job-1',
        controller: { controllerId: CORE_MAC, stage: 'VERSION_CONFIRMED', finalVersion: 'v1.4.2' },
      });
      expect(store.controllerStates.get('core')?.stage).toBe('VERSION_CONFIRMED');
    });
  });

  describe('applyJobDone', () => {
    it("transitions phase 'flashing' → 'done' and stamps endedAt on currentJob", () => {
      const store = useFirmwareStore();
      seedSampleFleet();
      store.applyJobStarted(sampleJobState());
      store.applyJobDone({ jobId: 'job-1', endedAt: '2026-05-12T08:05:00Z' });
      expect(store.phase).toBe('done');
      expect(store.currentJob?.endedAt).toBe('2026-05-12T08:05:00Z');
    });

    it('clears pendingByMac so a late LocationStatus cannot replay stale entries onto done state (C2 fix)', () => {
      // Round-5 C2: without this clear, a queued entry whose MAC mapping
      // arrives after job-done would mutate controllerStates + currentStage,
      // visibly contradicting the result bar's "all updated" message.
      const store = useFirmwareStore();
      seedSampleFleet();
      store.applyControllerUpdate({ controllerId: 'orphan-mac', stage: 'SENDING' });
      expect(store.pendingByMac.size).toBe(1);

      store.applyJobDone({ jobId: 'job-1', endedAt: '2026-05-12T08:05:00Z' });

      expect(store.pendingByMac.size).toBe(0);
    });
  });

  describe('applyJobFailed', () => {
    it("transitions phase to 'failed', stamps endedAt + abortReason, and surfaces flashError", () => {
      const store = useFirmwareStore();
      seedSampleFleet();
      store.applyJobStarted(sampleJobState());
      const data: FlashJobFailedData = {
        jobId: 'job-1',
        endedAt: '2026-05-12T08:05:00Z',
        reason: 'hash_mismatch', // post-streamer reason — not in FlashErrorReason
        detail: 'asset checksum mismatch on Core',
        abortReason: 'hash_mismatch',
      };
      store.applyJobFailed(data);
      expect(store.phase).toBe('failed');
      expect(store.currentJob?.endedAt).toBe('2026-05-12T08:05:00Z');
      // Unrecognized reason falls back to internal_server_error so the banner
      // shows generic copy rather than a missing-i18n-key path.
      expect(store.flashError?.reason).toBe('internal_server_error');
      expect(store.flashError?.detail).toBe('asset checksum mismatch on Core');
    });

    it('maps recognized server reasons through to FlashErrorReason verbatim', () => {
      // Pre-streamer reasons in FlashErrorReason should reach the banner so
      // the operator sees specific copy (e.g., "Pick at least one controller"
      // for `no_controllers`).
      const store = useFirmwareStore();
      seedSampleFleet();
      store.applyJobStarted(sampleJobState());
      store.applyJobFailed({
        jobId: 'job-1',
        endedAt: '2026-05-12T08:05:00Z',
        reason: 'release_not_found',
      });
      expect(store.flashError?.reason).toBe('release_not_found');
    });

    it('derives failedControllers from the FAILED entries in controllerStates', () => {
      const store = useFirmwareStore();
      seedSampleFleet();
      store.applyJobStarted(sampleJobState());
      store.applyControllerUpdate({
        controllerId: CORE_MAC,
        stage: 'FAILED',
        error: 'hash_mismatch',
      });
      store.applyJobFailed({ jobId: 'job-1', endedAt: '2026-05-12T08:05:00Z' });
      expect(store.failedControllers).toHaveLength(1);
      expect(store.failedControllers[0]?.id).toBe('core');
      expect(store.failedControllers[0]?.label).toBe('Core');
    });

    it('collects ALL FAILED entries (multi-failure realistic on bus-wide ESP-NOW errors)', () => {
      // C2 fix: a `break` in applyJobFailed previously surfaced only the
      // first FAILED entry by iteration order. With two padawans failing
      // simultaneously (e.g. master loses ESP-NOW), the operator would
      // walk away from a bricked unit. Pin all FAILEDs make the array.
      // Array order is intentionally unspecified by the contract (Map.values()
      // iteration is insertion-order, which the test couples to via sort()
      // to decouple from incidental ordering).
      const store = useFirmwareStore();
      seedSampleFleet();
      store.applyJobStarted(sampleJobState());
      store.applyControllerUpdate({
        controllerId: CORE_MAC,
        stage: 'FAILED',
        error: 'bus_send_failed',
      });
      store.applyControllerUpdate({
        controllerId: BODY_MAC,
        stage: 'FAILED',
        error: 'bus_send_failed',
      });
      store.applyJobFailed({
        jobId: 'job-1',
        endedAt: '2026-05-12T08:05:00Z',
        reason: 'bus_send_failed',
      });
      expect(store.failedControllers).toHaveLength(2);
      const ids = store.failedControllers.map((c) => c.id).sort();
      expect(ids).toEqual(['body', 'core']);
      // Pin the full record shape per entry: a mutation that surfaced only
      // {id} (dropping label / stage) would otherwise pass this test.
      const labels = store.failedControllers.map((c) => c.label).sort();
      expect(labels).toEqual(['Body', 'Core']);
      for (const entry of store.failedControllers) {
        expect(entry.stage).toBeTruthy();
      }
    });

    it('leaves failedControllers empty when no controller transitioned to FAILED before job-failed (mid-deploy abort)', () => {
      // Edge case: applyJobStarted runs, no per-controller updates land,
      // then a mid-deploy abort (e.g., bus_send_failed) fires
      // flashJobFailed. The store should still transition phase + set
      // flashError, and the FirmwareView template guards on
      // `failedControllers[0]?.stage` so an empty array is safe to render.
      const store = useFirmwareStore();
      seedSampleFleet();
      store.applyJobStarted(sampleJobState());
      store.applyJobFailed({
        jobId: 'job-1',
        endedAt: '2026-05-12T08:05:00Z',
        reason: 'bus_send_failed',
        detail: 'Worker channel closed during firmware send',
      });
      expect(store.phase).toBe('failed');
      expect(store.flashError?.detail).toBe('Worker channel closed during firmware send');
      expect(store.failedControllers).toEqual([]);
    });

    it('does not throw when called with no controllerStates and no currentJob (defensive)', () => {
      // FMI hazard: WS handler errors swallow real bugs. A malformed
      // flashJobFailed must still transition phase so the UI doesn't lock.
      const store = useFirmwareStore();
      seedSampleFleet();
      expect(() =>
        store.applyJobFailed({ jobId: 'job-x', endedAt: '2026-05-12T08:05:00Z' }),
      ).not.toThrow();
      expect(store.phase).toBe('failed');
      expect(store.flashError).not.toBeNull();
    });

    it('clears pendingByMac so a late LocationStatus cannot replay stale entries onto failed state (C2 fix)', () => {
      const store = useFirmwareStore();
      seedSampleFleet();
      store.applyControllerUpdate({ controllerId: 'orphan-mac', stage: 'SENDING' });
      expect(store.pendingByMac.size).toBe(1);

      store.applyJobFailed({
        jobId: 'job-1',
        endedAt: '2026-05-12T08:05:00Z',
        reason: 'bus_send_failed',
      });

      expect(store.pendingByMac.size).toBe(0);
    });
  });

  describe('isOwnJob', () => {
    it('is true when ownJobId matches currentJob.jobId', () => {
      const store = useFirmwareStore();
      seedSampleFleet();
      store.ownJobId = 'job-1';
      store.applyJobStarted(sampleJobState({ jobId: 'job-1' }));
      expect(store.isOwnJob).toBe(true);
    });

    it("is false when ownJobId is null (another operator's job)", () => {
      const store = useFirmwareStore();
      seedSampleFleet();
      store.applyJobStarted(sampleJobState({ jobId: 'job-99' }));
      expect(store.isOwnJob).toBe(false);
    });

    it('is false when no job is in flight', () => {
      const store = useFirmwareStore();
      seedSampleFleet();
      store.ownJobId = 'job-1';
      expect(store.isOwnJob).toBe(false);
    });
  });

  describe('fetchCurrentJob', () => {
    it('populates currentJob via applyJobStarted when the server returns a job and store has none', async () => {
      const data = sampleJobState();
      apiClientGet.mockResolvedValueOnce({ data });
      const store = useFirmwareStore();
      seedSampleFleet();

      await store.fetchCurrentJob();

      expect(apiClientGet).toHaveBeenCalledWith('api/firmware/flash');
      expect(store.currentJob?.jobId).toBe('job-1');
      expect(store.phase).toBe('flashing');
    });

    it('is a no-op when currentJob is already set (idempotent cold-load + late-join race guard)', async () => {
      // FMI hazard: fetchCurrentJob + WS late-join race. If the WS replay
      // sets currentJob first, the subsequent HTTP cold-load must not
      // overwrite it.
      apiClientGet.mockResolvedValueOnce({ data: sampleJobState({ jobId: 'job-from-http' }) });
      const store = useFirmwareStore();
      seedSampleFleet();
      store.applyJobStarted(sampleJobState({ jobId: 'job-from-ws' }));
      await store.fetchCurrentJob();
      expect(store.currentJob?.jobId).toBe('job-from-ws');
    });

    it('returns null without error when the server responds with no active job', async () => {
      apiClientGet.mockResolvedValueOnce({ data: null });
      const store = useFirmwareStore();
      await store.fetchCurrentJob();
      expect(store.currentJob).toBeNull();
      expect(store.phase).toBe('idle');
    });

    it('swallows network errors (UI stays in current phase) but sets currentJobLoadFailed', async () => {
      apiClientGet.mockRejectedValueOnce(new Error('network'));
      const store = useFirmwareStore();
      seedSampleFleet();
      await store.fetchCurrentJob();
      expect(store.currentJob).toBeNull();
      expect(store.currentJobLoadFailed).toBe(true);
    });

    it('treats 404 as expected idle state — does NOT set currentJobLoadFailed (I3 fix)', async () => {
      // 404 is the healthy idle response from /api/firmware/flash when no
      // flash is in flight. Surfacing it as "could not confirm state" would
      // falsely alarm operators on first page load. Only 5xx and network
      // errors should trigger the staleness banner.
      apiClientGet.mockRejectedValueOnce({ response: { status: 404 } });
      const store = useFirmwareStore();
      await store.fetchCurrentJob();
      expect(store.currentJobLoadFailed).toBe(false);
    });

    it('treats 5xx as staleness — sets currentJobLoadFailed', async () => {
      apiClientGet.mockRejectedValueOnce({ response: { status: 503 } });
      const store = useFirmwareStore();
      await store.fetchCurrentJob();
      expect(store.currentJobLoadFailed).toBe(true);
    });
  });

  describe('resetToSelect', () => {
    it('clears controllerStates and ownJobId in addition to phase/currentStage/flashError', () => {
      // FMI hazard: stale controllerStates after job ends. Operator clicks
      // Done → next flash must not inherit prior per-controller stages.
      const store = useFirmwareStore();
      seedSampleFleet();
      store.applyJobStarted(sampleJobState());
      store.ownJobId = 'job-1';
      store.applyJobDone({ jobId: 'job-1', endedAt: '2026-05-12T08:05:00Z' });

      store.resetToSelect();

      expect(store.phase).toBe('select');
      expect(store.controllerStates.size).toBe(0);
      expect(store.currentJob).toBeNull();
      expect(store.ownJobId).toBeNull();
    });
  });

  describe('startFlash captures ownJobId from the POST response', () => {
    it('records ownJobId so isOwnJob resolves once the WS snapshot lands', async () => {
      apiPost.mockResolvedValueOnce({ data: sampleJobState({ jobId: 'job-mine' }) });
      const store = useFirmwareStore();
      seedSampleFleet();
      store.sourceMode = 'github';
      store.selectedReleaseTag = 'v1.4.2';
      store.toggle('body');

      await store.startFlash();

      expect(store.ownJobId).toBe('job-mine');
      // applyJobStarted in production would follow; simulate it here.
      store.applyJobStarted(sampleJobState({ jobId: 'job-mine' }));
      expect(store.isOwnJob).toBe(true);
    });
  });

  describe('progressByControllerId', () => {
    it('emits an entry per controller with status; stageLabelKey is an i18n key path (not a literal label)', () => {
      // The panel passes stageLabelKey to AstrosFirmwareControllerRow which
      // resolves it with t(). If we leak a literal label like "Transfer" the
      // row renders the raw English even on a non-en locale. The key must be
      // a dotted path under firmware_view.stages.*.label.
      const store = useFirmwareStore();
      seedSampleFleet();
      store.applyJobStarted(sampleJobState());
      store.applyControllerUpdate({ controllerId: BODY_MAC, stage: 'SENDING' });

      const map = store.progressByControllerId;
      expect(map).toHaveProperty('body');
      expect(map.body?.status).toBeDefined();
      // SENDING guarantees controllerStageLabelKey returns a key, so this
      // assertion is unconditional — a future regression where SENDING starts
      // returning null would surface here instead of silently passing through
      // a conditional guard. The dotted-path shape pins the producer/consumer
      // contract so a literal label like "Transfer" can't slip through.
      expect(map.body?.stageLabelKey).toMatch(/^firmware_view\.stages\.[a-z_]+\.label$/);
    });

    it('omits stageLabelKey for terminal states (done / failed) — only "updating" gets a stage label', () => {
      // Mutation guard: a previous bug surfaced a stage label on done rows
      // because controllerStageLabelKey wasn't checked against status. Pin
      // the rule: the row's <span v-if="status === 'updating' && stageLabelKey">
      // depends on this absence.
      const store = useFirmwareStore();
      seedSampleFleet();
      store.applyJobStarted(sampleJobState());
      store.applyControllerUpdate({
        controllerId: BODY_MAC,
        stage: 'VERSION_CONFIRMED',
        finalVersion: 'v1.4.2',
      });

      const entry = store.progressByControllerId.body;
      expect(entry?.status).toBe('done');
      expect(entry?.stageLabelKey).toBeUndefined();
    });
  });

  describe('controllers computed reactivity', () => {
    it('re-derives FirmwareControllerView entries when controllerStore.bodyStatus flips mid-flow', async () => {
      // Pins reactivity: the firmware view's row badges (up / down / needs-
      // synced) are read off the controllerStore but exposed via the firmware
      // store's `controllers` computed. If the computed didn't depend on the
      // status refs, a real-time POLL_ACK -> DOWN transition would leave the
      // row stuck at "up" until a page refresh.
      const store = useFirmwareStore();
      seedSampleFleet();

      const before = store.controllers.find((c) => c.id === 'body');
      expect(before?.status).toBe('up');

      const { useControllerStore } = await import('@/stores/controller');
      const { ControllerStatus } = await import('@/enums');
      const controllerStore = useControllerStore();
      controllerStore.bodyStatus = ControllerStatus.DOWN;

      const after = store.controllers.find((c) => c.id === 'body');
      expect(after?.status).toBe('down');
    });
  });

  describe('pending-update replay queue (late-MAC race)', () => {
    // C1: WS flashControllerUpdate / flashJobStarted entries can arrive for
    // a padawan before its LocationStatus heartbeat populates the MAC map.
    // The store queues those payloads keyed by raw MAC and drains them when
    // controllerStore.setControllerMac is later called (via the dispatcher).
    const LATE_CORE_MAC = 'aa:bb:cc:dd:ee:01';

    it('queues a flashControllerUpdate whose MAC is not yet mapped (no controllerStates entry produced)', () => {
      const store = useFirmwareStore();
      // No seedSampleFleet → core MAC unmapped.
      store.applyControllerUpdate({ controllerId: LATE_CORE_MAC, stage: 'SENDING' });
      expect(store.controllerStates.size).toBe(0);
      expect(store.pendingByMac.get(LATE_CORE_MAC)).toHaveLength(1);
    });

    it('queues each dropped snapshot entry from applyJobStarted (not just live updates)', () => {
      // Late-join: snapshot arrives before LocationStatus seeds the padawan
      // MACs. Without the queue, the snapshot entries are lost and the rows
      // render with no pill until further events land (which may never come
      // for a fast-flashing controller).
      const store = useFirmwareStore();
      store.applyJobStarted({
        jobId: 'job-late-join',
        source: { kind: 'github', version: 'v1.4.2' },
        controllers: [
          { controllerId: LATE_CORE_MAC, stage: 'SENDING' },
          { controllerId: 'aa:bb:cc:dd:ee:02', stage: 'QUEUED' },
        ],
        startedAt: '2026-05-13T08:00:00Z',
      });
      expect(store.controllerStates.size).toBe(0);
      expect(store.pendingByMac.size).toBe(2);
      expect(store.pendingByMac.get(LATE_CORE_MAC)).toHaveLength(1);
    });

    it('flushPendingForMac drains the queue and applies entries in order so the latest stage wins', () => {
      // Mutation guard: a non-ordered replay (e.g., Map.values() with later
      // iteration shuffling) would let an earlier SENDING overwrite the
      // intended VERIFYING. Pin order.
      const store = useFirmwareStore();
      store.applyControllerUpdate({ controllerId: LATE_CORE_MAC, stage: 'SENDING' });
      store.applyControllerUpdate({ controllerId: LATE_CORE_MAC, stage: 'VERIFYING' });
      expect(store.pendingByMac.get(LATE_CORE_MAC)).toHaveLength(2);

      // LocationStatus learns the MAC; useWebsocket would call both:
      useControllerStore().setControllerMac(Location.CORE, LATE_CORE_MAC);
      store.flushPendingForMac(LATE_CORE_MAC);

      expect(store.controllerStates.get('core')?.stage).toBe('VERIFYING');
      expect(store.pendingByMac.has(LATE_CORE_MAC)).toBe(false);
    });

    it('flushPendingForMac is a no-op for a MAC with no queued entries', () => {
      const store = useFirmwareStore();
      expect(() => store.flushPendingForMac(LATE_CORE_MAC)).not.toThrow();
      expect(store.controllerStates.size).toBe(0);
    });

    it('resetToSelect clears the pending queue so prior-flash drift cannot leak into the next job', () => {
      const store = useFirmwareStore();
      store.applyControllerUpdate({ controllerId: LATE_CORE_MAC, stage: 'SENDING' });
      expect(store.pendingByMac.size).toBe(1);
      store.resetToSelect();
      expect(store.pendingByMac.size).toBe(0);
    });
  });
});
