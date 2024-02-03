import { logger } from ".././logger";
import { SerialMessage, SerialMessageType } from "./serial_message";

// |----ID-----|-type--|-payload size-|---payload---|
// | uint8[16] | uint8 |    uint8[2]  |  uint8[payload size] |
export class MessageHandler {

    onHeartbeat!: (node: string) => void;
    onSyncAck!: () => void;

    public handleMessage(val: Uint8Array) {
        logger.info(`Serial Message received: ${val}`); 
        
        if (val.length < 19){
            logger.error(`Improper message length: ${val.length}`)
            return;
        }

        const type =  val[16] as SerialMessageType;

        const payloadSizeBuffer = new Uint8Array([val[17], val[18]]);
        const view = new DataView(payloadSizeBuffer.buffer, 0);
        const payloadSize = view.getUint16(0, true);

        logger.info(`Message=>type: ${type}, payloadSize: ${payloadSize}`);

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
    }
}


