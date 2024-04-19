import { BaseChannel } from "../base_channel";

export class ServoChannel extends BaseChannel {

    minPos: number;
    maxPos: number;
    inverted: boolean

    constructor(id: number, channelName: string, enabled: boolean, minPos: number, maxPos: number, inverted: boolean) {
        super(id, channelName, enabled);

        this.minPos = minPos;
        this.maxPos = maxPos;
        this.inverted = inverted;
    }
}
