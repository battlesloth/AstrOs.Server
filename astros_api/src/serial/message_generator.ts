
//|--type--|--validation--|---msg Id---|---------------payload-------------|
//|--int---RS---string----RS--string---GS--val--US--val--RS--val--US--val--|

import { ConfigSync } from "src/models/config/config_sync";
import { logger } from "../logger";
import { MessageHelper } from "./message_helper";
import { SerialMessageType } from "./serial_message";
import { ScriptUpload } from "src/models/scripts/script_upload";
import { ScriptRun } from "src/models/scripts/script_run";

export class MessageGenerator {

    GS = MessageHelper.GS;
    RS = MessageHelper.RS;
    US = MessageHelper.US;

    generateMessage(type: SerialMessageType, id: string, data: any): any {

        let result = this.generateHeader(type, id);

        switch (type) {
            case SerialMessageType.REGISTRATION_SYNC:
                result += this.generateRegistrationSync(data);
                break;
            case SerialMessageType.DEPLOY_CONFIG:
                result += this.generateDeployConfig(data);
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
            case SerialMessageType.PANIC_STOP:
                result += this.generatePanicStop(data);
                break;
            case SerialMessageType.FORMAT_SD:
                result += this.generateFormatSD(data);
                break;
            default:
                logger.error(`Unknown message type: ${type}`);
                return "\n";
        }

        logger.debug('3');
        return `${result}${MessageHelper.MessageEOL}`;
    }

    generateHeader(type: SerialMessageType, id: string): string {
        return `${type}${this.RS}${MessageHelper.ValidationMap.get(type)}${this.RS}${id}`;
    }

    generateDeployConfig(data: any) {
        const sync = data as ConfigSync;
        const result = [this.GS];


        for (const config of sync.configs) {
            if (!config) {
                continue;
            }

            logger.debug(`Generating deploy config message: ${JSON.stringify(config)}`);

            const servoConfigs = [];

            for (const ch of config.servoChannels) {
                servoConfigs.push(ch.id);
                servoConfigs.push(":");
                servoConfigs.push(ch.set);
                servoConfigs.push(":");
                servoConfigs.push(ch.minPos);
                servoConfigs.push(":");
                servoConfigs.push(ch.maxPos);
                servoConfigs.push(":");
                servoConfigs.push(ch.inverted);
                servoConfigs.push("|");
            }

            if (servoConfigs.length > 0) {
                servoConfigs.pop();
            }

            result.push(config.address);
            result.push(this.US);
            result.push(config.name);
            result.push(this.US);
            result.push(config.servoChannels.length.toString());
            result.push(this.US);
            result.push(servoConfigs.join(""));
            result.push(this.RS);
        }

        if (result.length > 0) {
            result.pop();
        }

        const msg = result.join("");
        return msg;
    }

    generateDeployScript(data: any) {

        const upload = data as ScriptUpload;

        const result = [this.GS];

        for (const config of upload.configs) {
            if (!config) {
                continue;
            }

            logger.debug(`Generating deploy script message: ${JSON.stringify(config)}`);

            result.push(config.address);
            result.push(this.US);
            result.push(config.name);
            result.push(this.US);
            result.push(upload.scriptId);
            result.push(this.US);
            result.push(config.script);
            result.push(this.RS);
        }

        if (result.length > 0) {
            result.pop();
        }

        const msg = result.join("");
        return msg;
    }

    generateRunScript(data: any) {
        const runCommand = data as ScriptRun;

        const result = [this.GS];

        for (const config of runCommand.configs) {
            if (!config) {
                continue;
            }

            logger.debug(`Generating run script message: ${JSON.stringify(config)}`);

            result.push(config.address);
            result.push(this.US);
            result.push(config.name);
            result.push(this.US);
            result.push(runCommand.scriptId);
            result.push(this.RS);
        }

        if (result.length > 0) {
            result.pop();
        }

        const msg = result.join("");

        return msg;
    }


    generatePanicStop(data: any) {
        const runCommand = data as ScriptRun;

        const result = [this.GS];

        for (const config of runCommand.configs) {
            if (!config) {
                continue;
            }

            logger.debug(`Generating panic stop message: ${JSON.stringify(config)}`);

            result.push(config.address);
            result.push(this.US);
            result.push(config.name);
            result.push(this.US);
            result.push("PANIC");
            result.push(this.RS);
        }

        if (result.length > 0) {
            result.pop();
        }

        const msg = result.join("");

        return msg;
    }

    generateRunCommand(data: any) {

        return "";
    }

    generateRegistrationSync(data: any) {
        return "";
    }

    generateFormatSD(data: any) {
        const controllers = data as Array<any>;

        const result = [this.GS];

        for (const controller of controllers) {
            result.push(controller.address);
            result.push(this.US);
            result.push(controller.name);
            result.push(this.US);
            result.push("FORMAT");
            result.push(this.RS);
        }

        if (result.length > 0) {
            result.pop();
        }

        const msg = result.join("");

        return msg;
    }
}
