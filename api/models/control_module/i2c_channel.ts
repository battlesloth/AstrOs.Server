

export class I2cChannel {
    id: number;
    channelName: string;

    constructor(id: number, channelName: string) {
        if (name === null) {
            this.channelName = "unnamed";
        } else {
            this.channelName = channelName;
        }
        this.id = id;
    }
}
