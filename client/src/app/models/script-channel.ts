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
    controllerId: ControllerType;
    controllerName: string;
    type: ScriptChannelType;
    channelNumber: number;
    maxDuration: number
    
    constructor(id: number, controllerId: ControllerType, controllerName: string,
        type: ScriptChannelType, channelNumber: number, maxDuration: number){
        this.id = id;
        this.controllerId = controllerId;
        this.controllerName = controllerName;
        this.type = type;
        this.channelNumber = channelNumber
        this.maxDuration = maxDuration;
    }
}