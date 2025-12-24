import type { BaseChannel } from "./baseChannel";
import type { GpioChannel } from "./modules/gpio/gpioChannel";
import type { I2cChannel } from "./modules/i2c/i2cChannel";
import type { PwmChannel } from "./modules/i2c/subModules/pca9685/pwmChannel";
import type { KangarooChannel } from "./modules/uart/subModules/kangarooX2/kangarooChannel";
import type { MaestroChannel } from "./modules/uart/subModules/maestro/maestroChannel";
import type { UartChannel } from "./modules/uart/uartChannel";

export type ModuleChannelType =
  | BaseChannel
  | GpioChannel
  | I2cChannel
  | PwmChannel
  | UartChannel
  | KangarooChannel
  | MaestroChannel;
