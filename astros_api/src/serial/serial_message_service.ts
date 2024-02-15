import { logger } from "../logger";
import { SerialMessageType, SerialMsgConst, SerialMsgValidationResult } from "./serial_message";

const { SerialPort } = eval("require('serialport')");
const { DelimiterParser } = eval("require('@serialport/parser-delimiter')");

export class SerialMessageService {

    private port: any;
    private parser: any;

    groupSep = '\u001d';
    recordSep = '\u001e';
    unitSep = '\u001f';

    constructor(port: string, baudRate: number) {

        this.port = new SerialPort({ path: port, baudRate: baudRate })
        this.parser = this.port.pipe(new DelimiterParser({ delimiter: '\n' }))
            .on('data', (data: any) => { this.handleMessage(data) });

    }


    public sendMessage(msg: string): Promise<boolean> {

        return new Promise<boolean>((resolve, reject) => {
            this.port.write(msg + '\n', (err: any) => {
                if (err) {
                    logger.error(`Error sending serial message: ${err}`);
                    return false;
                }
            });

            return true;

        });
    }

    public handleMessage(val: any): void {

        if (val === null || val === undefined) {
            logger.error("Received null or undefined message");
            return;
        }
        if (val.length === 0) {
            logger.error("Received empty message");
            return;
        }

        const validationResult = this.validateMessage(val.toString());

        if (!validationResult.valid) {
            logger.error(`Invalid message: ${val}`);
            return;
        }

        logger.debug(`Received message: ${val}`);

        /*
                val.split('\u001F')
               
        
                if (val.length < 3) {
                    logger.error(`Improper message length: ${val.length}`)
                    return;
                }
        
                const msgView = new DataView(new Uint8Array(val).buffer, 0);
                const type = msgView.getUint8(0);
                const payloadSize = msgView.getUint16(1);
                const payloadBytes = new Uint8Array(val.slice(3, 3 + payloadSize));
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
        */
        return;
    }

    private validateMessage(msg: string): SerialMsgValidationResult {

        const result = new SerialMsgValidationResult();

        const parts = msg.split(this.groupSep);
        if (parts.length !== 2) {
            logger.error(`Invalid message: ${msg}`);
            return result;
        }

        const header = parts[0].split(this.recordSep);

        if (header.length !== 3) {
            logger.error(`Invalid header: ${parts[0]}`);
            return result;
        }

        const type = parseInt(header[0]);

        if (isNaN(type)) {
            logger.error(`Invalid message type: ${header[0]}`);
            return result;
        }

        // TODO: switch to map
        switch (type) {
            case SerialMessageType.REGISTRATION_SYNC:
                result.valid = header[1] === SerialMsgConst.REGISTRATION_SYNC;
                break;
            case SerialMessageType.REGISTRATION_SYNC_ACK:
                result.valid = header[1] === SerialMsgConst.REGISTRATION_SYNC_ACK;
                break
            case SerialMessageType.POLL_ACK:
                result.valid = header[1] === SerialMsgConst.POLL_ACK;
                break
            case SerialMessageType.POLL_NAK:
                result.valid = header[1] === SerialMsgConst.POLL_NAK;
                break;
            case SerialMessageType.DEPLOY_SCRIPT:
                result.valid = header[1] === SerialMsgConst.DEPLOY_SCRIPT;
                break;
            case SerialMessageType.DEPLOY_SCRIPT_ACK:
                result.valid = header[1] === SerialMsgConst.DEPLOY_SCRIPT_ACK;
                break;
            case SerialMessageType.DEPLOY_SCRIPT_NAK:
                result.valid = header[1] === SerialMsgConst.DEPLOY_SCRIPT_NAK;
                break;
            case SerialMessageType.RUN_SCRIPT:
                result.valid = header[1] === SerialMsgConst.RUN_SCRIPT;
                break;
            case SerialMessageType.RUN_SCRIPT_ACK:
                result.valid = header[1] === SerialMsgConst.RUN_SCRIPT_ACK;
                break;
            case SerialMessageType.RUN_SCRIPT_NAK:
                result.valid = header[1] === SerialMsgConst.RUN_SCRIPT_NAK;
                break;
            case SerialMessageType.RUN_COMMAND:
                result.valid = header[1] === SerialMsgConst.RUN_COMMAND;
                break;
            case SerialMessageType.RUN_COMMAND_ACK:
                result.valid = header[1] === SerialMsgConst.RUN_COMMAND_ACK;
                break;
            case SerialMessageType.RUN_COMMAND_NAK:
                result.valid = header[1] === SerialMsgConst.RUN_COMMAND_NAK;
                break;
            default:
                logger.error(`Unknown message type: ${type}`);
                result.valid = false;
        }

        if (result.valid) {
            result.type = type;
            result.id = header[2];
        }

        return result;
    }

}