export class ServoChannel {
    id: number;
    channelName: string;
    enabled: boolean;
    minPos: number;
    maxPos: number;

    constructor(id: number, channelName: string, enabled: boolean, minPos: number, maxPos: number) {
        this.channelName = channelName;
        this.id = id;
        this.enabled = enabled;
        this.minPos = minPos;
        this.maxPos = maxPos;
    }
}
