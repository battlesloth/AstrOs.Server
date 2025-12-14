import { WebsocketMessageType } from "@/enums/WebsocketMessageType";
import type { BaseWsMessage } from "@/models/websocket/baseWsMessage";
import type { LocationStatus } from "@/models/websocket/locationStatus";
import type { ControllerSync } from "@/models/websocket/controllerSync";
import { useControllerStore } from "@/stores/controller";

export function useWebsocketReceiver() {

  function handleMessage(message: string) {
    console.log('Received message:', message);

    const parsedMessage = JSON.parse(message) as BaseWsMessage;

    switch (parsedMessage.type) {
      case WebsocketMessageType.controllersSync:
        handleSyncMessage(parsedMessage);
        break;
      case WebsocketMessageType.locationStatus:
        handleStatusMessage(parsedMessage);
        break;
      default:
        console.warn('Unhandled message type:', parsedMessage.type);
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
    } catch (error) {
      console.error('Error handling status message:', error);
    }
  }

  return {
    handleMessage
  };
}