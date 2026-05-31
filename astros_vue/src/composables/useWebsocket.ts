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
import { usePanicStateStore } from '@/stores/panicState';
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
    // Capture the new socket in a local so handlers don't close over
    // ws.value, which is mutated by subsequent reconnects. Without this,
    // a stale onerror from one socket could close a newer one during HMR
    // or an in-flight reconnect.
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
      case WebsocketMessageType.PANIC_STATE:
        handlePanicStateMessage(parsedMessage);
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
        // flash. Lock-aware UI elements gate writes so this should never
        // fire in normal operation.
        break;
      default: {
        // `as never` attestation: the switch discriminator is the wide
        // enum, not a structural discriminated union, so this isn't a real
        // compile-time exhaustiveness check — but it documents intent and
        // breaks if someone later refactors to a true DU. The runtime warn
        // is the actual forward-compat path.
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

  function handlePanicStateMessage(message: BaseWsMessage) {
    try {
      const data = message as unknown as { inPanicStop: boolean };
      usePanicStateStore().setState({ inPanicStop: data.inPanicStop });
    } catch (error) {
      console.error('Error handling panic state message:', error);
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
      // Defense-in-depth: a lock release while we still think we're
      // flashing means a terminal event was lost or arrived out of order.
      // Delegate to applyJobDone so per-controller states normalize (a
      // bare setPhase would leave rows showing "Updating" beneath an
      // "All updated" footer). The protocol_violation breadcrumb is the
      // operator-visible signal that recovery fired — they should verify
      // controllers actually flashed before trusting the result.
      if (!data.locked) {
        const firmware = useFirmwareStore();
        if (firmware.phase === 'flashing') {
          console.warn(
            '[useWebsocket] handleLockStateChanged: phase=flashing with lock released. ' +
              'Recovering via applyJobDone; a terminal-event may have been lost.',
          );
          firmware.applyJobDone({
            jobId: firmware.currentJob?.jobId ?? '<recovery>',
            endedAt: new Date().toISOString(),
          });
          firmware.setFlashError({
            reason: 'protocol_violation',
            detail:
              'Recovered from lost terminal event — verify each controller actually flashed before treating the result as authoritative.',
          });
        }
      }
    } catch (error) {
      console.error('Error handling lock state change:', error);
    }
  }

  // Firmware-flash WS handlers. Happy path delegates to the firmwareStore's
  // apply* actions; catch paths call `store.setFlashError(...)` to surface
  // a generic envelope when the store can't recover from malformed input.
  // All flashError writes route through setFlashError (sole-writer pattern;
  // see firmware.ts setFlashError/clearFlashError).
  //
  // Job-lifecycle handlers (Started/Done/Failed) transition phase in their
  // catch (Started → 'select' rollback; Done → 'done'; Failed → 'failed').
  // Mid-stream handlers (controllerUpdate/Result) surface flashError without
  // rolling phase, but only write when BOTH phase === 'flashing' AND no
  // existing flashError is set — protects clean "all updated" UIs from
  // stray malformed frames AND preserves any specific job-lifecycle reason
  // already in place.
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
      // Wire-shape validation throws so the catch surfaces a
      // protocol_violation breadcrumb. The store's own guard returns
      // silently for the rare internal-caller-with-bad-data path; the
      // throw here covers the WS-payload-malformed path that needs an
      // operator-visible signal.
      if (!data || typeof data.controllerId !== 'string' || data.controllerId.length === 0) {
        throw new Error('malformed flashControllerUpdate: missing/invalid controllerId');
      }
      store.applyControllerUpdate(data);
    } catch (error) {
      console.error('Error handling flashControllerUpdate:', error);
      // No phase rollback — the next valid update can recover per-row
      // state. flashError persists until operator-dismiss or a
      // job-lifecycle event overwrites it (applyJobStarted clears;
      // applyJobFailed sets a specific reason).
      if (store.flashError === null && store.phase === 'flashing') {
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
      if (
        !data ||
        !data.controller ||
        typeof data.controller.controllerId !== 'string' ||
        data.controller.controllerId.length === 0
      ) {
        throw new Error('malformed flashControllerResult: missing/invalid controller payload');
      }
      store.applyControllerResult(data);
    } catch (error) {
      console.error('Error handling flashControllerResult:', error);
      if (store.flashError === null && store.phase === 'flashing') {
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
