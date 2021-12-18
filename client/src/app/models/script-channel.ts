import { ControllerType } from "./control-module";

export enum ScriptChannelType{
    None,
    Uart,
    Pwm,
    I2c,
    Sound
}


export class ScriptChannel {
    id: number;
    controllerType: ControllerType;
    controllerName: string;
    type: ScriptChannelType;
    channel: any;
    maxDuration: number
    
    constructor(id: number, controllerType: ControllerType, controllerName: string,
        type: ScriptChannelType, channel: any, maxDuration: number){
        this.id = id;
        this.controllerType = controllerType;
        this.controllerName = controllerName;
        this.type = type;
        this.channel = channel;
        this.maxDuration = maxDuration;
    }
}