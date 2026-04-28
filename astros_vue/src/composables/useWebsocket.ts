import { ref } from 'vue';
import type {
  BaseWsMessage,
  LocationStatus,
  ControllerSync,
  ScriptStatus,
  SystemStatusWsMessage,
} from '@/models';
import { WebsocketMessageType, Location, ControllerStatus } from '@/enums';
import { useControllerStore } from '@/stores/controller';
import { useScriptsStore } from '@/stores/scripts';
import { useScripterStore } from '@/stores/scripter';
import { useSystemStatusStore } from '@/stores/systemStatus';
import { useJobLockStore, type LockState } from '@/stores/jobLock';

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
      const data = message as unknown as LockState;
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
