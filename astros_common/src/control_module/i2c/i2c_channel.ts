import { ModuleSubType, ModuleType } from "../../astros_enums";
import { BaseChannel } from "../base_channel";

export class I2cChannel extends BaseChannel {
  constructor(
    id: string,
    parentId: string, 
    channelName: string,  
    enabled: boolean,
  ) {
    super(
      id,
      parentId,
      channelName,
      ModuleType.i2c,
      ModuleSubType.genericI2C, 
      enabled);
  }
}
