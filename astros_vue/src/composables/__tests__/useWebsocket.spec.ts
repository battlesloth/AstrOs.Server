import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useWebsocket } from '../useWebsocket';
import { useFirmwareStore } from '@/stores/firmware';
import { useControllerStore } from '@/stores/controller';
import { WebsocketMessageType, Location } from '@/enums';

// Capture warn calls so individual tests can assert against them, while
// suppressing the expected stderr noise from error/log paths. The spies
// are reset between tests so call lists don't bleed across cases.
let warnSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('useWebsocket handleMessage — firmware-flash dispatcher', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  describe('handleFlashJobStarted malformed-payload rollback', () => {
    it("rolls phase to 'select' and surfaces flashError when payload is missing data.jobId", () => {
      // The dispatcher catch is load-bearing: without it a malformed
      // flashJobStarted would leave the UI stuck at 'flashing' with no
      // operator-visible reason. Pin: setPhase('select') + flashError.
      const { handleMessage } = useWebsocket();
      const firmware = useFirmwareStore();
      firmware.setPhase('flashing'); // simulate just-clicked-Flash

      handleMessage(
        JSON.stringify({
          type: WebsocketMessageType.FLASH_JOB_STARTED,
          // No `data` field → malformed.
        }),
      );

      expect(firmware.phase).toBe('select');
      expect(firmware.flashError).toEqual({
        reason: 'internal_server_error',
        detail: 'Malformed flashJobStarted from server',
      });
    });
  });

  describe('handleFlashJobFailed malformed-payload rollback', () => {
    it("rolls phase to 'failed' when payload is missing data.endedAt", () => {
      const { handleMessage } = useWebsocket();
      const firmware = useFirmwareStore();
      firmware.setPhase('flashing');

      handleMessage(
        JSON.stringify({
          type: WebsocketMessageType.FLASH_JOB_FAILED,
          data: { jobId: 'job-1' }, // missing endedAt
        }),
      );

      expect(firmware.phase).toBe('failed');
      expect(firmware.flashError?.reason).toBe('internal_server_error');
      expect(firmware.flashError?.detail).toBe('Malformed flashJobFailed from server');
    });
  });

  describe('handleFlashJobDone fallback (I1 fix)', () => {
    it("forces phase to 'done' if the store's applyJobDone throws", () => {
      // Previously this handler only console.error'd and continued — a throw
      // would leave phase at 'flashing' indefinitely with the server having
      // marked the job done. Pin: catch transitions to 'done' so the UI
      // exits the flashing state regardless.
      const { handleMessage } = useWebsocket();
      const firmware = useFirmwareStore();
      firmware.setPhase('flashing');
      // Force applyJobDone to throw to simulate a future invariant violation.
      firmware.applyJobDone = (() => {
        throw new Error('synthetic invariant violation');
      }) as typeof firmware.applyJobDone;

      handleMessage(
        JSON.stringify({
          type: WebsocketMessageType.FLASH_JOB_DONE,
          data: { jobId: 'job-1', endedAt: '2026-05-13T08:05:00Z' },
        }),
      );

      expect(firmware.phase).toBe('done');
      expect(firmware.flashError?.reason).toBe('internal_server_error');
      expect(firmware.flashError?.detail).toBe('Malformed flashJobDone from server');
    });
  });

  describe('handleStatusMessage controllerAddress branches (I4 fix)', () => {
    it('learns the MAC mapping when controllerAddress is a non-empty string', () => {
      const { handleMessage } = useWebsocket();
      const controllerStore = useControllerStore();

      handleMessage(
        JSON.stringify({
          type: WebsocketMessageType.LOCATION_STATUS,
          controllerLocation: Location.CORE,
          controllerId: 'db-uuid-core',
          controllerAddress: 'aa:bb:cc:dd:ee:01',
          up: true,
          synced: true,
          firmwareCompatible: true,
        }),
      );

      expect(controllerStore.coreMac).toBe('aa:bb:cc:dd:ee:01');
      expect(controllerStore.controllerIdToLocation('aa:bb:cc:dd:ee:01')).toBe(Location.CORE);
    });

    it('skips MAC learning silently when controllerAddress is undefined (rolling-deploy tolerance)', () => {
      const { handleMessage } = useWebsocket();
      const controllerStore = useControllerStore();

      handleMessage(
        JSON.stringify({
          type: WebsocketMessageType.LOCATION_STATUS,
          controllerLocation: Location.CORE,
          controllerId: 'db-uuid-core',
          // No controllerAddress field (older server).
          up: true,
          synced: true,
          firmwareCompatible: true,
        }),
      );

      expect(controllerStore.coreMac).toBeNull();
    });

    it('warns but skips MAC learning when controllerAddress is empty string (server contract bug)', () => {
      // Empty string is a server bug, not deploy-skew — surfacing it lets
      // a stuck row be traced back to its origin during ops debugging.
      // warnSpy is the outer-beforeEach spy; calls accumulate from the start
      // of the test so the assertion is not subject to spy-stacking races.
      const { handleMessage } = useWebsocket();
      const controllerStore = useControllerStore();

      handleMessage(
        JSON.stringify({
          type: WebsocketMessageType.LOCATION_STATUS,
          controllerLocation: Location.CORE,
          controllerId: 'db-uuid-core',
          controllerAddress: '',
          up: true,
          synced: true,
          firmwareCompatible: true,
        }),
      );

      expect(controllerStore.coreMac).toBeNull();
      const warnCalls = warnSpy.mock.calls.flat().join(' ');
      expect(warnCalls).toContain('empty controllerAddress');
    });
  });

  describe('handleStatusMessage drains the firmware-store pending queue after setControllerMac (C1 integration)', () => {
    it('replays queued ControllerFlashState entries once the matching LocationStatus arrives', () => {
      // The late-MAC race fix: a flashControllerUpdate for an unmapped MAC
      // is queued; the next LocationStatus for that MAC drains the queue.
      // Pin the integration via the dispatcher — store-only tests can't
      // catch a regression where useWebsocket forgets to call flushPendingForMac.
      const { handleMessage } = useWebsocket();
      const firmware = useFirmwareStore();
      const MAC = 'aa:bb:cc:dd:ee:01';

      handleMessage(
        JSON.stringify({
          type: WebsocketMessageType.FLASH_CONTROLLER_UPDATE,
          data: { controllerId: MAC, stage: 'SENDING' },
        }),
      );
      expect(firmware.controllerStates.size).toBe(0);
      expect(firmware.pendingByMac.get(MAC)).toHaveLength(1);

      handleMessage(
        JSON.stringify({
          type: WebsocketMessageType.LOCATION_STATUS,
          controllerLocation: Location.CORE,
          controllerId: 'db-uuid-core',
          controllerAddress: MAC,
          up: true,
          synced: true,
          firmwareCompatible: true,
        }),
      );

      expect(firmware.controllerStates.get('core')?.stage).toBe('SENDING');
      expect(firmware.pendingByMac.has(MAC)).toBe(false);
    });
  });
});
