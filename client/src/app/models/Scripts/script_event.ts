import { ChannelType } from "../control_module/control_module";

export class ScriptEvent {

    scriptChannel: string;
    channelType: ChannelType;
    time: number;
    dataJson: string;

    constructor(scriptChannel: string, channelType: ChannelType, time: number, dataJson: string) {
        this.scriptChannel = scriptChannel;
        this.channelType = channelType;
        this.time = time;
        this.dataJson = dataJson;
    }
}
