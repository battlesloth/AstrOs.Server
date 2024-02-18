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
        this.type = SerialWorkerResponseType.POLL;
    }
}

export class RegistrationResponse implements ISerialWorkerResponse {
    [x: string]: any;
    type: SerialWorkerResponseType;
    success: boolean;
    registrations: Array<ControlModule>;

    constructor(success: boolean) {
        this.type = SerialWorkerResponseType.REGISTRATION_SYNC;
        this.success = success;
        this.registrations = [];
    }
}