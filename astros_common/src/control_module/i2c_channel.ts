
export class I2cChannel {
    id: number;
    channelName: string;
    enabled: boolean;

    constructor(id: number, channelName: string, enabled: boolean) {
        if (channelName === null) {
            this.channelName = "unnamed";
        } else {
            this.channelName = channelName;
        }
        this.id = id;
        this.enabled = enabled;
    }
}
