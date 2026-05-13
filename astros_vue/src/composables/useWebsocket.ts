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
const retryInterval = 3000;
let retryTimeout: number | null = null;
let intentionallyClosed = false;

function getWsUrl(): string {
  return import.meta.env.VITE_WS_URL || `ws://${window.location.hostname}:5000/ws`;
}

export function useWebsocket() {
  function wsConnect() {
    intentionallyClosed = false;
    ws.value = new WebSocket(getWsUrl());

    ws.value.onopen = () => {
      wsIsConnected.value = true;
      console.log('WebSocket connected');
      if (retryTimeout) {
        clearTimeout(retryTimeout);
        retryTimeout = null;
      }
    };

    ws.value.onclose = () => {
      wsIsConnected.value = false;
      if (!intentionallyClosed) {
        console.log('WebSocket disconnected, retrying in 3 seconds...');
        attemptReconnect();
      }
    };

    ws.value.onerror = (error) => {
      console.error('WebSocket error:', error);
      ws.value?.close();
    };

    ws.value.onmessage = (event) => {
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
        // flash; the UI doesn't act on this directly (the lock-aware
        // AstrosWriteButton already disables write actions).
        break;
      default:
        console.warn('Unhandled message type:', message);
        break;
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

      switch (data.controllerLocation) {
        case Location.DOME:
          controllerStore.domeStatus = status;
          controllerStore.domeFirmware = data.firmwareVersion;
          break;
        case Location.CORE:
          controllerStore.coreStatus = status;
          controllerStore.coreFirmware = data.firmwareVersion;
          break;
        case Location.BODY:
          controllerStore.bodyStatus = status;
          controllerStore.bodyFirmware = data.firmwareVersion;
          break;
      }
      // Learn the MAC↔location mapping so the firmware view can translate
      // FlashJobState's `controllerId` (MAC) back to a slot for the progress
      // projection. The LocationStatus `controllerId` is a DB UUID — the
      // MAC lives on `controllerAddress`. After updating the resolver, drain
      // any flash events that were queued because this MAC wasn't mapped
      // yet (cold-load / late-join race).
      if (data.controllerAddress) {
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
    } catch (error) {
      console.error('Error handling lock state change:', error);
    }
  }

  // Firmware-flash WS handlers. Each delegates to the firmwareStore's apply*
  // action so the store remains the sole writer of server-pushed flash state.
  // The try/catch is load-bearing: a malformed payload must not lock the UI
  // in 'flashing' — store actions handle defensive cases internally and the
  // catch surfaces a flashError envelope on the failure path so the operator
  // sees something rather than a wedged UI.
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
      // Roll the UI back to select with a surfaced error so the operator
      // isn't wedged in 'flashing' awaiting a snapshot we can't parse.
      store.setPhase('select');
      store.flashError = {
        reason: 'internal_server_error',
        detail: 'Malformed flashJobStarted from server',
      };
    }
  }

  function handleFlashControllerUpdate(message: BaseWsMessage) {
    try {
      const data = (message as unknown as { data: ControllerFlashState }).data;
      useFirmwareStore().applyControllerUpdate(data);
    } catch (error) {
      console.error('Error handling flashControllerUpdate:', error);
    }
  }

  function handleFlashControllerResult(message: BaseWsMessage) {
    try {
      const data = (
        message as unknown as {
          data: { jobId: string; controller: ControllerFlashState };
        }
      ).data;
      useFirmwareStore().applyControllerResult(data);
    } catch (error) {
      console.error('Error handling flashControllerResult:', error);
    }
  }

  function handleFlashJobDone(message: BaseWsMessage) {
    try {
      const data = (message as unknown as { data: { jobId: string; endedAt: string } }).data;
      useFirmwareStore().applyJobDone(data);
    } catch (error) {
      console.error('Error handling flashJobDone:', error);
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
      store.flashError = {
        reason: 'internal_server_error',
        detail: 'Malformed flashJobFailed from server',
      };
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
    wsSendMessage,
  };
}
