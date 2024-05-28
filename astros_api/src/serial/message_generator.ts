
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

    generateMessage(type: SerialMessageType, id: string, data: any): MessageGeneratorResponse {

        const header = this.generateHeader(type, id);
        let result: MessageGeneratorResponse;

        switch (type) {
            case SerialMessageType.REGISTRATION_SYNC:
                result = this.generateRegistrationSync(header);
                break;
            case SerialMessageType.DEPLOY_CONFIG:
                result = this.generateDeployConfig(header, data);
                break;
            case SerialMessageType.DEPLOY_SCRIPT:
                result = this.generateDeployScript(header, data);
                break;
            case SerialMessageType.RUN_SCRIPT:
                result = this.generateRunScript(header, data);
                break;
            case SerialMessageType.RUN_COMMAND:
                result = this.generateRunCommand(header, data);
                break;
            case SerialMessageType.PANIC_STOP:
                result = this.generatePanicStop(header, data);
                break;
            case SerialMessageType.FORMAT_SD:
                result = this.generateFormatSD(header, data);
                break;
            default:
                logger.error(`Unknown message type: ${type}`);
                return new MessageGeneratorResponse("\n", []);
        }

        return result;
    }

    generateHeader(type: SerialMessageType, id: string): string {
        return `${type}${this.RS}${MessageHelper.ValidationMap.get(type)}${this.RS}${id}`;
    }

    generateDeployConfig(header: string, data: any) {
        const sync = data as ConfigSync;
        const result = [this.GS];

        const controllers = [];

        for (const config of sync.configs) {
            if (!config.address) {
                continue;
            }

            controllers.push(config.address);

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

        return new MessageGeneratorResponse(`${header}${msg}${MessageHelper.MessageEOL}`, controllers);
    }

    generateDeployScript(header: string, data: any) {

        const upload = data as ScriptUpload;

        const result = [this.GS];

        const controllers = [];

        for (const config of upload.configs) {
            if (!config?.address) {
                continue;
            }

            controllers.push(config.address);

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

        return new MessageGeneratorResponse(`${header}${msg}${MessageHelper.MessageEOL}`, controllers, upload.scriptId);
    }

    generateRunScript(header: string, data: any) {
        const runCommand = data as ScriptRun;

        const result = [this.GS];

        const controllers = [];

        for (const config of runCommand.configs) {
            if (!config?.address) {
                continue;
            }

            controllers.push(config.address);

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

        return new MessageGeneratorResponse(`${header}${msg}${MessageHelper.MessageEOL}`, controllers, runCommand.scriptId);
    }


    generatePanicStop(header: string, data: any) {
        const runCommand = data as ScriptRun;

        const result = [this.GS];
        const controllers = [];

        for (const config of runCommand.configs) {
            if (!config?.address) {
                continue;
            }

            controllers.push(config.address);

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

        return new MessageGeneratorResponse(`${header}${msg}${MessageHelper.MessageEOL}`, controllers);
    }

    generateRunCommand(header: string, data: any) {

        if (!data.contoller.address) {
            return new MessageGeneratorResponse(`${header}${MessageHelper.MessageEOL}`, []);
        }

        const result = [this.GS];

        result.push(data.controller.address);
        result.push(this.US);
        result.push(data.controller.name);
        result.push(this.US);
        result.push(data.command);

        return new MessageGeneratorResponse(`${header}${MessageHelper.MessageEOL}`, [data.contoller.address]);
    }

    generateRegistrationSync(header: string) {
        return new MessageGeneratorResponse(`${header}${MessageHelper.MessageEOL}`, ["00:00:00:00:00:00"]);
    }

    generateFormatSD(header: string, data: any) {
        const controllers = data as Array<any>;

        const result = [this.GS];

        const ctrls = [];

        for (const controller of controllers) {

            if (!controller.address) {
                continue;
            }

            ctrls.push(controller.address);

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

        return new MessageGeneratorResponse(`${header}${msg}${MessageHelper.MessageEOL}`, controllers);
    }
}

export class MessageGeneratorResponse {
    msg: string;
    controllers: string[];
    metaData: any;

    constructor(msg: string, controllers: string[], metaData: any = "") {
        this.msg = msg;
        this.controllers = controllers;
        this.metaData = metaData;
    }
}