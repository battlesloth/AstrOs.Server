import { ControlModule } from "./control_module";
import { GpioModule } from "./gpio/gpio_module";
import { I2cModule } from "./i2c/i2c_module";
import { UartModule } from "./uart/uart_module";

export class ControllerLocation {
  id: string;
  locationName: string;
  description: string;
  configFingerprint: string;

  controller: ControlModule;

  gpioModule: GpioModule;
  i2cModules: I2cModule[];

  uartModules: UartModule[];

  constructor(
    id: string,
    locationName: string,
    description: string,
    configFingerprint: string,
  ) {
    this.id = id;
    this.locationName = locationName;
    this.description = description;
    this.configFingerprint = configFingerprint;

    this.controller = new ControlModule(0, "", "");

    this.gpioModule = new GpioModule(id);

    this.i2cModules = new Array<I2cModule>();
    this.uartModules = new Array<UartModule>();
  }
}
