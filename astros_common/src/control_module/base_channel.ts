import { ModuleSubType, ModuleType } from "../astros_enums";
import { GpioChannel } from "./gpio/gpio_channel";
import { I2cChannel } from "./i2c/i2c_channel";
import { PwmChannel } from "./pca9685/pwm_channel";
import { KangarooX2Channel } from "./uart/sub_modules/kangarooX2/kangaroo_x2_channel";
import { MaestroChannel } from "./uart/sub_modules/maestro/maestro_channel";
import { UartChannel } from "./uart/uart_channel";

export type ModuleChannelType =
  | BaseChannel
  | GpioChannel
  | I2cChannel
  | PwmChannel
  | UartChannel
  | KangarooX2Channel
  | MaestroChannel;

export class BaseChannel {
  id: string;
  parentId: string;
  channelName: string;
  enabled: boolean;

  moduleType: ModuleType;
  moduleSubType: ModuleSubType;
  
  constructor(
    id: string,
    parentId: string,
    channelName: string,
    moduleType: ModuleType,
    moduleSubType: ModuleSubType,
    enabled: boolean,
  ) {
    if (channelName === null) {
      this.channelName = "unnamed";
    } else {
      this.channelName = channelName;
    }
    this.id = id;
    this.parentId = parentId;
    this.moduleType = moduleType;
    this.moduleSubType = moduleSubType;
    this.enabled = enabled;
  }
}
