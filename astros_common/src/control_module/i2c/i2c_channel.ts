import { BaseChannel } from "../base_channel";

export class I2cChannel extends BaseChannel {

    constructor(id: number, channelName: string, enabled: boolean) {
        super(id, channelName, enabled);
    }
}
