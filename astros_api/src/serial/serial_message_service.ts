import { v4 } from "uuid";
import { logger } from "../logger";
import { MessageGenerator } from "./message_generator";
import { MessageHandler } from "./message_handler";
import { SerialMessageType } from "./serial_message";
import { ISerialWorkerResponse, RegistrationResponse, SerialWorkerResponseType } from "./serial_worker_response";
import { SerialMessageTracker } from "./serial_message_tracker";
import { MessageHelper } from "./message_helper";

export class SerialMessageService {

    messageHandler: MessageHandler = new MessageHandler();
    messageGererator: MessageGenerator = new MessageGenerator();

    messageTracker: Map<string, SerialMessageTracker> = new Map<string, SerialMessageTracker>();

    messageTimeoutCallback: (msg: ISerialWorkerResponse) => void;

    constructor(messageTimeoutCallback: (msgId: ISerialWorkerResponse) => void) {
        this.messageTimeoutCallback = messageTimeoutCallback;
    }

    public generateMessage(type: SerialMessageType, data: any): ISerialWorkerResponse {

        const result: ISerialWorkerResponse = { type: SerialWorkerResponseType.SEND_SERIAL_MESSAGE };

        const msgId = v4();

        result.data = this.messageGererator.generateMessage(type, data, msgId);

        this.setMessageTimeout(type, msgId);

        return result;
    }

    public handleMessage(msg: any): ISerialWorkerResponse {

        let result: ISerialWorkerResponse = { type: SerialWorkerResponseType.UNKNOWN };

        if (msg === null || msg === undefined) {
            logger.error("Received null or undefined message");
            return result;
        }
        if (msg.length === 0) {
            logger.error("Received empty message");
            return result;
        }

        const validationResult = this.messageHandler.validateMessage(msg.toString());

        if (!validationResult.valid) {
            logger.error(`Invalid message: ${msg}`);
            return result;
        }

        logger.debug(`Received message: ${msg}`);

        // remove the message from the tracker
        if (this.messageTracker.has(validationResult.id)) {
            this.messageTracker.delete(validationResult.id);
        }

        switch (validationResult.type) {
            case SerialMessageType.POLL_ACK:
                result = this.messageHandler.handlePollAck(validationResult.data);
                break;
            case SerialMessageType.REGISTRATION_SYNC_ACK:
                result = this.messageHandler.handleRegistraionSyncAck(validationResult.data);
                break;
        }

        return result;
    }

    setMessageTimeout(type: SerialMessageType, msgId: string) {

        if (this.messageTracker.has(msgId)) {
            logger.error(`Tracker already exists for message id: ${msgId}`);
            return;
        }

        if (MessageHelper.MessageTimeouts.has(type)) {
            const timeout = MessageHelper.MessageTimeouts.get(type);

            this.messageTracker.set(msgId, new SerialMessageTracker(msgId, type));

            setTimeout(() => {
                this.handleTimeout(msgId);
            }, timeout);
        }

    }

    handleTimeout(msgId: string) {
        const tracker = this.messageTracker.get(msgId);

        let result: ISerialWorkerResponse = { type: SerialWorkerResponseType.TIMEOUT, data: msgId };

        if (tracker === undefined) {
            logger.debug(`No tracker found for message id: ${msgId}, assume completed`);
            return;
        }

        logger.error(`Timeout for message id: ${msgId}`);

        this.messageTracker.delete(msgId);


        switch (tracker.type) {
            case SerialMessageType.REGISTRATION_SYNC:
                result = new RegistrationResponse(false);
                break;
            default:
                break
        }


        this.messageTimeoutCallback(result);
    }
}