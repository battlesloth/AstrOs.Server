import type { ControllerModule } from './modules/controlModule';
import type { GpioModule } from './modules/gpio/gpioModule';
import type { I2cModule } from './modules/i2c/i2cModule';
import type { UartModule } from './modules/uart/uartModule';

export interface ControllerLocation {
  id: string;
  locationName: string;
  description: string;
  configFingerprint: string;

  controller: ControllerModule;

  gpioModule: GpioModule;
  i2cModules: I2cModule[];
  uartModules: UartModule[];
}
