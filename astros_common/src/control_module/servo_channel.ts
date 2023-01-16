export class ServoChannel {
    id: number;
    channelName: string;
    enabled: boolean;
    minPos: number;
    maxPos: number;
    inverted: boolean

    constructor(id: number, channelName: string, enabled: boolean, minPos: number, maxPos: number, inverted: boolean) {
        this.channelName = channelName;
        this.id = id;
        this.enabled = enabled;
        this.minPos = minPos;
        this.maxPos = maxPos;
        this.inverted = inverted;
    }
}
