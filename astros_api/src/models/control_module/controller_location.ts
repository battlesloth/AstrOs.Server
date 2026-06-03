import { ControlModule } from './control_module.js';
import { GpioModule } from './gpio/gpio_module.js';
import { I2cModule } from './i2c/i2c_module.js';
import { UartModule } from './uart/uart_module.js';

export interface ControllerLocation {
  id: string;
  locationName: string;
  description: string;
  configFingerprint: string;
  controller: ControlModule;
  gpioModule: GpioModule;
  i2cModules: I2cModule[];
  uartModules: UartModule[];
}

export function createControllerLocation(
  id: string,
  locationName: string,
  description: string,
  configFingerprint: string,
): ControllerLocation {
  return {
    id,
    locationName,
    description,
    configFingerprint,
    controller: { id: '', name: '', address: '' },
    gpioModule: new GpioModule(id),
    i2cModules: [],
    uartModules: [],
  };
}
