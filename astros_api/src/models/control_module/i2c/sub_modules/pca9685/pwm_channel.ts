import { ModuleSubType, ModuleType } from 'src/models/enums.js';
import { BaseChannel } from 'src/models/control_module/base_channel.js';

export class PwmChannel extends BaseChannel {
  channelId: number;
  minPos: number;
  maxPos: number;
  homePos: number;
  inverted: boolean;

  constructor(
    id: string,
    parentId: string,
    channelName: string,
    enabled: boolean,
    channelId: number,
    minPos: number,
    maxPos: number,
    homePos: number,
    inverted: boolean,
  ) {
    super(id, parentId, channelName, ModuleType.i2c, ModuleSubType.pwmBoard, enabled);
    this.channelId = channelId;
    this.minPos = minPos;
    this.maxPos = maxPos;
    this.homePos = homePos;
    this.inverted = inverted;
  }
}
