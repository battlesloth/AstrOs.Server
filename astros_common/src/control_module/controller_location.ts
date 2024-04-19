import { ControlModule } from "./control_module";
import { GpioModule } from "./gpio/gpio_module";
import { I2cModule } from "./i2c/i2c_module";
import { ServoModule } from "./servo/servo_module";
import { UartModule } from "./uart/uart_module";

export class ControllerLocation {
    id: number;
    locationName: string;
    description: string;
    configFingerprint: string;

    controller: ControlModule;

    uartModule: UartModule;
    servoModule: ServoModule;
    i2cModule: I2cModule;
    gpioModule: GpioModule;

    constructor(id: number, locationName: string, description: string,
        configFingerprint: string) {
        this.id = id;
        this.locationName = locationName;
        this.description = description;
        this.configFingerprint = configFingerprint;

        this.controller = new ControlModule(0, "", "");
        this.uartModule = new UartModule();
        this.servoModule = new ServoModule();
        this.i2cModule = new I2cModule();
        this.gpioModule = new GpioModule();
    }
}