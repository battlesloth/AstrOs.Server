import type { WebsocketMessageType } from '@/enums/WebsocketMessageType';
import type { ReadOnlyReasonCode } from '@/stores/systemStatus';

// The server's systemStatus broadcast (api_server.ts) sends
//   { type: TransmissionType.systemStatus, data: state }
// where `state` is the public read-only state object — no `success`/`message`
// envelope, unlike the other WS messages. Modeled here as a standalone shape
// rather than extending BaseWsMessage to keep that asymmetry honest.
export interface SystemStatusWsMessage {
  type: WebsocketMessageType.SYSTEM_STATUS;
  data: {
    readOnly: boolean;
    reasonCode?: ReadOnlyReasonCode | null;
    enteredAt?: string | null;
  };
}
