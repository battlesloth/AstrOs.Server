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
        reason: 'protocol_violation',
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
      expect(firmware.flashError?.reason).toBe('protocol_violation');
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
      expect(firmware.flashError?.reason).toBe('protocol_violation');
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

    it('skips setControllerMac AND flushPendingForMac when location is UNKNOWN (C1 fix)', () => {
      // Previously, the dispatcher fell through to the controllerAddress
      // block on UNKNOWN, calling setControllerMac (no-op for UNKNOWN) and
      // flushPendingForMac (which would re-queue endlessly because
      // resolveSlot still returned null). Plus the firmwareStore's
      // currentJobLoadFailed clear ran every time, silently dismissing
      // the only operator-visible "something wrong" banner.
      const { handleMessage } = useWebsocket();
      const firmware = useFirmwareStore();
      const controllerStore = useControllerStore();
      const MAC = 'aa:bb:cc:dd:ee:99';

      // Seed staleness flag (HTTP fetch had earlier failed).
      firmware.currentJobLoadFailed = true;
      // Queue an entry under MAC so we can prove flushPendingForMac
      // is NOT called below (which would re-queue, but the size would
      // still match).
      firmware.applyControllerUpdate({ controllerId: MAC, stage: 'SENDING' });
      expect(firmware.pendingByMac.get(MAC)).toHaveLength(1);

      handleMessage(
        JSON.stringify({
          type: WebsocketMessageType.LOCATION_STATUS,
          controllerLocation: Location.UNKNOWN,
          controllerId: 'db-uuid-unknown',
          controllerAddress: MAC,
          up: true,
          synced: true,
          firmwareCompatible: true,
        }),
      );

      expect(controllerStore.coreMac).toBeNull(); // no mapping written
      expect(controllerStore.domeMac).toBeNull();
      expect(controllerStore.bodyMac).toBe('00:00:00:00:00:00'); // sentinel unchanged
      expect(firmware.currentJobLoadFailed).toBe(true); // banner preserved
      // Pending queue unchanged — neither drained nor re-queued.
      expect(firmware.pendingByMac.get(MAC)).toHaveLength(1);
    });
  });

  describe('handleFlashControllerUpdate / handleFlashControllerResult error surfaces (C2 fix)', () => {
    it('surfaces flashError when applyControllerUpdate throws so the operator sees a signal', () => {
      // Previously this handler only console.error'd and continued; a thrown
      // applyControllerUpdate would leave phase='flashing' with no signal
      // and no error envelope. Pin the new flashError fallback.
      const { handleMessage } = useWebsocket();
      const firmware = useFirmwareStore();
      firmware.setPhase('flashing');
      firmware.applyControllerUpdate = (() => {
        throw new Error('synthetic invariant violation');
      }) as typeof firmware.applyControllerUpdate;

      handleMessage(
        JSON.stringify({
          type: WebsocketMessageType.FLASH_CONTROLLER_UPDATE,
          data: { controllerId: 'whatever', stage: 'SENDING' },
        }),
      );

      // Phase intentionally NOT rolled — the next valid update should
      // recover the row. But the operator-visible error must surface.
      expect(firmware.flashError?.reason).toBe('protocol_violation');
      expect(firmware.flashError?.detail).toBe('Malformed flashControllerUpdate from server');
      // Pin the non-rollback contract: a regression that added
      // setPhase('select' | 'failed') to this catch would pass the
      // flashError assertion but break the recover-row design intent.
      expect(firmware.phase).toBe('flashing');
    });

    it('surfaces flashError when applyControllerResult throws', () => {
      const { handleMessage } = useWebsocket();
      const firmware = useFirmwareStore();
      firmware.setPhase('flashing');
      firmware.applyControllerResult = (() => {
        throw new Error('synthetic invariant violation');
      }) as typeof firmware.applyControllerResult;

      handleMessage(
        JSON.stringify({
          type: WebsocketMessageType.FLASH_CONTROLLER_RESULT,
          data: { jobId: 'job-1', controller: { controllerId: 'whatever', stage: 'FAILED' } },
        }),
      );

      expect(firmware.flashError?.detail).toBe('Malformed flashControllerResult from server');
      // Pin the non-rollback contract per applyControllerUpdate above.
      expect(firmware.phase).toBe('flashing');
    });

    it('does NOT roll phase on unrecognized garbage controllerLocation in handleStatusMessage (I-test-4)', () => {
      // The C1 test pins Location.UNKNOWN. Server contract drift could
      // send any arbitrary string (e.g. `"head"` after a rename). The
      // default branch covers this case structurally — pin it explicitly
      // so a regression that hard-coded `if (location === UNKNOWN)` would
      // fail.
      const { handleMessage } = useWebsocket();
      const firmware = useFirmwareStore();
      const controllerStore = useControllerStore();
      firmware.currentJobLoadFailed = true; // banner should survive
      firmware.applyControllerUpdate({ controllerId: 'aa:bb:cc:00:00:01', stage: 'SENDING' });
      expect(firmware.pendingByMac.size).toBe(1);

      handleMessage(
        JSON.stringify({
          type: WebsocketMessageType.LOCATION_STATUS,
          controllerLocation: 'unrecognized-location-string',
          controllerId: 'db-uuid',
          controllerAddress: 'aa:bb:cc:00:00:01',
          up: true,
          synced: true,
          firmwareCompatible: true,
        }),
      );

      // No mapping written, no flush triggered, banner preserved, queue
      // entry unchanged.
      expect(controllerStore.coreMac).toBeNull();
      expect(controllerStore.domeMac).toBeNull();
      expect(controllerStore.bodyMac).toBe('00:00:00:00:00:00');
      expect(firmware.currentJobLoadFailed).toBe(true);
      expect(firmware.pendingByMac.get('aa:bb:cc:00:00:01')).toHaveLength(1);
    });
  });
});

describe('CR-3 mid-stream catch does not clobber terminal flashError', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('handleFlashControllerUpdate catch preserves a terminal flashError', () => {
    const { handleMessage } = useWebsocket();
    const firmware = useFirmwareStore();
    firmware.setFlashError({
      reason: 'internal_server_error',
      detail: 'asset checksum mismatch on Core',
    });
    firmware.setPhase('failed');
    handleMessage(
      JSON.stringify({
        type: WebsocketMessageType.FLASH_CONTROLLER_UPDATE,
        // missing/null data => triggers the catch
      }),
    );
    expect(firmware.flashError?.reason).toBe('internal_server_error');
    expect(firmware.flashError?.detail).toBe('asset checksum mismatch on Core');
  });

  it('handleFlashControllerResult catch preserves a terminal flashError', () => {
    const { handleMessage } = useWebsocket();
    const firmware = useFirmwareStore();
    firmware.setFlashError({
      reason: 'internal_server_error',
      detail: 'verify failed on Body',
    });
    firmware.setPhase('failed');
    handleMessage(
      JSON.stringify({
        type: WebsocketMessageType.FLASH_CONTROLLER_RESULT,
        // missing/null data => triggers the catch
      }),
    );
    expect(firmware.flashError?.reason).toBe('internal_server_error');
    expect(firmware.flashError?.detail).toBe('verify failed on Body');
  });

  it('handleFlashControllerUpdate catch DOES set protocol_violation when no existing flashError', () => {
    const { handleMessage } = useWebsocket();
    const firmware = useFirmwareStore();
    firmware.setPhase('flashing');
    handleMessage(
      JSON.stringify({
        type: WebsocketMessageType.FLASH_CONTROLLER_UPDATE,
      }),
    );
    expect(firmware.flashError?.reason).toBe('protocol_violation');
  });
});

describe('handleLockStateChanged — CR-1b recovery defense', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('forces firmware phase=done when lock releases but firmware is still flashing', () => {
    const { handleMessage } = useWebsocket();
    const firmware = useFirmwareStore();
    firmware.setPhase('flashing');
    handleMessage(
      JSON.stringify({
        type: WebsocketMessageType.LOCK_STATE_CHANGED,
        locked: false,
        owner: null,
        since: null,
      }),
    );
    expect(firmware.phase).toBe('done');
    expect(warnSpy.mock.calls.flat().join(' ')).toContain('phase=flashing with lock released');
  });

  it('does NOT force phase=done when firmware is not flashing (no spurious transitions)', () => {
    const { handleMessage } = useWebsocket();
    const firmware = useFirmwareStore();
    firmware.setPhase('select');
    handleMessage(
      JSON.stringify({
        type: WebsocketMessageType.LOCK_STATE_CHANGED,
        locked: false,
        owner: null,
        since: null,
      }),
    );
    expect(firmware.phase).toBe('select');
  });

  it('does NOT force phase transition when locked=true (no inverse trigger)', () => {
    const { handleMessage } = useWebsocket();
    const firmware = useFirmwareStore();
    firmware.setPhase('flashing');
    handleMessage(
      JSON.stringify({
        type: WebsocketMessageType.LOCK_STATE_CHANGED,
        locked: true,
        owner: 'other-op',
        since: '2026-05-14T08:00:00Z',
      }),
    );
    expect(firmware.phase).toBe('flashing');
  });
});

describe('WebsocketMessageType wire-numeric pinning (cross-process contract)', () => {
  it('pins the wire numeric values that the server emits — drift here breaks every WS message', () => {
    expect(WebsocketMessageType.SCRIPT).toBe(0);
    expect(WebsocketMessageType.CONFIGURATION_SYNC).toBe(1);
    expect(WebsocketMessageType.LOCATION_STATUS).toBe(2);
    expect(WebsocketMessageType.CONTROLLERS_SYNC).toBe(3);
    expect(WebsocketMessageType.RUN).toBe(4);
    expect(WebsocketMessageType.PANIC).toBe(5);
    expect(WebsocketMessageType.DIRECT_COMMAND).toBe(6);
    expect(WebsocketMessageType.FORMAT_SD).toBe(7);
    expect(WebsocketMessageType.SERVO_TEST).toBe(8);
    expect(WebsocketMessageType.SYSTEM_STATUS).toBe(9);
    expect(WebsocketMessageType.LOCK_STATE_CHANGED).toBe(10);
    expect(WebsocketMessageType.FLASH_JOB_ACTIVE).toBe(11);
    expect(WebsocketMessageType.FLASH_JOB_STARTED).toBe(12);
    expect(WebsocketMessageType.FLASH_CONTROLLER_UPDATE).toBe(13);
    expect(WebsocketMessageType.FLASH_CONTROLLER_RESULT).toBe(14);
    expect(WebsocketMessageType.FLASH_JOB_DONE).toBe(15);
    expect(WebsocketMessageType.FLASH_JOB_FAILED).toBe(16);
  });
});
