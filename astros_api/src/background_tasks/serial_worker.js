import { parentPort } from "worker_threads";
import { logger } from "../logger";
import { SerialMessageService } from "../serial/serial_message_service";
import { SerialMessageType } from "../serial/serial_message";

const msgService = new SerialMessageService(messageTimeoutCallBack);

parentPort.on('message', msg => {
    
    if (isNaN(msg.type)) {
        logger.error(`Message type not defined: ${msg.type}`);
        return;
    }

    try{
    switch (msg.type){
        case SerialMessageType.SERIAL_MSG_RECEIVED:
            const handleResult = msgService.handleMessage(msg.data);
            parentPort.postMessage(handleResult);
            break;
        default:
            const generateResult = msgService.generateMessage(msg.type, msg.data);
            parentPort.postMessage(generateResult);
            break;
        }
    } catch (e){
        logger.error(`Unhandled error in serial worker: ${e.message}`);
    }
});


function messageTimeoutCallBack(msg){
    parentPort.postMessage(msg);
}