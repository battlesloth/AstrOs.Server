import { I2cModule } from "./i2c_module";
import { PwmModule } from "./pwm_module";
import { UartModule } from "./uart_module";

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
    pwm,
    audio
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



