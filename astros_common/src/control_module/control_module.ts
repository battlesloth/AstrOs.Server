import { ControllerType, UartType } from "../astros_enums";
import { I2cModule } from "./i2c_module";
import { ServoModule } from "./servo_module";
import { UartModule } from "./uart_module";


export class ControlModule{
    id: ControllerType;

    name: string;
    ipAddress!: string;
    fingerprint: string;

    uartModule: UartModule;
    servoModule: ServoModule;
    i2cModule: I2cModule;

    constructor(id: ControllerType, name: string, fingerprint: string){
        this.id = id;
        this.name = name;
        this.fingerprint = fingerprint;
        this.uartModule = new UartModule();
        this.servoModule = new ServoModule();
        this.i2cModule = new I2cModule();
    }
}



