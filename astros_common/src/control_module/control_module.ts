import { I2cModule } from "./i2c_module";
import { ServoModule } from "./servo_module";
import { UartModule } from "./uart_module";


export class ControlModule{
    id: number;
    location: string;
    name: string;
    description: string;
    address: string;
    fingerprint: string;

    uartModule: UartModule;
    servoModule: ServoModule;
    i2cModule: I2cModule;

    constructor(id: number, location: string, name: string, description: string, address: string, fingerprint: string){
        this.id = id;
        this.location = location;
        this.name = name;
        this.description = description;
        this.address = address;
        this.fingerprint = fingerprint;
        this.uartModule = new UartModule();
        this.servoModule = new ServoModule();
        this.i2cModule = new I2cModule();
    }
}



