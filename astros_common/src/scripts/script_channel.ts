import { ChannelSubType, ChannelType, ControllerType } from "../astros_enums";
import { ScriptEvent } from "./script_event";

export class ScriptChannel {
    id: string;
    controllerType: ControllerType;
    controllerName: string;
    type: ChannelType;
    subType: ChannelSubType;
    channel: any;
    channelNumber: number;
    maxDuration: number;
    events: Map<number, ScriptEvent>;
    eventsKvpArray: Array<any>;

    constructor(id: string, controllerType: ControllerType, controllerName: string,
        type: ChannelType, subType: ChannelSubType, channelNumber: number, channel: any, maxDuration: number){
        this.id = id;
        this.controllerType = controllerType;
        this.controllerName = controllerName;
        this.type = type;
        this.subType = subType;
        this.channelNumber = channelNumber;
        this.channel = channel;
        this.maxDuration = maxDuration;

        this.events = new Map<number, ScriptEvent>();
        this.eventsKvpArray = new Array<any>();
    }
}