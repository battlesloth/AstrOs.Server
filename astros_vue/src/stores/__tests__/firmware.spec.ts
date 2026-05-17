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

    it("returns 'local-build' sentinel in upload mode with a server-acknowledged upload", () => {
      // target gates on `uploadedFile` (the server's post-store projection),
      // not the raw filename — picking a file and uploading it are two
      // different things, and the Flash button should only enable after the
      // server has parsed and promoted the artifact.
      const store = useFirmwareStore();
      store.sourceMode = 'upload';
      store.uploadedFile = {
        version: '1.4.2',
        displayName: 'custom.bin',
        sizeBytes: 1_000_000,
      };
      expect(store.target).toBe('local-build');
    });

    it('returns null in upload mode with only a picked filename (upload not yet completed)', () => {
      // Pin the boundary: a filename alone is NOT sufficient. This catches a
      // regression that re-derived target from `uploadedFilename` and would
      // let canFlash light up before the server accepts the artifact.
      const store = useFirmwareStore();
      store.sourceMode = 'upload';
      store.uploadedFilename = 'custom.bin';
      expect(store.target).toBeNull();
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

    it('is true when allowDowngrade=true permits an otherwise-blocked downgrade selection', () => {
      // Pins the new opt-in: enabling allowDowngrade unblocks canFlash even
      // when at least one selected controller would downgrade. A mutation
      // that dropped the `!allowDowngrade.value` clause in anyDowngradeBlocked
      // (always treating downgrades as blocked) would fail this case.
      const store = useFirmwareStore();
      seedSampleFleet();
      store.sourceMode = 'github';
      store.selectedReleaseTag = 'v1.3.5';
      store.toggle('body'); // upgrade (1.3.0 → 1.3.5)
      store.toggle('core'); // downgrade (1.4.0 → 1.3.5)
      store.allowDowngrade = true;
      expect(store.canFlash).toBe(true);
    });

    it('stays false when allowDowngrade=true but a hard-blocked (down) controller is selected', () => {
      // allowDowngrade must NOT bypass a 'down' status. Hard-blocked is
      // reality (controller unreachable); downgrade is policy. The toggle
      // relaxes the policy, not the reality.
      const store = useFirmwareStore();
      seedSampleFleet(); // dome defaults to DOWN
      store.sourceMode = 'github';
      store.selectedReleaseTag = 'v1.4.2';
      store.toggle('dome'); // hard-blocked: status === 'down'
      store.allowDowngrade = true;
      expect(store.canFlash).toBe(false);
    });
  });

  describe('allowDowngrade toggle', () => {
    it('defaults to false on a fresh store', () => {
      const store = useFirmwareStore();
      expect(store.allowDowngrade).toBe(false);
    });

    it('survives resetToSelect — cross-flash retention by design', () => {
      // The toggle is "per-session," not "per-flash." If the operator opts
      // into dev/debug mode, completing one downgrade flash shouldn't make
      // them re-tick the toggle for the next one. The modal ack still gates
      // each individual flash, and the visible toggle state makes the
      // armed status observable. Only a page reload clears it.
      const store = useFirmwareStore();
      store.allowDowngrade = true;
      store.resetToSelect();
      expect(store.allowDowngrade).toBe(true);
    });

    it('stays armed across target changes that transit a pure-upgrade window', () => {
      // Operator picks a downgrade target → enables toggle → switches to an
      // upgrade target (toggle disappears via anyFleetDowngrade=false) →
      // switches back to a downgrade target. The toggle should reappear
      // already-on (the operator's intent persists), not silently re-disable.
      const store = useFirmwareStore();
      seedSampleFleet();
      store.sourceMode = 'github';
      store.selectedReleaseTag = 'v1.3.5';
      store.allowDowngrade = true;
      expect(store.anyFleetDowngrade).toBe(true);

      store.selectedReleaseTag = 'v1.4.2'; // pure-upgrade
      expect(store.anyFleetDowngrade).toBe(false);
      expect(store.allowDowngrade).toBe(true);

      store.selectedReleaseTag = 'v1.3.5'; // back to downgrade
      expect(store.anyFleetDowngrade).toBe(true);
      expect(store.allowDowngrade).toBe(true);
    });

    it('anyFleetDowngrade is true when any controller in the fleet would downgrade, regardless of selection', () => {
      // Drives the contextual-reveal of the toggle in the panel header.
      // Even if nothing is selected yet, the toggle should be discoverable
      // when the target would downgrade some controller.
      const store = useFirmwareStore();
      seedSampleFleet();
      store.sourceMode = 'github';
      store.selectedReleaseTag = 'v1.3.5'; // core@1.4.0 and dome@1.4.0 would downgrade
      expect(store.selectedControllerIds.size).toBe(0);
      expect(store.anyFleetDowngrade).toBe(true);
    });

    it('anyFleetDowngrade is false on a pure-upgrade target', () => {
      const store = useFirmwareStore();
      seedSampleFleet();
      store.sourceMode = 'github';
      store.selectedReleaseTag = 'v1.4.2';
      expect(store.anyFleetDowngrade).toBe(false);
    });

    it('anyDowngradeBlocked clears when allowDowngrade flips to true with downgrade still selected', () => {
      // Semantic shift: anyDowngradeBlocked is now "selected + policy-blocked"
      // not "selected + would-downgrade". The action-bar copy "X controllers
      // running newer firmware" should disappear once the operator enables
      // the toggle.
      const store = useFirmwareStore();
      seedSampleFleet();
      store.sourceMode = 'github';
      store.selectedReleaseTag = 'v1.3.5';
      store.toggle('core');
      expect(store.anyDowngradeBlocked).toBe(true);
      store.allowDowngrade = true;
      expect(store.anyDowngradeBlocked).toBe(false);
    });

    it('selectAll() with allowDowngrade=true includes downgrade controllers but still excludes hard-blocked', () => {
      const store = useFirmwareStore();
      seedSampleFleet(); // body 1.3.0 (UP), core 1.4.0 (UP), dome 1.4.0 (DOWN)
      store.sourceMode = 'github';
      store.selectedReleaseTag = 'v1.3.5'; // body upgrade, core downgrade, dome downgrade+down
      store.allowDowngrade = true;
      store.selectAll();
      // body + core get picked. dome stays out: down trumps the toggle.
      expect(store.selectedControllerIds.has('body')).toBe(true);
      expect(store.selectedControllerIds.has('core')).toBe(true);
      expect(store.selectedControllerIds.has('dome')).toBe(false);
    });

    it('isHardBlocked fails closed for unknown controller ids (canFlash blocks a phantom selection)', () => {
      // Defensive: today FLEET_LAYOUT is static so an unknown id is structurally
      // impossible, but if FLEET_LAYOUT ever goes dynamic a stale selectedId
      // would otherwise slip past canFlash and dispatch a phantom flash target.
      // Mutation: flipping the `c === undefined` branch to `return false` would
      // make canFlash return true here.
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const store = useFirmwareStore();
        seedSampleFleet();
        store.sourceMode = 'github';
        store.selectedReleaseTag = 'v1.4.2';
        store.selectedControllerIds = new Set(['ghost-slot']);
        expect(store.canFlash).toBe(false);
      } finally {
        consoleWarnSpy.mockRestore();
      }
    });

    it('canFlash flips back to false when allowDowngrade flips off after a downgrade was selected', () => {
      // Operator selects a downgrade with the toggle on, then unticks the
      // toggle. Selection persists (we don't auto-clear it), but canFlash
      // must immediately re-block. A mutation that cached canFlash against
      // allowDowngrade at selection time would slip through other tests.
      const store = useFirmwareStore();
      seedSampleFleet();
      store.sourceMode = 'github';
      store.selectedReleaseTag = 'v1.3.5';
      store.allowDowngrade = true;
      store.toggle('core'); // downgrade
      expect(store.canFlash).toBe(true);

      store.allowDowngrade = false;
      expect(store.canFlash).toBe(false);
      expect(store.selectedControllerIds.has('core')).toBe(true); // selection persists
    });

    it('selectAll() with allowDowngrade=false (default) excludes downgrade controllers — backwards-compat', () => {
      const store = useFirmwareStore();
      seedSampleFleet();
      store.sourceMode = 'github';
      store.selectedReleaseTag = 'v1.3.5';
      store.selectAll();
      expect(store.selectedControllerIds.has('body')).toBe(true); // upgrade
      expect(store.selectedControllerIds.has('core')).toBe(false); // downgrade
      expect(store.selectedControllerIds.has('dome')).toBe(false); // downgrade+down
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
      store.failedControllers = [{ id: Location.CORE, label: 'Core', stage: 'transfer' }];

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

  describe('uploadFirmware', () => {
    // Tiny File polyfill — jsdom's File constructor exists but the tests don't
    // exercise its read API; pinning just .name + .size matches what FormData
    // passes through to apiClient.post.
    function makeFile(name = 'firmware.bin', size = 1_234_567): File {
      return new File([new Uint8Array(size)], name, { type: 'application/octet-stream' });
    }

    const sampleUploadResponse = {
      data: {
        sha256: 'a'.repeat(64),
        sizeBytes: 1_234_567,
        meta: {
          uploadId: 'abc',
          originalFilename: 'firmware.bin',
          projectName: 'AstrOs.ESP',
          version: '1.4.2',
          uploadedAt: '2026-05-16T08:00:00Z',
          sizeBytes: 1_234_567,
        },
      },
    };

    it("POSTs the file as multipart/form-data and transitions uploadState to 'uploaded' on 200", async () => {
      apiPost.mockResolvedValueOnce(sampleUploadResponse);
      const store = useFirmwareStore();
      const file = makeFile('astros-esp-1.4.2-lolin_d32_pro-app.bin');

      await store.uploadFirmware(file);

      expect(apiPost).toHaveBeenCalledWith(
        'api/firmware/upload',
        expect.any(FormData),
        expect.objectContaining({
          headers: expect.objectContaining({ 'Content-Type': 'multipart/form-data' }),
        }),
      );
      expect(store.uploadState).toBe('uploaded');
      expect(store.uploadedFile).toEqual({
        version: '1.4.2',
        displayName: 'firmware.bin',
        sizeBytes: 1_234_567,
      });
      expect(store.uploadedFilename).toBe('astros-esp-1.4.2-lolin_d32_pro-app.bin');
      expect(store.flashError).toBeNull();
    });

    it("optimistically sets uploadState to 'uploading' before the request resolves", async () => {
      // Pin the in-flight state so the source strip can render the
      // "Uploading…" affordance — a mutation that only set uploadState on
      // success would break the operator's signal that work is happening.
      let resolveOuter: (v: typeof sampleUploadResponse) => void = () => {};
      apiPost.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveOuter = resolve;
        }),
      );
      const store = useFirmwareStore();
      const uploadPromise = store.uploadFirmware(makeFile());
      // No await yet — the synchronous prefix of uploadFirmware has run,
      // setting uploadState to 'uploading'.
      expect(store.uploadState).toBe('uploading');
      expect(store.uploadedFile).toBeNull();

      resolveOuter(sampleUploadResponse);
      await uploadPromise;
      expect(store.uploadState).toBe('uploaded');
    });

    it("transitions to 'error' state and sets flashError envelope on HTTP failure", async () => {
      apiPost.mockRejectedValueOnce({
        response: {
          status: 400,
          data: { error: 'invalid_firmware', detail: 'project name mismatch' },
        },
      });
      const store = useFirmwareStore();

      await store.uploadFirmware(makeFile());

      expect(store.uploadState).toBe('error');
      expect(store.uploadedFile).toBeNull();
      expect(store.flashError).not.toBeNull();
      expect(store.flashError?.reason).toBe('invalid_firmware');
    });

    it('target gates on uploadedFile (server-acknowledged), not uploadedFilename (operator-picked)', async () => {
      // Pin the core contract this branch enforces: a filename on its own
      // doesn't make `target` truthy — only a successful upload does. A
      // mutation that re-introduced `uploadedFilename ? 'local-build' : null`
      // would break this.
      const store = useFirmwareStore();
      store.sourceMode = 'upload';
      store.uploadedFilename = 'firmware.bin'; // operator picked, not uploaded yet
      expect(store.target).toBe(null);

      apiPost.mockResolvedValueOnce(sampleUploadResponse);
      await store.uploadFirmware(makeFile());
      expect(store.target).toBe('local-build');
    });

    it('canFlash stays false while uploadState is uploading even with a selection', async () => {
      // Re-derives from `target` → which derives from `uploadedFile`. While
      // uploading, uploadedFile is null → target is null → canFlash is false.
      let resolveOuter: (v: typeof sampleUploadResponse) => void = () => {};
      apiPost.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveOuter = resolve;
        }),
      );
      const store = useFirmwareStore();
      seedSampleFleet();
      store.sourceMode = 'upload';
      store.toggle('body');
      const uploadPromise = store.uploadFirmware(makeFile());
      expect(store.uploadState).toBe('uploading');
      expect(store.canFlash).toBe(false);

      resolveOuter(sampleUploadResponse);
      await uploadPromise;
      expect(store.canFlash).toBe(true);
    });

    it('clearUpload() resets every upload-related ref AND clears flashError if present', async () => {
      const store = useFirmwareStore();
      // Seed the post-error state by faking an upload failure.
      apiPost.mockRejectedValueOnce({
        response: { status: 400, data: { error: 'invalid_firmware', detail: 'bad' } },
      });
      await store.uploadFirmware(makeFile());
      expect(store.uploadState).toBe('error');
      expect(store.flashError).not.toBeNull();

      store.clearUpload();
      expect(store.uploadState).toBe('idle');
      expect(store.uploadedFile).toBeNull();
      expect(store.uploadedFilename).toBeNull();
      expect(store.flashError).toBeNull();
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
        {
          source: { kind: 'github', version: 'v1.4.2' },
          // `body` slot resolves to the master sentinel MAC seeded in
          // seedSampleFleet(); the wire payload now scopes the flash to
          // the operator's selection rather than letting the server flash
          // every cached controller.
          controllers: ['00:00:00:00:00:00'],
        },
        expect.objectContaining({ timeout: 30_000 }),
      );
      expect(store.phase).toBe('flashing');
      expect(store.flashError).toBeNull();
    });

    it("POSTs the upload source shape when sourceMode is 'upload' and an upload has been accepted", async () => {
      // startFlash gates on canFlash → target → uploadedFile. A bare filename
      // is no longer enough; the server must have acknowledged the upload
      // (test-side: setting uploadedFile directly simulates the post-store
      // state without going through the FormData round-trip).
      apiPost.mockResolvedValueOnce({ data: { jobId: 'job-2' } });
      const store = useFirmwareStore();
      seedSampleFleet();
      store.sourceMode = 'upload';
      store.uploadedFile = {
        version: '1.4.2',
        displayName: 'custom.bin',
        sizeBytes: 1_000_000,
      };
      store.toggle('body');

      await store.startFlash();

      expect(apiPost).toHaveBeenCalledWith(
        'api/firmware/flash',
        { source: { kind: 'upload' }, controllers: ['00:00:00:00:00:00'] },
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
      // useWebsocket.handleFlashJobStarted defensively calls
      // setPhase('select') on a malformed WS payload. If that arrives
      // during the POST window, the success path must re-assert
      // 'flashing' so the UI reflects that the server accepted the job.
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

    it('surfaces a network_error flashError when the cancel HTTP fails', async () => {
      apiDelete.mockRejectedValueOnce(new Error('network down'));
      const store = useFirmwareStore();
      store.setPhase('flashing');
      await store.cancelFlash();
      expect(store.flashError?.reason).toBe('network_error');
      expect(store.flashError?.detail).toContain('Cancel request failed');
      // Phase still untouched — WS dispatcher owns terminal state.
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
      //
      // Seed BOTH body AND core with a non-trivial stage before the
      // duplicate flashJobStarted, then verify both are replaced. A
      // merge-by-id mutation would keep core at SENDING (the fresh
      // snapshot omits core entirely) — exactly the failure mode this
      // test must catch.
      const store = useFirmwareStore();
      seedSampleFleet();
      store.applyJobStarted(sampleJobState());
      store.applyControllerUpdate({ controllerId: BODY_MAC, stage: 'SENDING' });
      store.applyControllerUpdate({ controllerId: CORE_MAC, stage: 'SENDING' });
      // Both are now SENDING.
      expect(store.controllerStates.get('body')?.stage).toBe('SENDING');
      expect(store.controllerStates.get('core')?.stage).toBe('SENDING');
      // New snapshot contains only body at VERIFYING. Replace semantics:
      // core must be absent. Merge semantics: core would still be SENDING.
      const fresh: FlashJobState = sampleJobState({
        controllers: [{ controllerId: BODY_MAC, stage: 'VERIFYING' }],
      });
      store.applyJobStarted(fresh);
      expect(store.controllerStates.get('body')?.stage).toBe('VERIFYING');
      expect(store.controllerStates.get('core')).toBeUndefined();
      // Pin size at exactly 1 (the new snapshot's count) — belt-and-
      // suspenders against a merge that adds new entries without
      // dropping stale ones.
      expect(store.controllerStates.size).toBe(1);
    });

    it('translates MAC controllerIds to slot ids (body/core/dome) via the controllerStore resolver', () => {
      // Server sends MAC addresses as controllerId; the firmwareStore must
      // translate them to slot ids so the panel's progressByControllerId[c.id]
      // lookup (where c.id is 'body'/'core'/'dome') resolves correctly.
      const store = useFirmwareStore();
      seedSampleFleet();
      store.applyJobStarted(sampleJobState());
      // sampleJobState sends BODY_MAC + CORE_MAC; after translation the
      // Map is keyed by slot ids, NOT raw MACs. The Map's type
      // (`Map<SlotId, ...>`) makes a MAC-keyed lookup a compile error;
      // the unsafe cast below preserves the runtime check so a
      // regression that started silently double-keying would still fail.
      expect(store.controllerStates.get('body')?.stage).toBe('QUEUED');
      expect(store.controllerStates.get('core')?.stage).toBe('QUEUED');
      const mapAsAny = store.controllerStates as unknown as Map<string, unknown>;
      expect(mapAsAny.get(BODY_MAC)).toBeUndefined();
      expect(mapAsAny.get(CORE_MAC)).toBeUndefined();
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
      store.failedControllers = [{ id: Location.CORE, label: 'Core', stage: 'transfer' }];
      store.applyJobStarted(sampleJobState());
      expect(store.flashError).toBeNull();
      expect(store.failedControllers).toEqual([]);
    });

    it('clears currentJobLoadFailed — WS snapshot supersedes HTTP staleness', () => {
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

    describe('defensive validation of controllers payload', () => {
      it('returns empty map when controllers is not an array (string)', () => {
        const store = useFirmwareStore();
        seedSampleFleet();
        store.applyJobStarted({
          jobId: 'job-1',
          source: { kind: 'github', version: 'v1' },
          // @ts-expect-error — deliberately passing a non-array to verify
          // the runtime guard. TS would normally block this; the guard
          // protects against malformed wire payloads.
          controllers: 'not-an-array',
          startedAt: '2026-05-14T08:00:00Z',
        });
        expect(store.controllerStates.size).toBe(0);
        expect(store.pendingByMac.size).toBe(0);
      });

      it('skips elements with missing controllerId and warns', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
          const store = useFirmwareStore();
          seedSampleFleet();
          store.applyJobStarted({
            jobId: 'job-1',
            source: { kind: 'github', version: 'v1' },
            controllers: [
              // @ts-expect-error — missing controllerId
              { stage: 'QUEUED' },
            ],
            startedAt: '2026-05-14T08:00:00Z',
          });
          expect(store.controllerStates.size).toBe(0);
          expect(store.pendingByMac.size).toBe(0);
          expect(warnSpy.mock.calls.flat().join(' ')).toContain('invalid controllerId');
        } finally {
          warnSpy.mockRestore();
        }
      });

      it('skips elements with non-string controllerId and warns', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
          const store = useFirmwareStore();
          seedSampleFleet();
          store.applyJobStarted({
            jobId: 'job-1',
            source: { kind: 'github', version: 'v1' },
            controllers: [
              // @ts-expect-error — non-string controllerId
              { controllerId: 123, stage: 'QUEUED' },
            ],
            startedAt: '2026-05-14T08:00:00Z',
          });
          expect(store.controllerStates.size).toBe(0);
          expect(warnSpy.mock.calls.flat().join(' ')).toContain('invalid controllerId');
        } finally {
          warnSpy.mockRestore();
        }
      });

      it('skips elements with empty-string controllerId and warns', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
          const store = useFirmwareStore();
          seedSampleFleet();
          store.applyJobStarted({
            jobId: 'job-1',
            source: { kind: 'github', version: 'v1' },
            controllers: [{ controllerId: '', stage: 'QUEUED' }],
            startedAt: '2026-05-14T08:00:00Z',
          });
          expect(store.controllerStates.size).toBe(0);
          expect(warnSpy.mock.calls.flat().join(' ')).toContain('invalid controllerId');
        } finally {
          warnSpy.mockRestore();
        }
      });
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

    it('clears currentJobLoadFailed on a successful update — belt-and-suspenders', () => {
      // If applyJobStarted was missed (unusual reconnect ordering), a
      // successful per-controller update is still proof that live state is
      // flowing for a known controller. Clear the staleness banner.
      const store = useFirmwareStore();
      seedSampleFleet();
      store.currentJobLoadFailed = true;
      store.applyControllerUpdate({ controllerId: BODY_MAC, stage: 'SENDING' });
      expect(store.currentJobLoadFailed).toBe(false);
    });

    it('does NOT clear currentJobLoadFailed when the update is queued', () => {
      // The clear MUST stay below the null-slot return. An unmapped MAC
      // means we can't trust the update yet; clearing the banner here would
      // silently dismiss the operator's only "something wrong" signal.
      const store = useFirmwareStore();
      // No seedSampleFleet — MAC mappings are absent.
      store.currentJobLoadFailed = true;
      store.applyControllerUpdate({ controllerId: 'unmapped-mac', stage: 'SENDING' });
      expect(store.currentJobLoadFailed).toBe(true);
    });

    describe('element validation (mirrors buildControllerStatesMap)', () => {
      it('skips and warns when data.controllerId is missing', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
          const store = useFirmwareStore();
          seedSampleFleet();
          store.applyJobStarted(sampleJobState());
          const sizeBefore = store.pendingByMac.size;
          // @ts-expect-error — deliberately omit controllerId
          store.applyControllerUpdate({ stage: 'SENDING' });
          expect(store.pendingByMac.size).toBe(sizeBefore);
          expect(warnSpy.mock.calls.flat().join(' ')).toContain('invalid controllerId');
        } finally {
          warnSpy.mockRestore();
        }
      });

      it('skips and warns when data.controllerId is empty string', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
          const store = useFirmwareStore();
          seedSampleFleet();
          store.applyJobStarted(sampleJobState());
          const sizeBefore = store.pendingByMac.size;
          store.applyControllerUpdate({ controllerId: '', stage: 'SENDING' });
          expect(store.pendingByMac.size).toBe(sizeBefore);
          expect(warnSpy.mock.calls.flat().join(' ')).toContain('invalid controllerId');
        } finally {
          warnSpy.mockRestore();
        }
      });
    });

    describe('terminal-phase guard (drops trailing updates after done/failed)', () => {
      it('drops trailing applyControllerUpdate when phase is done', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
          const store = useFirmwareStore();
          seedSampleFleet();
          store.applyJobStarted(sampleJobState());
          store.applyJobDone({ jobId: 'job-1', endedAt: '2026-05-14T08:05:00Z' });
          expect(store.phase).toBe('done');
          const bodyBefore = store.controllerStates.get('body');
          store.applyControllerUpdate({ controllerId: BODY_MAC, stage: 'SENDING' });
          // State unchanged.
          expect(store.controllerStates.get('body')).toEqual(bodyBefore);
          expect(warnSpy.mock.calls.flat().join(' ')).toContain('terminal phase');
        } finally {
          warnSpy.mockRestore();
        }
      });

      it('drops trailing applyControllerUpdate when phase is failed', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
          const store = useFirmwareStore();
          seedSampleFleet();
          store.applyJobStarted(sampleJobState());
          store.applyJobFailed({
            jobId: 'job-1',
            endedAt: '2026-05-14T08:05:00Z',
            reason: 'internal_server_error',
          });
          expect(store.phase).toBe('failed');
          const bodyBefore = store.controllerStates.get('body');
          store.applyControllerUpdate({ controllerId: BODY_MAC, stage: 'REBOOTING' });
          expect(store.controllerStates.get('body')).toEqual(bodyBefore);
          expect(warnSpy.mock.calls.flat().join(' ')).toContain('terminal phase');
        } finally {
          warnSpy.mockRestore();
        }
      });
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

    it('drops stale events whose jobId does not match currentJob (post-reconnect race protection)', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const store = useFirmwareStore();
        seedSampleFleet();
        store.applyJobStarted(sampleJobState({ jobId: 'job-B' }));
        const beforeStage = store.controllerStates.get('core')?.stage;
        store.applyControllerResult({
          jobId: 'job-A',
          controller: {
            controllerId: CORE_MAC,
            stage: 'VERSION_CONFIRMED',
            finalVersion: 'v9.9.9',
          },
        });
        expect(store.controllerStates.get('core')?.stage).toBe(beforeStage);
        expect(warnSpy.mock.calls.flat().join(' ')).toContain('jobId mismatch');
      } finally {
        warnSpy.mockRestore();
      }
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

    it('normalizes non-terminal per-controller stages to VERSION_CONFIRMED', () => {
      // Race: server emits flashJobDone when the LAST VERSION_CONFIRMED
      // observed, but a flashControllerUpdate carrying that final stage
      // may not have drained the WS buffer yet. Without this normalize,
      // the panel renders "✓ all updated" while individual rows still
      // spin at "updating" — visibly contradictory operator state.
      const store = useFirmwareStore();
      seedSampleFleet();
      store.applyJobStarted(sampleJobState());
      store.applyControllerUpdate({ controllerId: BODY_MAC, stage: 'VERIFYING' });
      // core is left at QUEUED (initial sample state)
      store.applyJobDone({ jobId: 'job-1', endedAt: '2026-05-12T08:05:00Z' });

      expect(store.controllerStates.get('body')?.stage).toBe('VERSION_CONFIRMED');
      expect(store.controllerStates.get('core')?.stage).toBe('VERSION_CONFIRMED');
    });

    it('emits a console.warn for each non-terminal stage normalized (forensic breadcrumb)', () => {
      // The normalize masks a real bug if the server emits flashJobDone
      // prematurely. The warn is the post-incident breadcrumb so operators'
      // dev console + production logs surface the contract drift.
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const store = useFirmwareStore();
        seedSampleFleet();
        store.applyJobStarted(sampleJobState());
        // Body at SENDING, core left at QUEUED — both non-terminal.
        store.applyControllerUpdate({ controllerId: BODY_MAC, stage: 'SENDING' });
        store.applyJobDone({ jobId: 'job-1', endedAt: '2026-05-12T08:05:00Z' });

        const warnText = warnSpy.mock.calls.flat().join(' ');
        expect(warnText).toContain('normalizing non-terminal stage');
        expect(warnText).toContain('slot="body"');
        expect(warnText).toContain('slot="core"');
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('does NOT overwrite FAILED stages during the done normalize', () => {
      // The normalize should only touch in-flight stages, not terminal
      // ones. A controller that legitimately FAILED should stay FAILED
      // even if applyJobDone fires (rare, but possible if the server
      // reports the job done after one of the controllers errored).
      const store = useFirmwareStore();
      seedSampleFleet();
      store.applyJobStarted(sampleJobState());
      store.applyControllerUpdate({
        controllerId: CORE_MAC,
        stage: 'FAILED',
        error: 'flash_error',
      });
      store.applyJobDone({ jobId: 'job-1', endedAt: '2026-05-12T08:05:00Z' });

      expect(store.controllerStates.get('core')?.stage).toBe('FAILED');
    });

    it('clears pendingByMac so a late LocationStatus cannot replay stale entries onto done state', () => {
      // Without this clear, a queued entry whose MAC mapping arrives
      // after job-done would mutate controllerStates + currentStage,
      // visibly contradicting the result bar's "all updated" message.
      const store = useFirmwareStore();
      seedSampleFleet();
      store.applyControllerUpdate({ controllerId: 'orphan-mac', stage: 'SENDING' });
      expect(store.pendingByMac.size).toBe(1);

      store.applyJobDone({ jobId: 'job-1', endedAt: '2026-05-12T08:05:00Z' });

      expect(store.pendingByMac.size).toBe(0);
    });

    it('drops stale flashJobDone whose jobId does not match currentJob', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const store = useFirmwareStore();
        seedSampleFleet();
        store.applyJobStarted(sampleJobState({ jobId: 'job-B' }));
        expect(store.phase).toBe('flashing');
        store.applyJobDone({ jobId: 'job-A', endedAt: '2026-05-14T08:00:00Z' });
        expect(store.phase).toBe('flashing');
        expect(store.currentJob?.endedAt).toBeUndefined();
        expect(warnSpy.mock.calls.flat().join(' ')).toContain('jobId mismatch');
      } finally {
        warnSpy.mockRestore();
      }
    });
  });

  describe('applyJobFailed', () => {
    it("transitions phase to 'failed', stamps endedAt + abortReason, and surfaces flashError", () => {
      const store = useFirmwareStore();
      seedSampleFleet();
      store.applyJobStarted(sampleJobState());
      // Use a fictional reason the union doesn't include so the fallback
      // path is the one under test. Real streamer reasons (hash_mismatch,
      // chunk_retry_exhausted, etc.) are now in FLASH_ERROR_REASONS and
      // map through verbatim — exercised by the parameterized test below.
      const data: FlashJobFailedData = {
        jobId: 'job-1',
        endedAt: '2026-05-12T08:05:00Z',
        reason: 'frobnitz_failed' as FlashJobFailedData['reason'],
        detail: 'unrecognized reason from a future server',
        abortReason: 'frobnitz_failed',
      };
      store.applyJobFailed(data);
      expect(store.phase).toBe('failed');
      expect(store.currentJob?.endedAt).toBe('2026-05-12T08:05:00Z');
      // Unrecognized reason falls back to internal_server_error so the banner
      // shows generic copy rather than a missing-i18n-key path.
      expect(store.flashError?.reason).toBe('internal_server_error');
      expect(store.flashError?.detail).toBe('unrecognized reason from a future server');
    });

    // Pin each streamer reason maps through verbatim. The set comes from
    // TransferErrorCode in astros_api/src/models/firmware/chunk_streamer.ts;
    // if a code is removed from FLASH_ERROR_REASONS it will silently
    // collapse to 'internal_server_error' and the operator loses
    // bench-actionable copy (e.g., "the master's SD card is full" becomes
    // "check the server logs"). This guards that contract.
    it.each([
      'source_read_failed',
      'source_size_mismatch',
      'begin_timeout',
      'begin_rejected',
      'chunk_retry_exhausted',
      'flash_full',
      'transfer_timeout',
      'end_timeout',
      'hash_mismatch',
      'master_io_error',
      'bus_send_failed',
    ] as const)("maps streamer reason '%s' through verbatim", (reason) => {
      const store = useFirmwareStore();
      seedSampleFleet();
      store.applyJobStarted(sampleJobState());
      store.applyJobFailed({
        jobId: 'job-1',
        endedAt: '2026-05-12T08:05:00Z',
        reason,
      });
      expect(store.flashError?.reason).toBe(reason);
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

    it("maps reason='aborted' through verbatim (operator-cancel does not surface as 'internal_server_error')", () => {
      // Pins both halves: `'aborted'` must stay in FLASH_ERROR_REASONS
      // AND cancel-deploy must include `reason` (not just `abortReason`).
      // Either regression collapses back to the `internal_server_error`
      // fallback.
      const store = useFirmwareStore();
      seedSampleFleet();
      store.applyJobStarted(sampleJobState());
      store.applyJobFailed({
        jobId: 'job-1',
        endedAt: '2026-05-12T08:05:00Z',
        reason: 'aborted',
        abortReason: 'operator',
      });
      expect(store.flashError?.reason).toBe('aborted');
    });

    it('derives failedControllers from the FAILED entries in controllerStates', () => {
      const store = useFirmwareStore();
      seedSampleFleet();
      store.applyJobStarted(sampleJobState());
      // Set a stage so the failed entry can attribute its failure honestly.
      store.applyControllerUpdate({ controllerId: CORE_MAC, stage: 'VERIFYING' });
      store.applyControllerUpdate({
        controllerId: CORE_MAC,
        stage: 'FAILED',
        error: 'hash_mismatch',
      });
      // Mark body as VERSION_CONFIRMED so applyJobFailed's normalize loop
      // doesn't demote it to FAILED (body would otherwise be QUEUED).
      store.applyControllerUpdate({
        controllerId: BODY_MAC,
        stage: 'VERSION_CONFIRMED',
        finalVersion: 'v1.4.2',
      });
      store.applyJobFailed({ jobId: 'job-1', endedAt: '2026-05-12T08:05:00Z' });
      expect(store.failedControllers).toHaveLength(1);
      expect(store.failedControllers[0]?.id).toBe('core');
      expect(store.failedControllers[0]?.label).toBe('Core');
      // Stage comes from currentStage at failure time, not a literal
      // 'transfer' fallback. VERIFYING set currentStage to 'verify'.
      expect(store.failedControllers[0]?.stage).toBe('verify');
    });

    it('records stage as null when no currentStage was observed before the FAILED update', () => {
      // The previous code fabricated 'transfer' here, silently misattributing
      // pre-streamer-style failures. Now we record null and let the UI
      // either render the stages list "—" fallback or omit the stage from
      // the result bar.
      const store = useFirmwareStore();
      seedSampleFleet();
      store.applyJobStarted(sampleJobState());
      store.applyControllerUpdate({
        controllerId: CORE_MAC,
        stage: 'FAILED',
        error: 'hash_mismatch',
      });
      store.applyJobFailed({ jobId: 'job-1', endedAt: '2026-05-12T08:05:00Z' });
      expect(store.failedControllers[0]?.stage).toBeNull();
    });

    it('collects ALL FAILED entries AND attributes stage from the shared currentStage ref (not per-controller history)', () => {
      // Pin that the iteration collects every FAILED entry, not just the
      // first — with two padawans failing simultaneously (e.g. master
      // loses ESP-NOW) the operator should see both, not walk away from
      // a bricked unit.
      const store = useFirmwareStore();
      seedSampleFleet();
      store.applyJobStarted(sampleJobState());
      // Seed a stage so the failed entries get a non-null `stage` field.
      store.applyControllerUpdate({ controllerId: CORE_MAC, stage: 'SENDING' });
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
      // Pin insertion-order preservation: Map.values() is
      // insertion-order; sampleJobState seeds body, then core. The
      // FirmwareView's failedControllerLabels join depends on this —
      // a regression that sorted alphabetically before joining would
      // silently change the operator-visible message.
      const ids = store.failedControllers.map((c) => c.id);
      expect(ids).toEqual(['body', 'core']);
      // Pin the full record shape per entry: a mutation that surfaced only
      // {id} (dropping label / stage) would otherwise pass this test.
      const labels = store.failedControllers.map((c) => c.label);
      expect(labels).toEqual(['Body', 'Core']);
      // Stage reflects the SHARED currentStage at the moment
      // applyJobFailed runs, not per-controller history. Both entries
      // pick up 'transfer' because CORE's SENDING update set
      // currentStage before either FAILED — even though body never had
      // its own SENDING update. Design intent: stage means "what the
      // flash was doing when it failed," not "what each controller was
      // doing." Per-controller tracking would make body.stage null here.
      for (const entry of store.failedControllers) {
        expect(entry.stage).toBe('transfer');
      }
    });

    it('leaves failedControllers empty when controllerStates is empty (pre-streamer abort with no snapshot)', () => {
      // Pre-streamer failure (e.g., release_not_found, bus_send_failed
      // before any controller-update): no flashJobStarted snapshot landed
      // first, so controllerStates is empty. Nothing to demote; the array
      // is empty. The FirmwareView template guards on
      // `failedControllers[0]?.stage`, and the panel's result bar uses
      // the multi-failure copy (via failedCount === 0 → multi key).
      // Compare with the "normalizes non-terminal stages to FAILED" test
      // for the post-applyJobStarted behavior.
      const store = useFirmwareStore();
      seedSampleFleet();
      // Deliberately skip applyJobStarted to leave controllerStates empty.
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

    it('normalizes non-terminal per-controller stages to FAILED (parallel to applyJobDone)', () => {
      // Symmetry: applyJobDone normalizes mid-flow stages to VERSION_CONFIRMED
      // to prevent the "✓ all updated" result bar contradicting a still-
      // spinning row. applyJobFailed had the inverse gap — a row stuck at
      // SENDING when the job failed kept spinning under a "failed" banner.
      // Now non-terminals are demoted to FAILED (with no error string,
      // signaling "unattributed" vs server-emitted FAILED entries that
      // carry the real reason).
      const store = useFirmwareStore();
      seedSampleFleet();
      store.applyJobStarted(sampleJobState());
      store.applyControllerUpdate({ controllerId: BODY_MAC, stage: 'SENDING' });
      // core left at QUEUED from sampleJobState
      store.applyJobFailed({
        jobId: 'job-1',
        endedAt: '2026-05-12T08:05:00Z',
        reason: 'bus_send_failed',
      });

      expect(store.controllerStates.get('body')?.stage).toBe('FAILED');
      expect(store.controllerStates.get('core')?.stage).toBe('FAILED');
      // The discriminated union requires every FAILED entry to carry an
      // `error` string. Demoted (non-server-reported) entries use the
      // 'unattributed:*' marker so ops can distinguish them from
      // server-reported failures.
      const bodyState = store.controllerStates.get('body');
      const coreState = store.controllerStates.get('core');
      if (bodyState?.stage === 'FAILED') {
        expect(bodyState.error).toContain('unattributed');
      }
      if (coreState?.stage === 'FAILED') {
        expect(coreState.error).toContain('unattributed');
      }
      // failedControllers reflects the demoted entries.
      const ids = store.failedControllers.map((c) => c.id);
      expect(ids).toEqual(['body', 'core']);
    });

    it('preserves server-reported FAILED error strings AND demoted entries get the unattributed marker', () => {
      // A controller that legitimately FAILED (with the server's error
      // reason) must keep its error attribute. The normalize must only
      // touch non-terminal stages.
      const store = useFirmwareStore();
      seedSampleFleet();
      store.applyJobStarted(sampleJobState());
      store.applyControllerUpdate({
        controllerId: CORE_MAC,
        stage: 'FAILED',
        error: 'hash_mismatch',
      });
      store.applyJobFailed({
        jobId: 'job-1',
        endedAt: '2026-05-12T08:05:00Z',
        reason: 'bus_send_failed',
      });

      // CORE's server-reported error string survives; body's demoted
      // entry carries the 'unattributed:*' marker, distinguishable from
      // any server-emitted error reason.
      const coreState = store.controllerStates.get('core');
      const bodyState = store.controllerStates.get('body');
      // Outer-stage assertions pin the post-condition before the narrow
      // guards below — without these, a regression that left bodyState
      // at QUEUED would skip the if blocks and pass silently.
      expect(coreState?.stage).toBe('FAILED');
      expect(bodyState?.stage).toBe('FAILED');
      if (coreState?.stage === 'FAILED') {
        expect(coreState.error).toBe('hash_mismatch');
      }
      if (bodyState?.stage === 'FAILED') {
        expect(bodyState.error).toContain('unattributed');
      }
    });

    it('clears pendingByMac so a late LocationStatus cannot replay stale entries onto failed state', () => {
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

    it('drops stale flashJobFailed whose jobId does not match currentJob', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const store = useFirmwareStore();
        seedSampleFleet();
        store.applyJobStarted(sampleJobState({ jobId: 'job-B' }));
        store.applyJobFailed({
          jobId: 'job-A',
          endedAt: '2026-05-14T08:00:00Z',
          reason: 'internal_server_error',
        });
        expect(store.phase).toBe('flashing');
        expect(store.flashError).toBeNull();
        expect(warnSpy.mock.calls.flat().join(' ')).toContain('jobId mismatch');
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('preserves FAILED entries from pendingByMac in failedControllers (bus-wide failure with unmapped MAC)', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const store = useFirmwareStore();
        seedSampleFleet();
        store.applyJobStarted(sampleJobState({ jobId: 'job-1' }));
        store.applyControllerUpdate({
          controllerId: 'aa:bb:cc:dd:ee:99',
          stage: 'FAILED',
          error: 'esp_now timeout',
        });
        expect(store.pendingByMac.get('aa:bb:cc:dd:ee:99')?.length).toBe(1);
        store.applyJobFailed({
          jobId: 'job-1',
          endedAt: '2026-05-14T08:01:00Z',
          reason: 'internal_server_error',
        });
        const failedIds = store.failedControllers.map((c) => c.id);
        expect(failedIds).toContain('aa:bb:cc:dd:ee:99');
        expect(warnSpy.mock.calls.flat().join(' ')).toContain('FAILED entry for unmapped MAC');
      } finally {
        warnSpy.mockRestore();
      }
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

    it('is true during the startFlash optimistic window (race fix)', async () => {
      // Regression pin: the server emits lockStateChanged{locked:true}
      // BEFORE flashJobStarted (and before the HTTP response carries
      // ownJobId). In that window, isOwnJob must already be true so the
      // operator's own flash doesn't get classified as a foreign-operator
      // lockout. Before the pendingOwnFlashStart fix, this test would
      // observe `isOwnJob === false`.
      apiPost.mockReturnValueOnce(new Promise(() => {})); // pending forever
      const store = useFirmwareStore();
      seedSampleFleet();
      store.sourceMode = 'github';
      store.selectedReleaseTag = 'v1.4.2';
      store.toggle('body');

      void store.startFlash();
      // Synchronous prefix has run — POST is in flight, no WS messages
      // have arrived yet. currentJob is null, ownJobId is null.
      expect(store.currentJob).toBeNull();
      expect(store.ownJobId).toBeNull();
      // ...but isOwnJob is true thanks to the pending flag.
      expect(store.isOwnJob).toBe(true);
    });

    it('foreign-flash detection still works (pendingOwnFlashStart is false unless we started a flash)', () => {
      // Pin that the new clause doesn't accidentally hide real foreign-
      // flash conflicts. The flag is set ONLY by startFlash; for a
      // foreign operator's flash, isOwnJob must still report false.
      const store = useFirmwareStore();
      seedSampleFleet();
      store.applyJobStarted(sampleJobState({ jobId: 'foreign-job' }));
      // ownJobId never set (we never POSTed).
      expect(store.isOwnJob).toBe(false);
    });

    it('clears pendingOwnFlashStart on applyJobDone — falls back to the equality clause for subsequent checks', async () => {
      // After our own flash terminates, isOwnJob's equality clause is
      // load-bearing for any future foreign-flash detection. Mutation
      // pin: removing the clear from applyJobDone would leak the flag
      // forward, classifying the next foreign flash as our own.
      apiPost.mockResolvedValueOnce({ data: { jobId: 'job-1' } });
      const store = useFirmwareStore();
      seedSampleFleet();
      store.sourceMode = 'github';
      store.selectedReleaseTag = 'v1.4.2';
      store.toggle('body');
      await store.startFlash();
      store.applyJobStarted(sampleJobState({ jobId: 'job-1' }));
      store.applyJobDone({ jobId: 'job-1', endedAt: '2026-05-16T10:00:00Z' });

      // Simulate a foreign flash starting later: clear currentJob (the
      // applyJobDone leaves it set as terminal state; resetToSelect or
      // the next applyJobStarted re-uses it).
      store.applyJobStarted(sampleJobState({ jobId: 'foreign-next' }));
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

    it('treats 404 as expected idle state — does NOT set currentJobLoadFailed', async () => {
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

    it('skips applying a body with endedAt set (mirrors server late-join filter for reboot-wait window)', async () => {
      // Server's decideLateJoinSnapshot skips emitting flashJobStarted on
      // WS reconnect when currentJob.endedAt is set (the 15s reboot-wait
      // window). HTTP must mirror that filter; otherwise a refresh during
      // reboot-wait would populate the store at phase='flashing' with no
      // subsequent WS event to transition us out, wedging the UI.
      const endedJob = sampleJobState({
        jobId: 'job-completed',
        endedAt: '2026-05-14T08:00:15Z',
      });
      apiClientGet.mockResolvedValueOnce({ data: endedJob });
      const store = useFirmwareStore();
      seedSampleFleet();
      await store.fetchCurrentJob();
      expect(store.currentJob).toBeNull();
      expect(store.phase).toBe('idle');
      expect(store.currentJobLoadFailed).toBe(false);
    });

    it('skips and warns when body.jobId is empty string (server contract violation)', async () => {
      // Pre-fix, the `body.jobId` truthy check let empty-string fall
      // through silently — no apply, no warn. A server contract bug
      // emitting `{jobId: ''}` would be invisible. Tightened to an
      // explicit non-empty-string check + forensic warn.
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        apiClientGet.mockResolvedValueOnce({
          data: { ...sampleJobState(), jobId: '' },
        });
        const store = useFirmwareStore();
        seedSampleFleet();
        await store.fetchCurrentJob();
        expect(store.currentJob).toBeNull();
        expect(warnSpy.mock.calls.flat().join(' ')).toContain('empty jobId');
      } finally {
        warnSpy.mockRestore();
      }
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
    // WS flashControllerUpdate / flashJobStarted entries can arrive
    // for a padawan before its LocationStatus heartbeat populates the
    // MAC map. The store queues those payloads keyed by raw MAC and
    // drains them when controllerStore.setControllerMac is later
    // called (via the dispatcher).
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

    it('logs a distinct re-queue warning when flushPendingForMac re-enqueues during flush (forensic breadcrumb)', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const store = useFirmwareStore();
        // Queue an entry under an unmapped MAC.
        store.applyControllerUpdate({ controllerId: 'aa:bb:cc:dd:ee:99', stage: 'SENDING' });
        expect(store.pendingByMac.size).toBe(1);
        // Flush without first mapping the MAC — applyControllerUpdate will
        // re-enqueue because resolveSlot still returns null.
        store.flushPendingForMac('aa:bb:cc:dd:ee:99');
        const warnText = warnSpy.mock.calls.flat().join(' ');
        expect(warnText).toContain('re-queued during flush');
        expect(warnText).toContain('aa:bb:cc:dd:ee:99');
      } finally {
        warnSpy.mockRestore();
      }
    });
  });
});
