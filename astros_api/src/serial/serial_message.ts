export enum SerialWorkerResponseType {
    UNKNOWN,
    TIMEOUT,
    SEND_SERIAL_MESSAGE,
    UPDATE_CLIENTS
}

export enum SerialMessageType {

    // for internal use
    SERIAL_MSG_RECEIVED = -1,

    // needs to match ESP enums
    UNKNOWN,
    REGISTRATION_SYNC, // from web server
    REGISTRATION_SYNC_ACK,
    POLL_ACK,
    POLL_NAK,
    DEPLOY_SCRIPT, // from web server
    DEPLOY_SCRIPT_ACK,
    DEPLOY_SCRIPT_NAK,
    RUN_SCRIPT, // from web server
    RUN_SCRIPT_ACK,
    RUN_SCRIPT_NAK,
    RUN_COMMAND, // from web server
    RUN_COMMAND_ACK,
    RUN_COMMAND_NAK
}

export class SerialMsgConst {
    static readonly REGISTRATION_SYNC = "REGISTRATION_SYNC";
    static readonly REGISTRATION_SYNC_ACK = "REGISTRATION_SYNC_ACK";
    static readonly POLL_ACK = "POLL_ACK";
    static readonly POLL_NAK = "POLL_NAK";
    static readonly DEPLOY_SCRIPT = "DEPLOY_SCRIPT";
    static readonly DEPLOY_SCRIPT_ACK = "DEPLOY_SCRIPT_ACK";
    static readonly DEPLOY_SCRIPT_NAK = "DEPLOY_SCRIPT_NAK";
    static readonly RUN_SCRIPT = "RUN_SCRIPT";
    static readonly RUN_SCRIPT_ACK = "RUN_SCRIPT_ACK";
    static readonly RUN_SCRIPT_NAK = "RUN_SCRIPT_NAK";
    static readonly RUN_COMMAND = "RUN_COMMAND";
    static readonly RUN_COMMAND_ACK = "RUN_COMMAND_ACK";
    static readonly RUN_COMMAND_NAK = "RUN_COMMAND_NAK";
}

export class SerialMsgValidationResult {
    public valid: boolean;
    public type: SerialMessageType;
    public id: string;

    constructor() {
        this.valid = false;
        this.type = SerialMessageType.UNKNOWN;
        this.id = "";
    }
}

export class SerialMessage {
    public type: SerialMessageType;
    public node: string;
    public payload: string;

    constructor(type: SerialMessageType, node: string, payload: string) {
        this.type = type;
        this.node = node;
        this.payload = payload;
    }

    public static fromString(message: string): SerialMessage {
        const parts = message.split('|');
        if (parts.length !== 2) throw new Error(`Invalid message: ${message}`);
        const type = SerialMessageType[parts[0] as keyof typeof SerialMessageType];
        return new SerialMessage(type, parts[1], parts[2]);
    }

    public toString(): string {
        return `${SerialMessageType[this.type]}|${this.node}|${this.payload}`;
    }
}