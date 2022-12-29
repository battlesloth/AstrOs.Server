export class I2cEvent {

    channelId: number
    message: string;

    constructor(channelId: number, message: string) {
        this.channelId = channelId;
        this.message = message;
    }
}