import { ControllerType } from "./control-module";

export enum ScriptChannelType{
    None,
    Uart,
    Pwm,
    I2c,
    Sound
}


export class ScriptEvent {

    time: number

    constructor(time: number) {
        this.time = time;
    }
}

export class ScriptChannel {
    id: string;
    controllerType: ControllerType;
    controllerName: string;
    type: ScriptChannelType;
    channel: any;
    maxDuration: number
    events: Array<ScriptEvent>

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