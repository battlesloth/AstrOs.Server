import { v4 } from "uuid";
import { logger } from "../logger";
import { MessageGenerator } from "./message_generator";
import { MessageHandler } from "./message_handler";
import { SerialMessageType } from "./serial_message";
import { ConfigSyncResponse, ISerialWorkerResponse, RegistrationResponse, ScriptDeployResponse, SerialWorkerResponseType } from "./serial_worker_response";
import { SerialMessageTracker } from "./serial_message_tracker";
import { MessageHelper } from "./message_helper";
import { ControlModule } from "astros-common";

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

        const msg = this.messageGererator.generateMessage(type, msgId, data);
        result.data = msg.msg;

        this.setMessageTimeout(type, msgId, msg.controllers, msg.metaData);

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

        if (validationResult.type !== SerialMessageType.POLL_ACK) {
            logger.debug(`Received message: ${msg}`);
        }

        switch (validationResult.type) {
            case SerialMessageType.POLL_ACK:
                result = this.messageHandler.handlePollAck(validationResult.data);
                break;
            case SerialMessageType.REGISTRATION_SYNC_ACK:
                result = this.messageHandler.handleRegistraionSyncAck(validationResult.data);
                break;
            case SerialMessageType.DEPLOY_CONFIG_ACK:
                result = this.messageHandler.handleDeployConfigAck(validationResult.data);
                break;
            case SerialMessageType.DEPLOY_SCRIPT_ACK:
            case SerialMessageType.DEPLOY_SCRIPT_NAK:
                result = this.messageHandler.handleDeployScriptAckNak(validationResult.type, validationResult.data);
                break;
            case SerialMessageType.RUN_SCRIPT_ACK:
            case SerialMessageType.RUN_SCRIPT_NAK:
                result = this.messageHandler.handleRunScriptAckNak(validationResult.type, validationResult.data);
                break;
        }

        if (validationResult.type !== SerialMessageType.POLL_ACK) {
            this.updateTracker(validationResult.id, result);
        }

        return result;
    }

    updateTracker(id: string, result: ISerialWorkerResponse) {

        if (!this.messageTracker.has(id)) {
            return;
        }

        const tracker = this.messageTracker.get(id);

        if (!tracker) {
            return;
        }

        switch (result.type) {
            case SerialWorkerResponseType.REGISTRATION_SYNC:
                tracker.controllerStatus.set("00:00:00:00:00:00", true);
                break;
            case SerialWorkerResponseType.CONFIG_SYNC:
            case SerialWorkerResponseType.SCRIPT_DEPLOY:
            case SerialWorkerResponseType.SCRIPT_RUN:
                tracker.controllerStatus.set(result.controller.address, true);
                break;
        }

        const vals = Array.from(tracker.controllerStatus.values());
        if (vals.every((v) => v)) {
            this.messageTracker.delete(id);
        }
    }

    setMessageTimeout(type: SerialMessageType, msgId: string, controllers: Array<string>, metaData: any) {

        if (this.messageTracker.has(msgId)) {
            logger.error(`Tracker already exists for message id: ${msgId}`);
            return;
        }

        if (MessageHelper.MessageTimeouts.has(type)) {
            const timeout = MessageHelper.MessageTimeouts.get(type);

            this.messageTracker.set(msgId, new SerialMessageTracker(msgId, type, controllers, metaData));

            setTimeout(() => {
                this.handleTimeout(msgId);
            }, timeout);
        }

    }

    handleTimeout(msgId: string) {
        const tracker = this.messageTracker.get(msgId);

        if (tracker === undefined) {
            logger.debug(`No tracker found for message id: ${msgId}, assume completed`);
            return;
        }

        logger.error(`Timeout for message: ${JSON.stringify(tracker)}`);

        const result = this.generateFailureResponse(tracker);

        this.messageTracker.delete(msgId);

        for (const response of result) {
            this.messageTimeoutCallback(response);
        }
    }

    generateFailureResponse(tracker: SerialMessageTracker): ISerialWorkerResponse[] {
        const result = new Array<ISerialWorkerResponse>();
        const failed = new Array<string>();

        for (const [key, value] of tracker.controllerStatus) {
            if (!value) {
                failed.push(key);
            }
        }

        switch (tracker.type) {
            case SerialMessageType.REGISTRATION_SYNC:
                result.push(new RegistrationResponse(false));
                break
            case SerialMessageType.DEPLOY_CONFIG:
                for (const controller of failed) {
                    const csr = new ConfigSyncResponse(false);
                    csr.controller = new ControlModule(0, '', controller);
                    result.push(csr);
                }
                break;
            case SerialMessageType.DEPLOY_SCRIPT:
                for (const controller of failed) {
                    const sdr = new ScriptDeployResponse(false, tracker.metaData);
                    sdr.controller = new ControlModule(0, '', controller);
                    result.push(sdr);
                }
                break;
            default:
                break
        }

        return result;

    }
}