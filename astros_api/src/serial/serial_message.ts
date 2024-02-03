
export enum SerialMessageType {
    error,
    heartbeat,
    sync,
    syncAck,
    scriptRun,
    scriptRunAck,
    scriptRunNak
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