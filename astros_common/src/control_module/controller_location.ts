import { ControlModule } from "./control_module";
import { GpioModule } from "./gpio/gpio_module";
import { I2cModule } from "./i2c/i2c_module";
import { PwmModule } from "./pca9685/pwm_module";
import { UartModule } from "./uart/uart_module";

export class ControllerLocation {
  id: number;
  locationName: string;
  description: string;
  configFingerprint: string;

  controller: ControlModule;

  gpioModule: GpioModule;
  i2cModule: I2cModule;

  uartModules: UartModule[];
  pwmModules: PwmModule[];

  constructor(
    id: number,
    locationName: string,
    description: string,
    configFingerprint: string,
  ) {
    this.id = id;
    this.locationName = locationName;
    this.description = description;
    this.configFingerprint = configFingerprint;

    this.controller = new ControlModule(0, "", "");

    this.i2cModule = new I2cModule();
    this.gpioModule = new GpioModule();

    this.uartModules = new Array<UartModule>();
    this.pwmModules = new Array<PwmModule>();
  }
}
