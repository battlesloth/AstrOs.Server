import { I2cModule } from "./I2cModule";
import { PwmModule } from "./PwmModule";
import { UartModule } from "./UartModule";

export enum ControllerType{
    none,
    core,
    dome,
    body,
    audio
}


export enum ChannelType{
    none,
    uart,
    i2c,
    pwm
}

export enum UartType{
    none,
    kangaroo
}

export enum PwmType{
    unassigned,
    continuous_servo,
    positional_servo,
    linear_servo,
    led,
    high_low
}

export class ControlModule{
    id: ControllerType;

    name: string;
    ipAddress!: string;

    uartModule: UartModule;
    pwmModule: PwmModule;
    i2cModule: I2cModule;

    constructor(id: ControllerType, name: string){
        this.id = id;
        this.name = name;
        this.uartModule = new UartModule();
        this.pwmModule = new PwmModule();
        this.i2cModule = new I2cModule();
    }
}



