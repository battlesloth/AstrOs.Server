import { ControllerType } from "src/models/control_module/control_module";
import { ScriptEvent } from "src/models/scripts/script_event";

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
    maxDuration: number
    events: ScriptEvent[]

    constructor(id: string, controllerType: ControllerType, controllerName: string,
        type: ScriptChannelType, channel: any, maxDuration: number){
        this.id = id;
        this.controllerType = controllerType;
        this.controllerName = controllerName;
        this.type = type;
        this.channel = channel;
        this.maxDuration = maxDuration;

        this.events = new Array<ScriptEvent>();
    }
}