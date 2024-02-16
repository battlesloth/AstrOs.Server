
//|--type--|--validation--|---msg Id---|---------------payload-------------|
//|--int---RS---string----RS--string---GS--val--US--val--RS--val--US--val--|

import { logger } from "../logger";
import { MessageHelper } from "./message_helper";
import { SerialMessageType } from "./serial_message";

export class MessageGenerator {


    generateMessage(type: SerialMessageType, data: any, id: string): any {

        let result = this.generateHeader(type, id);

        switch (type) {
            case SerialMessageType.REGISTRATION_SYNC:
                result += this.generateRegistrationSync(data);
                break;
            case SerialMessageType.DEPLOY_SCRIPT:
                result += this.generateDeployScript(data);
                break;
            case SerialMessageType.RUN_SCRIPT:
                result += this.generateRunScript(data);
                break;
            case SerialMessageType.RUN_COMMAND:
                result += this.generateRunCommand(data);
                break;
            default:
                logger.error(`Unknown message type: ${type}`);
                return "\n";
        }

        return `${result}${MessageHelper.MessageEOL}`;
    }

    generateHeader(type: SerialMessageType, id: string): string {
        return `${type}${MessageHelper.RS}${MessageHelper.ValidationMap.get(type)}${MessageHelper.RS}${id}`;
    }

    generateRunCommand(data: any) {
        return "";
    }

    generateRunScript(data: any) {
        return "";
    }

    generateDeployScript(data: any) {
        return "";
    }

    generateRegistrationSync(data: any) {
        return "";
    }
}
