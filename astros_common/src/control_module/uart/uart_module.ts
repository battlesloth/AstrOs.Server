import { UartChannel } from "./uart_channel";

export class UartModule {
    channels: UartChannel[];

    constructor() {
        this.channels = new Array<UartChannel>();
    }
}
