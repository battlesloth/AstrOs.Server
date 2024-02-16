import { logger } from ".././logger";
import { SerialMsgValidationResult } from "./serial_message";
import { MessageHelper } from "./message_helper";

//|--type--|--validation--|---msg Id---|---------------payload-------------|
//|--int---RS---string----RS--string---GS--val--US--val--RS--val--US--val--|

export class MessageHandler {

    public validateMessage(msg: string): SerialMsgValidationResult {

        const result = new SerialMsgValidationResult();

        const parts = msg.split(MessageHelper.GS);
        if (parts.length !== 2) {
            logger.error(`Invalid message: ${msg}`);
            return result;
        }

        const header = parts[0].split(MessageHelper.RS);

        if (header.length !== 3) {
            logger.error(`Invalid header: ${parts[0]}`);
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
        }

        return result;
    }
}


