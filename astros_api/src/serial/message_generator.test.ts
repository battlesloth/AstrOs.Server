import { expect, describe, it } from "vitest";
import { MessageGenerator } from './message_generator.js';
import { MessageHelper } from './message_helper.js';
import { SerialMessageType } from './serial_message.js';
import { ConfigSync } from '../models/config/config_sync.js';
import { ControlModule, ControllerLocation } from "astros-common";



const RS = MessageHelper.RS;
const GS = MessageHelper.GS;
const US = MessageHelper.US;

describe("Message Generator Tests", () => {

    it("generate Registraion sync", () => {

        const generator = new MessageGenerator();

        const message = generator.generateMessage(SerialMessageType.REGISTRATION_SYNC, "123", "payload");

        expect(message.controllers.length).toBe(1);
        expect(message.controllers[0]).toBe("00:00:00:00:00:00");
        expect(message.msg).toBe(`1${RS}REGISTRATION_SYNC${RS}123\n`);
    });
});