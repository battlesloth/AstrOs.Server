import type { WebsocketMessageType } from "@/enums/WebsocketMessageType";

export interface BaseWsMessage {
  type: WebsocketMessageType;
  success: boolean;
  message: string;
}