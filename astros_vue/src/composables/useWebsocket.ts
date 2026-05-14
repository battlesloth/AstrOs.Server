import { ref } from 'vue';
import type {
  BaseWsMessage,
  LocationStatus,
  ControllerSync,
  LockStateChanged,
  ScriptStatus,
  SystemStatusWsMessage,
} from '@/models';
import { WebsocketMessageType, Location, ControllerStatus } from '@/enums';
import { useControllerStore } from '@/stores/controller';
import { useScriptsStore } from '@/stores/scripts';
import { useScripterStore } from '@/stores/scripter';
import { useSystemStatusStore } from '@/stores/systemStatus';
import { useJobLockStore } from '@/stores/jobLock';
import { useFirmwareStore } from '@/stores/firmware';
import type { ControllerFlashState, FlashJobFailedData, FlashJobState } from '@/types/firmware';

const ws = ref<WebSocket | null>(null);
const wsIsConnected = ref(false);
// Latched true on the first successful WS connect; never resets. Used by
// the FirmwareView's flash-stream-suspended banner to distinguish "WS
// hasn't connected YET" (early-mount, no operator alarm needed) from
// "WS connected and then dropped" (genuine staleness signal).
const wsHasEverConnected = ref(false);
const retryInterval = 3000;
let retryTimeout: number | null = null;
let intentionallyClosed = false;

function getWsUrl(): string {
  return import.meta.env.VITE_WS_URL || `ws://${window.location.hostname}:5000/ws`;
}

export function useWebsocket() {
  function wsConnect() {
    intentionallyClosed = false;
    // IM-9: capture the new socket in a local so handlers don't close
    // over ws.value (which is mutated by subsequent reconnects). Without
    // this, a stale onerror from socket A could close socket B during
    // HMR or an in-flight reconnect.
    const socket = new WebSocket(getWsUrl());
    ws.value = socket;

    socket.onopen = () => {
      wsIsConnected.value = true;
      wsHasEverConnected.value = true;
      console.log('WebSocket connected');
      if (retryTimeout) {
        clearTimeout(retryTimeout);
        retryTimeout = null;
      }
    };

    socket.onclose = () => {
      wsIsConnected.value = false;
      if (!intentionallyClosed) {
        console.log('WebSocket disconnected, retrying in 3 seconds...');
        attemptReconnect();
      }
    };

    socket.onerror = (error) => {
      console.error('WebSocket error:', error);
      // Close the captured socket (not ws.value, which may have been
      // reassigned to a new socket by a parallel wsConnect call).
      socket.close();
    };

    socket.onmessage = (event) => {
      handleMessage(event.data);
    };
  }

  function attemptReconnect() {
    if (!wsIsConnected.value && !intentionallyClosed) {
      retryTimeout = window.setTimeout(wsConnect, retryInterval);
    }
  }

  function wsDisconnect() {
    intentionallyClosed = true;
    if (retryTimeout) {
      window.clearTimeout(retryTimeout);
      retryTimeout = null;
    }
    if (ws.value) {
      ws.value.close();
      ws.value = null;
    }
  }

  function wsSendMessage(message: string): boolean {
    if (ws.value && wsIsConnected.value) {
      ws.value.send(message);
      return true;
    } else {
      console.warn('WebSocket is not connected. Message not sent:', message);
      return false;
    }
  }

  function handleMessage(message: string) {
    let parsedMessage: BaseWsMessage;
    try {
      parsedMessage = JSON.parse(message) as BaseWsMessage;
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
      return;
    }

    console.log('WebSocket message received:', parsedMessage.type);
    switch (parsedMessage.type) {
      case WebsocketMessageType.CONTROLLERS_SYNC:
        handleSyncMessage(parsedMessage);
        break;
      case WebsocketMessageType.LOCATION_STATUS:
        handleStatusMessage(parsedMessage);
        break;
      case WebsocketMessageType.SCRIPT:
        handleScriptMessage(parsedMessage);
        break;
      case WebsocketMessageType.SYSTEM_STATUS:
        handleSystemStatusMessage(parsedMessage as unknown as SystemStatusWsMessage);
        break;
      case WebsocketMessageType.LOCK_STATE_CHANGED:
        handleLockStateChanged(parsedMessage);
        break;
      case WebsocketMessageType.FLASH_JOB_STARTED:
        handleFlashJobStarted(parsedMessage);
        break;
      case WebsocketMessageType.FLASH_CONTROLLER_UPDATE:
        handleFlashControllerUpdate(parsedMessage);
        break;
      case WebsocketMessageType.FLASH_CONTROLLER_RESULT:
        handleFlashControllerResult(parsedMessage);
        break;
      case WebsocketMessageType.FLASH_JOB_DONE:
        handleFlashJobDone(parsedMessage);
        break;
      case WebsocketMessageType.FLASH_JOB_FAILED:
        handleFlashJobFailed(parsedMessage);
        break;
      case WebsocketMessageType.FLASH_JOB_ACTIVE:
        // Server-side rejection echo for write-class messages sent during a
        // flash; the UI doesn't act on this directly. Lock-aware UI
        // elements (AstrosWriteButton, AstrosServoTestModal) gate writes
        // during a flash so this rejection should never fire in normal use.
        break;
      default: {
        // Compile-time exhaustiveness attestation: adding a new
        // WebsocketMessageType variant the dispatcher doesn't handle should
        // be visible at refactor time. The `as never` is an attestation
        // (the switch discriminator is the wide enum, not a true
        // discriminated union), but it breaks loudly if someone later
        // refactors to a structural DU. The runtime warn stays for
        // forward-compat with future server-side values not yet typed.
        const _exhaustive: never = parsedMessage.type as never;
        void _exhaustive;
        console.warn('Unhandled message type:', message);
        break;
      }
    }
  }

  function handleSyncMessage(message: BaseWsMessage) {
    try {
      const data = message as ControllerSync;
      const controllerStore = useControllerStore();
      controllerStore.controllerSyncResponse(data);
    } catch (error) {
      console.error('Error handling sync message:', error);
    }
  }

  function handleStatusMessage(message: BaseWsMessage) {
    try {
      const data = message as LocationStatus;
      const controllerStore = useControllerStore();

      // Order matters: a stale config on incompatible firmware should still
      // surface as FIRMWARE_INCOMPATIBLE, not NEEDS_SYNCED.
      let status = ControllerStatus.DOWN;
      if (data.up) {
        if (!data.firmwareCompatible) {
          status = ControllerStatus.FIRMWARE_INCOMPATIBLE;
        } else if (data.synced) {
          status = ControllerStatus.UP;
        } else {
          status = ControllerStatus.NEEDS_SYNCED;
        }
      }

      let validLocation = false;
      switch (data.controllerLocation) {
        case Location.DOME:
          controllerStore.domeStatus = status;
          controllerStore.domeFirmware = data.firmwareVersion;
          validLocation = true;
          break;
        case Location.CORE:
          controllerStore.coreStatus = status;
          controllerStore.coreFirmware = data.firmwareVersion;
          validLocation = true;
          break;
        case Location.BODY:
          controllerStore.bodyStatus = status;
          controllerStore.bodyFirmware = data.firmwareVersion;
          validLocation = true;
          break;
        default:
          // An unrecognized location (server contract drift, misrouted
          // POLL_ACK, or Location.UNKNOWN) is invisible to the UI without
          // this log. Combined with the MAC-mapping skip below, a stuck
          // controller row would otherwise have no breadcrumb.
          console.warn(
            `[useWebsocket] handleStatusMessage: unrecognized controllerLocation="${data.controllerLocation}". Skipping status + MAC mapping.`,
          );
      }
      // Learn the MAC↔location mapping so the firmware view can translate
      // FlashJobState's `controllerId` (MAC) back to a slot for the progress
      // projection. The LocationStatus `controllerId` is a DB UUID — the
      // MAC lives on `controllerAddress`. After updating the resolver, drain
      // any flash events that were queued because this MAC wasn't mapped
      // yet (cold-load / late-join race).
      // Distinguish undefined (rolling-deploy: old server hasn't been
      // updated to populate the field) from empty string (server bug:
      // populated as ''). Both must skip the resolver write, but empty
      // string warrants a warn since it's not deploy-skew. We also skip
      // when the location was UNKNOWN/unrecognized: setControllerMac for
      // UNKNOWN is a no-op, and flushPendingForMac with no resolvable
      // mapping would re-queue the entries indefinitely.
      if (!validLocation) {
        // Skipped above; nothing to learn or flush.
      } else if (data.controllerAddress === undefined) {
        // Silent: expected during a rolling deploy of the server.
      } else if (data.controllerAddress === '') {
        console.warn(
          `[useWebsocket] handleStatusMessage: empty controllerAddress for location="${data.controllerLocation}". Server contract bug.`,
        );
      } else {
        controllerStore.setControllerMac(data.controllerLocation, data.controllerAddress);
        useFirmwareStore().flushPendingForMac(data.controllerAddress);
      }
    } catch (error) {
      console.error('Error handling status message:', error);
    }
  }

  function handleSystemStatusMessage(message: SystemStatusWsMessage) {
    try {
      const systemStatusStore = useSystemStatusStore();
      systemStatusStore.setStatus({
        readOnly: message.data.readOnly,
        reasonCode: message.data.reasonCode ?? null,
        enteredAt: message.data.enteredAt ?? null,
      });
    } catch (error) {
      console.error('Error handling system status message:', error);
    }
  }

  function handleLockStateChanged(message: BaseWsMessage) {
    try {
      const data = message as LockStateChanged;
      const jobLockStore = useJobLockStore();
      jobLockStore.setState({
        locked: data.locked,
        owner: data.owner,
        since: data.since,
      });
      // CR-1b defense-in-depth: if the server has released the lock while
      // the firmware store still thinks we're 'flashing', a terminal-event
      // (flashJobDone / flashJobFailed) was lost or arrived out of order.
      // Force phase='done' so the UI doesn't wedge. Combined with the
      // fetchCurrentJob endedAt filter (CR-1a), this closes the reboot-
      // wait wedge identified in the round-7 review.
      if (!data.locked) {
        const firmware = useFirmwareStore();
        if (firmware.phase === 'flashing') {
          console.warn(
            '[useWebsocket] handleLockStateChanged: phase=flashing with lock released. ' +
              'Forcing phase=done as recovery; a terminal-event may have been lost.',
          );
          firmware.setPhase('done');
        }
      }
    } catch (error) {
      console.error('Error handling lock state change:', error);
    }
  }

  // Firmware-flash WS handlers. The happy path delegates to the firmwareStore's
  // apply* actions; the catch path may also call `store.setFlashError(...)`
  // to surface a generic envelope (when the store can't see the malformed
  // input to recover by itself). All flashError writes route through
  // setFlashError — the round-6 sole-writer pattern, see firmware.ts
  // setPhase/setFlashError. Pin: a swallowed error must still produce an
  // operator-visible signal. The job-lifecycle handlers (Started/Done/Failed)
  // transition phase in their catch (Started → 'select' rollback; Done →
  // 'done'; Failed → 'failed'); the mid-stream handlers (controllerUpdate/
  // Result) surface flashError without rolling phase, AND skip the write
  // when a terminal flashError is already in place (CR-3 guard — preserves
  // the specific job-lifecycle reason vs. clobbering with protocol_violation).
  // The next valid update can still recover the per-row state.
  function handleFlashJobStarted(message: BaseWsMessage) {
    const store = useFirmwareStore();
    try {
      const data = (message as unknown as { data: FlashJobState | undefined }).data;
      if (!data || typeof data.jobId !== 'string') {
        throw new Error('malformed flashJobStarted payload (missing data or jobId)');
      }
      store.applyJobStarted(data);
    } catch (error) {
      console.error('Error handling flashJobStarted:', error);
      // Full reset: a malformed flashJobStarted means we can't trust
      // anything that follows for this job. setPhase('select') alone
      // leaves any prior `controllerStates` / `pendingByMac` / `currentJob`
      // visible in 'select' phase (the panel's progress gate hides them,
      // but the store invariant "select has no active job" would be
      // violated). resetToSelect drops it all atomically.
      store.resetToSelect();
      store.setFlashError({
        reason: 'protocol_violation',
        detail: 'Malformed flashJobStarted from server',
      });
    }
  }

  function handleFlashControllerUpdate(message: BaseWsMessage) {
    const store = useFirmwareStore();
    try {
      const data = (message as unknown as { data: ControllerFlashState }).data;
      store.applyControllerUpdate(data);
    } catch (error) {
      console.error('Error handling flashControllerUpdate:', error);
      // No phase rollback — the next valid update can recover the per-row
      // state. Note: the flashError banner is NOT auto-cleared by a
      // subsequent successful applyControllerUpdate; it persists until the
      // operator dismisses it or a job-lifecycle event (applyJobStarted,
      // applyJobDone, applyJobFailed) clears flashError. The operator-
      // visible "something went wrong" signal is the load-bearing piece.
      //
      // CR-3 guard: don't clobber a terminal flashError that already carries
      // the actual root cause (applyJobFailed sets specific reasons; a
      // malformed mid-stream frame's protocol_violation is less informative).
      // Only write when there's no existing error OR we're still mid-flow.
      if (store.flashError === null || store.phase === 'flashing') {
        store.setFlashError({
          reason: 'protocol_violation',
          detail: 'Malformed flashControllerUpdate from server',
        });
      }
    }
  }

  function handleFlashControllerResult(message: BaseWsMessage) {
    const store = useFirmwareStore();
    try {
      const data = (
        message as unknown as {
          data: { jobId: string; controller: ControllerFlashState };
        }
      ).data;
      store.applyControllerResult(data);
    } catch (error) {
      console.error('Error handling flashControllerResult:', error);
      // Mirrors handleFlashControllerUpdate: surface but don't transition.
      // The banner persists until operator-dismiss or a job-lifecycle clear.
      // CR-3 guard — see handleFlashControllerUpdate.
      if (store.flashError === null || store.phase === 'flashing') {
        store.setFlashError({
          reason: 'protocol_violation',
          detail: 'Malformed flashControllerResult from server',
        });
      }
    }
  }

  function handleFlashJobDone(message: BaseWsMessage) {
    const store = useFirmwareStore();
    try {
      const data = (message as unknown as { data: { jobId: string; endedAt: string } }).data;
      store.applyJobDone(data);
    } catch (error) {
      console.error('Error handling flashJobDone:', error);
      // Force terminal: the server has emitted job-done; the lock release
      // follows asynchronously on the next POLL_ACK heartbeat or the
      // reboot-timer fallback (per flash_orchestrator.ts). Without this
      // catch, an applyJobDone throw would leave phase at 'flashing'
      // indefinitely. Generic envelope; server logs are truth.
      store.setPhase('done');
      store.setFlashError({
        reason: 'protocol_violation',
        detail: 'Malformed flashJobDone from server',
      });
    }
  }

  function handleFlashJobFailed(message: BaseWsMessage) {
    const store = useFirmwareStore();
    try {
      const data = (message as unknown as { data: FlashJobFailedData | undefined }).data;
      if (!data || typeof data.endedAt !== 'string') {
        throw new Error('malformed flashJobFailed payload (missing data or endedAt)');
      }
      store.applyJobFailed(data);
    } catch (error) {
      console.error('Error handling flashJobFailed:', error);
      // Force the UI out of 'flashing' so the operator isn't wedged when the
      // payload can't be parsed. Envelope is generic; server logs are truth.
      store.setPhase('failed');
      store.setFlashError({
        reason: 'protocol_violation',
        detail: 'Malformed flashJobFailed from server',
      });
    }
  }

  function handleScriptMessage(message: BaseWsMessage) {
    try {
      const data = message as ScriptStatus;
      const scriptStore = useScriptsStore();
      scriptStore.updateScriptStatus(data);

      // Also update scripter store if it has the same script loaded
      const scripterStore = useScripterStore();
      if (scripterStore.script && scripterStore.script.id === data.scriptId) {
        scripterStore.updateScriptStatus(data);
      }
    } catch (error) {
      console.error('Error handling script message:', error);
    }
  }

  return {
    wsConnect,
    wsDisconnect,
    wsIsConnected,
    wsHasEverConnected,
    wsSendMessage,
    // Exposed for unit testing the dispatcher's malformed-payload guards
    // and the firmware-flash handlers' rollback behavior. Production code
    // never calls this directly — onmessage routes through it.
    handleMessage,
  };
}
