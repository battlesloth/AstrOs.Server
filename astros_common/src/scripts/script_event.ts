import { ChannelSubType, ChannelType } from "../astros_enums";

export class ScriptEvent {

    scriptChannel: string;
    channelType: ChannelType;
    subType: ChannelSubType;
    time: number;
    dataJson: string;

    constructor(scriptChannel: string, channelType: ChannelType, subType: ChannelSubType, time: number, dataJson: string) {
        this.scriptChannel = scriptChannel;
        this.channelType = channelType;
        this.subType = subType;
        this.time = time;
        this.dataJson = dataJson;
    }
}
