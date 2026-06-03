import { ModuleSubType, ModuleType } from 'src/models/enums.js';
import { GpioChannel } from './gpio/gpio_channel.js';
import { I2cChannel } from './i2c/i2c_channel.js';
import { PwmChannel } from './i2c/sub_modules/pca9685/pwm_channel.js';
import { KangarooX2Channel } from './uart/sub_modules/kangarooX2/kangaroo_x2_channel.js';
import { MaestroChannel } from './uart/sub_modules/maestro/maestro_channel.js';
import { UartChannel } from './uart/uart_channel.js';

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
      this.channelName = 'unnamed';
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
