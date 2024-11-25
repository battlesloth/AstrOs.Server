import { MessageGenerator } from "../src/serial/message_generator";
import { MessageHelper } from "../src/serial/message_helper";
import { SerialMessageType } from "../src/serial/serial_message";
import { ConfigSync } from "../src/models/config/config_sync";
import { ControlModule, ControllerLocation, ServoChannel } from "astros-common";


function addServoChannels(location: ControllerLocation) {
    for (let i = 0; i < 32; i++) {
        location.servoModule.channels.push(new ServoChannel(i, "", true, 0, 0, false));
    }
}

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

    it("generate Deploy Config", () => {

        const generator = new MessageGenerator();

        const bodyLocation = new ControllerLocation(0, "body", "", "");
        bodyLocation.controller = new ControlModule(1, "controller1", "ABCD");
        addServoChannels(bodyLocation);
        bodyLocation.servoModule.channels[0].minPos = 50;

        const domeLocation = new ControllerLocation(1, "dome", "", "");
        domeLocation.controller = new ControlModule(2, "controller2", "WXYZ");
        addServoChannels(domeLocation);
        domeLocation.servoModule.channels[31].maxPos = 100;

        const locations = new Array<ControllerLocation>(bodyLocation, domeLocation);

        const configSync = new ConfigSync(locations);
        const message = generator.generateMessage(SerialMessageType.DEPLOY_CONFIG, "123", configSync);

        const groups = message.msg.split(GS);

        expect(message.controllers.length).toBe(2);

        expect(groups.length).toBe(2);
        expect(groups[0]).toBe(`5${RS}DEPLOY_CONFIG${RS}123`);

        const controllers = groups[1].split(RS);
        expect(controllers.length).toBe(2);

        const config1 = controllers[0].split(US);
        expect(config1.length).toBe(4);
        expect(config1[0]).toBe("ABCD");
        expect(config1[1]).toBe("controller1");
        expect(config1[2]).toBe("32");

        const servos1 = config1[3].split("|");
        expect(servos1.length).toBe(32);

        const servo_1_0 = servos1[0].split(":");
        expect(servo_1_0.length).toBe(5);
        expect(servo_1_0[0]).toBe("0");
        expect(servo_1_0[2]).toBe("50");

        const config2 = controllers[1].split(US);
        expect(config2.length).toBe(4);
        expect(config2[0]).toBe("WXYZ");
        expect(config2[1]).toBe("controller2");
        expect(config2[2]).toBe("32");

        const servos2 = config2[3].split("|");
        expect(servos2.length).toBe(32);

        const servo_2_31 = servos2[31].split(":");
        expect(servo_2_31.length).toBe(5);
        expect(servo_2_31[0]).toBe("31");
        expect(servo_2_31[3]).toBe("100");

    });

});