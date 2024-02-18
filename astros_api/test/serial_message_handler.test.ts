import { MessageHandler } from "src/serial/message_handler";
import { MessageHelper } from "src/serial/message_helper";
import { SerialMessageType } from "src/serial/serial_message";
import { SerialWorkerResponseType } from "src/serial/serial_worker_response";

const RS = MessageHelper.RS;
const GS = MessageHelper.GS;
const US = MessageHelper.US;

function createMessage(type: SerialMessageType, id: string, payload: string): string {

    const valString = MessageHelper.ValidationMap.get(type);

    return `${type}${RS}${valString}${RS}${id}${GS}${payload}`;
}


describe("Serial Message Handler Tests", () => {

    it("validateMessage should return true for valid message", () => {

        const messageHandler = new MessageHandler();

        const message = createMessage(SerialMessageType.REGISTRATION_SYNC, "123", "payload");

        const result = messageHandler.validateMessage(message);

        expect(result.valid).toBe(true);
        expect(result.type).toBe(SerialMessageType.REGISTRATION_SYNC);
        expect(result.id).toBe("123");
        expect(result.data).toBe("payload");
    });

    it("validateMessage should return false for invalid message", () => {

        const messageHandler = new MessageHandler();

        const message = "invalid message";

        const result = messageHandler.validateMessage(message);

        expect(result.valid).toBe(false);
        expect(result.type).toBe(SerialMessageType.UNKNOWN);
    });

    it("validateMessage should return false for invalid header", () => {

        const messageHandler = new MessageHandler();

        const message = "invalid header" + GS + "payload";

        const result = messageHandler.validateMessage(message);

        expect(result.valid).toBe(false);
        expect(result.type).toBe(SerialMessageType.UNKNOWN);
    });

    it("validateMessage should return false for invalid type", () => {

        const messageHandler = new MessageHandler();

        const message = "invalid" + RS + "invalid" + RS + "123" + GS + "payload";

        const result = messageHandler.validateMessage(message);

        expect(result.valid).toBe(false);
        expect(result.type).toBe(SerialMessageType.UNKNOWN);
    });

    it("handlePollAck should return valid response", () => {

        const messageHandler = new MessageHandler();

        const message = createMessage(SerialMessageType.POLL_ACK, "123", "mac" + US + "name" + US + "fingerprint");

        const validation = messageHandler.validateMessage(message);

        const response = messageHandler.handlePollAck(validation.data);

        expect(response.type).toBe(SerialWorkerResponseType.UPDATE_CLIENTS);
        expect(response.controller.name).toBe("name");
        expect(response.controller.address).toBe("mac");
        expect(response.controller.fingerprint).toBe("fingerprint");
    });

    it("handlePollAck should return valid response with invalid data", () => {

        const messageHandler = new MessageHandler();

        const message = createMessage(SerialMessageType.POLL_ACK, "123", "mac" + US + "name");

        const validation = messageHandler.validateMessage(message);

        const response = messageHandler.handlePollAck(validation.data);

        expect(response.type).toBe(SerialWorkerResponseType.UNKNOWN);
    });

    it("handleRegistraionSyncAck should return valid response", () => {

        const messageHandler = new MessageHandler();

        const message = createMessage(SerialMessageType.REGISTRATION_SYNC_ACK, "123", "mac1" + US + "name1" + RS + "mac2" + US + "name2");

        const validation = messageHandler.validateMessage(message);

        const response = messageHandler.handleRegistraionSyncAck(validation.data);

        expect(response.type).toBe(SerialWorkerResponseType.REGISTRATION_SYNC);
        expect(response.registrations.length).toBe(2);
        expect(response.registrations[0].name).toBe("name1");
        expect(response.registrations[0].address).toBe("mac1");
        expect(response.registrations[1].name).toBe("name2");
        expect(response.registrations[1].address).toBe("mac2");
    });

    it("handleRegistraionSyncAck should return valid response with invalid records", () => {

        const messageHandler = new MessageHandler();

        const message = createMessage(SerialMessageType.REGISTRATION_SYNC_ACK, "123", "mac1" + US + "name1" + RS + "name2");

        const validation = messageHandler.validateMessage(message);

        const response = messageHandler.handleRegistraionSyncAck(validation.data);

        expect(response.type).toBe(SerialWorkerResponseType.REGISTRATION_SYNC);
        expect(response.registrations.length).toBe(1);
        expect(response.registrations[0].name).toBe("name1");
        expect(response.registrations[0].address).toBe("mac1");
    });

});