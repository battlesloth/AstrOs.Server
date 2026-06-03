import { parentPort } from 'worker_threads';
import { logger } from '../logger.js';
import { SerialMessageService } from '../serial/serial_message_service.js';
import { SerialMessageType } from '../serial/serial_message.js';
import { SerialWorkerResponseType } from '../serial/serial_worker_response.js';

const msgService = new SerialMessageService(messageTimeoutCallBack);

parentPort.on('message', (msg) => {
  if (isNaN(msg.type)) {
    logger.error(`Message type not defined: ${msg.type}`);
    parentPort.postMessage({ type: 0, error: `Message type not defined: ${msg.type}` });
    return;
  }

  try {
    switch (msg.type) {
      case SerialMessageType.SERIAL_MSG_RECEIVED: {
        const handleResult = msgService.handleMessage(msg.data);
        parentPort.postMessage(handleResult);
        break;
      }
      case SerialMessageType.RAW_WIRE: {
        // Pre-formed wire bytes from the firmware streamer (c.6b). The
        // streamer owns its own per-chunk retry budget and sliding-window
        // bookkeeping, so we deliberately do NOT route through
        // msgService.generateMessage (which would install a parallel
        // tracker timeout per FW_CHUNK). Just echo the bytes back as
        // SEND_SERIAL_MESSAGE so the parent's existing handler writes
        // them to the port.
        parentPort.postMessage({
          type: SerialWorkerResponseType.SEND_SERIAL_MESSAGE,
          data: msg.data,
        });
        break;
      }
      default: {
        const generateResult = msgService.generateMessage(msg.type, msg.data);
        parentPort.postMessage(generateResult);
        break;
      }
    }
  } catch (e) {
    logger.error(`Unhandled error in serial worker: ${e.message}`);
    parentPort.postMessage({ type: 0, error: e.message });
  }
});

function messageTimeoutCallBack(msg) {
  parentPort.postMessage(msg);
}
