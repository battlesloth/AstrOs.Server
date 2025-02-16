import { ModuleSubType, ModuleType } from "../../astros_enums";
import { BaseChannel } from "../base_channel";

export class I2cChannel extends BaseChannel {
  i2cAddress: number;

  constructor(
    id: string,
    parentId: string, 
    channelName: string,  
    enabled: boolean,
    i2cAddress: number,
  ) {
    super(
      id,
      parentId,
      channelName,
      ModuleType.i2c,
      ModuleSubType.genericI2C, 
      enabled);
    this.i2cAddress = i2cAddress;
  }
}
