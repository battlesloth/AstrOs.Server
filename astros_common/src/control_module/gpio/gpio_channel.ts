import { ModuleSubType, ModuleType } from "../../astros_enums";
import { BaseChannel } from "../base_channel";

export class GpioChannel extends BaseChannel {
  channelId: number;
  defaultLow: boolean;

  constructor(
    id: string,
    parentId: string,
    channelid: number,
    enabled: boolean,
    channelName: string,
    defaultLow: boolean,
  ) {
    super(
      id,
      parentId,
      channelName,
      ModuleType.gpio,
      ModuleSubType.genericGpio,
      enabled,
    );
    this.channelId = channelid;
    this.defaultLow = defaultLow;
  }
}
