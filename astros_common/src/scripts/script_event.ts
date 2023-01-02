import { ChannelSubType, ChannelType } from "../astros_enums";

export class ScriptEvent {

    scriptChannel: string;
    channelType: ChannelType;
    channelSubType: ChannelSubType;
    time: number;
    dataJson: string;

    constructor(scriptChannel: string, channelType: ChannelType, channleSubType: ChannelSubType, time: number, dataJson: string) {
        this.scriptChannel = scriptChannel;
        this.channelType = channelType;
        this.channelSubType = channleSubType;
        this.time = time;
        this.dataJson = dataJson;
    }
}
