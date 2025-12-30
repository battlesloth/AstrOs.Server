import { ref } from 'vue';
import { WebsocketMessageType } from '@/enums/WebsocketMessageType';
import type { BaseWsMessage } from '@/models/websocket/baseWsMessage';
import type { LocationStatus } from '@/models/websocket/locationStatus';
import type { ControllerSync } from '@/models/websocket/controllerSync';
import { useControllerStore } from '@/stores/controller';
import { Location } from '@/enums/modules/Location';
import { ControllerStatus } from '@/enums/controllerStatus';
import type { ScriptStatus } from '@/models/websocket/scriptStatus';
import { useScriptsStore } from '@/stores/scripts';

const ws = ref<WebSocket | null>(null);
const wsIsConnected = ref(false);
const retryInterval = 3000;
let retryTimeout: number | null = null;

export function useWebsocket() {
  function wsConnect() {
    ws.value = new WebSocket('ws://localhost:5000/ws');

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
      console.log('WebSocket disconnected, retrying in 3 seconds...');
      attemptReconnect();
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
    if (!wsIsConnected.value) {
      retryTimeout = window.setTimeout(wsConnect, retryInterval);
    }
  }

  function wsDisconnect() {
    if (ws.value) {
      ws.value.close();
      ws.value = null;
    }
    if (retryTimeout) {
      window.clearTimeout(retryTimeout);
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
    const parsedMessage = JSON.parse(message) as BaseWsMessage;

    switch (parsedMessage.type) {
      case WebsocketMessageType.controllersSync:
        handleSyncMessage(parsedMessage);
        break;
      case WebsocketMessageType.locationStatus:
        handleStatusMessage(parsedMessage);
        break;
      case WebsocketMessageType.script:
        handleScriptMessage(parsedMessage);
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
      let status = ControllerStatus.DOWN;

      if (data.synced) {
        status = ControllerStatus.UP;
      } else if (data.up) {
        status = ControllerStatus.NEEDS_SYNCED;
      }

      switch (data.controllerLocation) {
        case Location.dome:
          controllerStore.domeStatus = status;
          break;
        case Location.core:
          controllerStore.coreStatus = status;
          break;
        case Location.body:
          controllerStore.bodyStatus = status;
          break;
      }
    } catch (error) {
      console.error('Error handling status message:', error);
    }
  }

  function handleScriptMessage(message: BaseWsMessage) {
    try {
      const data = message as ScriptStatus;
      const scriptStore = useScriptsStore();
      scriptStore.updateScriptStatus(data);
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
