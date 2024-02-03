import { logger } from ".././logger";
import { SerialMessage, SerialMessageType } from "./serial_message";

// |----ID-----|-type--|-payload size-|---payload---|
// | uint8[16] | uint8 |    uint8[2]  |  uint8[payload size] |
export class MessageHandler {

    onHeartbeat!: (node: string) => void;
    onSyncAck!: () => void;

    public handleMessage(val: any) : void {
        if (val.length < 19){
            logger.error(`Improper message length: ${val.length}`)
            return;
        }

        const msgView = new DataView(new Uint8Array(val).buffer, 0);
        const type = msgView.getUint8(16);
        const payloadSize = msgView.getUint16(17);
        const payloadBytes = new Uint8Array(val.slice(19, 19 + payloadSize));
        const payload = String.fromCharCode(...payloadBytes);

        logger.debug(`Message=>type: ${type}, payloadSize: ${payloadSize}, payload: ${payload}`);

        switch (type) {
            case SerialMessageType.heartbeat:
                break;
            case SerialMessageType.syncAck:
                break; 
            case SerialMessageType.scriptRunAck:
                break;
            case SerialMessageType.scriptRunNak:
                break;
            default:
                logger.error(`Unknown message type: ${type}`);
                break;
        }

        return;
    }
}


