import { SerialMessageType } from "./serial_message";

export class SerialMessageTracker {
    id: string;
    type: SerialMessageType;

    constructor(id: string, type: SerialMessageType) {
        this.id = id;
        this.type = type;
    }
}