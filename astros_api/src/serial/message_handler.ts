import { logger } from ".././logger";
import { SerialMsgValidationResult } from "./serial_message";
import { MessageHelper } from "./message_helper";
import { ConfigSyncResponse, PollRepsonse, RegistrationResponse, SerialWorkerResponseType } from "./serial_worker_response";
import { ControlModule } from "astros-common";

//|--type--|--validation--|---msg Id---|---------------payload-------------|
//|--int---RS---string----RS--string---GS--val--US--val--RS--val--US--val--|

export class MessageHandler {

    public validateMessage(msg: string): SerialMsgValidationResult {

        const result = new SerialMsgValidationResult();

        const groups = msg.split(MessageHelper.GS);
        if (groups.length !== 2) {
            logger.error(`Invalid message: ${msg}`);
            return result;
        }

        const header = groups[0].split(MessageHelper.RS);

        if (header.length !== 3) {
            logger.error(`Invalid header: ${groups[0]}`);
            return result;
        }

        const type = parseInt(header[0]);

        if (isNaN(type)) {
            logger.error(`Invalid message type: ${header[0]}`);
            return result;
        }

        result.valid = header[1] === MessageHelper.ValidationMap.get(type);

        if (result.valid) {
            result.type = type;
            result.id = header[2];

            if (groups.length > 1) {
                result.data = groups[1];
            }
        }

        return result;
    }

    public handlePollAck(msg: string): PollRepsonse {
        const response = new PollRepsonse();

        const parts = msg.split(MessageHelper.US);

        if (parts.length !== 3) {
            logger.error(`Invalid poll ack: ${msg}`);
            response.type = SerialWorkerResponseType.UNKNOWN;
            return response;
        }

        const module = new ControlModule(0, parts[1], parts[0]);
        module.fingerprint = parts[2];
        response.controller = module;

        return response;
    }

    public handleRegistraionSyncAck(msg: string): RegistrationResponse {

        const response = new RegistrationResponse(true);

        const records = msg.split(MessageHelper.RS);

        for (const record of records) {

            const units = record.split(MessageHelper.US);

            if (units.length < 2) {
                logger.error(`Invalid registration record: ${record}`);
                continue;
            }

            const module = new ControlModule(0, units[1], units[0]);

            response.registrations.push(module);
        }

        return response;
    }

    handleDeployConfigAck(msg: string): ConfigSyncResponse {

        const response = new ConfigSyncResponse();

        const parts = msg.split(MessageHelper.US);

        if (parts.length !== 3) {
            logger.error(`Invalid poll ack: ${msg}`);
            response.type = SerialWorkerResponseType.UNKNOWN;
            return response;
        }

        const module = new ControlModule(0, parts[1], parts[0]);
        module.fingerprint = parts[2];
        response.controller = module;

        return response;
    }
}


