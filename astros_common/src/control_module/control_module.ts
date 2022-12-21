import { I2cModule } from "./i2c_module";
import { ServoModule } from "./servo_module";
import { UartModule, UartType } from "./uart_module";

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
    servo,
    audio
}

export class ControlModule{
    id: ControllerType;

    name: string;
    ipAddress!: string;

    uartModule: UartModule;
    servoModule: ServoModule;
    i2cModule: I2cModule;

    constructor(id: ControllerType, name: string){
        this.id = id;
        this.name = name;
        this.uartModule = new UartModule(UartType.none, "unassigned", new Object());
        this.servoModule = new ServoModule();
        this.i2cModule = new I2cModule();
    }
}



