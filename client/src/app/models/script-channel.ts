export enum ScriptChannelType{
    Add,
    Uart,
    Pwm,
    I2c,
    Sound
}


export class ScriptChannel {
    id: number;
    type: ScriptChannelType;
    maxDuration: number;
    
    constructor(id: number, type: ScriptChannelType, maxDuration: number){
        this.id = id;
        this.type = type;
        this.maxDuration = maxDuration;
    }
}