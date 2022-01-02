import { ControllerType } from "../control_module/control_module";
import { ScriptEvent } from "./script_event";

export enum ScriptChannelType{
    None,
    Uart,
    Pwm,
    I2c,
    Sound
}

export class ScriptChannel {
    id: string;
    controllerType: ControllerType;
    controllerName: string;
    type: ScriptChannelType;
    channel: any;
    channelNumber: number;
    maxDuration: number
    events: ScriptEvent[]

    constructor(id: string, controllerType: ControllerType, controllerName: string,
        type: ScriptChannelType, channelNumber: number, channel: any, maxDuration: number){
        this.id = id;
        this.controllerType = controllerType;
        this.controllerName = controllerName;
        this.type = type;
        this.channelNumber = channelNumber;
        this.channel = channel;
        this.maxDuration = maxDuration;

        this.events = new Array<ScriptEvent>();
    }
}