import { ControlModule } from "astros-common"

export enum SerialWorkerResponseType {
    UNKNOWN,
    TIMEOUT,
    POLL,
    REGISTRATION_SYNC,
    SEND_SERIAL_MESSAGE,
    UPDATE_CLIENTS
}

export interface ISerialWorkerResponse extends Record<string, any> {
    type: SerialWorkerResponseType
}

export class PollRepsonse implements ISerialWorkerResponse {
    [x: string]: any
    type: SerialWorkerResponseType

    controller!: ControlModule;

    constructor() {
        this.type = SerialWorkerResponseType.UPDATE_CLIENTS;
    }
}

export class RegistrationResponse implements ISerialWorkerResponse {
    [x: string]: any
    type: SerialWorkerResponseType

    registrations: Array<ControlModule>;

    constructor() {
        this.type = SerialWorkerResponseType.REGISTRATION_SYNC;
        this.registrations = [];
    }
}