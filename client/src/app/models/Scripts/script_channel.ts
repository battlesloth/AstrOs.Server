import { ChannelType, ControllerType } from "../control_module/control_module";
import { ScriptEvent } from "./script_event";

export class ScriptChannel {
    id: string;
    controllerType: ControllerType;
    controllerName: string;
    type: ChannelType;
    channel: any;
    channelNumber: number;
    maxDuration: number
    events: Map<number, ScriptEvent>

    constructor(id: string, controllerType: ControllerType, controllerName: string,
        type: ChannelType, channelNumber: number, channel: any, maxDuration: number){
        this.id = id;
        this.controllerType = controllerType;
        this.controllerName = controllerName;
        this.type = type;
        this.channelNumber = channelNumber;
        this.channel = channel;
        this.maxDuration = maxDuration;

        this.events = new Map<number, ScriptEvent>();
    }
}