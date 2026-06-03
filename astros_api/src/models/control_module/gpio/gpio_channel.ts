import { ModuleSubType, ModuleType } from 'src/models/enums.js';
import { BaseChannel } from 'src/models/control_module/base_channel.js';

export class GpioChannel extends BaseChannel {
  channelNumber: number;
  defaultHigh: boolean;

  constructor(
    id: string,
    parentId: string,
    channelNumber: number,
    enabled: boolean,
    channelName: string,
    defaultHigh: boolean,
  ) {
    super(id, parentId, channelName, ModuleType.gpio, ModuleSubType.genericGpio, enabled);
    this.channelNumber = channelNumber;
    this.defaultHigh = defaultHigh;
  }
}
