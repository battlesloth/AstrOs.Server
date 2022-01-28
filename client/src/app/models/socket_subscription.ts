import { Guid } from "guid-typescript";

export interface SocketCallback {
    (args: any) : void
}

export class SocketSubscription {

    id: Guid;
    message: string;

    constructor(id: Guid, message: string) {
        this.id = id;
        this.message = message;
    }
}