import { ControlModule } from "astros-common"

export enum SerialWorkerResponseType {
    UNKNOWN,
    TIMEOUT,
    POLL,
    REGISTRATION_SYNC,
    CONFIG_SYNC,
    SCRIPT_DEPLOY,
    SCRIPT_RUN,
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

export class ConfigSyncResponse implements ISerialWorkerResponse {
    [x: string]: any;
    type: SerialWorkerResponseType;
    success: boolean;
    controller!: ControlModule;

    constructor(success: boolean) {
        this.type = SerialWorkerResponseType.CONFIG_SYNC;
        this.success = success;
    }
}

export class ScriptDeployResponse implements ISerialWorkerResponse {
    [x: string]: any;
    type: SerialWorkerResponseType;
    success: boolean;
    scriptId: string;
    controller!: ControlModule;

    constructor(success: boolean, scriptId: string) {
        this.type = SerialWorkerResponseType.SCRIPT_DEPLOY;
        this.success = success;
        this.scriptId = scriptId;
    }
}

export class ScriptRunResponse implements ISerialWorkerResponse {
    [x: string]: any;
    type: SerialWorkerResponseType;
    success: boolean;
    scriptId: string;
    controller!: ControlModule;

    constructor(success: boolean, scriptId: string) {
        this.type = SerialWorkerResponseType.SCRIPT_RUN;
        this.success = success;
        this.scriptId = scriptId;
    }
}