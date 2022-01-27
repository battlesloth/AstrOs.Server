import { Guid } from "guid-typescript";

export interface SocketCallback {
    (args: any) : void
}

export class SocketSubscription {

    id: Guid;
    message: string;
    callback: SocketCallback;


    constructor(id: Guid, message: string, callback: SocketCallback) {
        this.id = id;
        this.message = message;
        this.callback = callback;
    }
}