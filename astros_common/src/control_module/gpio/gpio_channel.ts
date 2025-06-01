import { ModuleSubType, ModuleType } from "../../astros_enums";
import { BaseChannel } from "../base_channel";

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
    super(
      id,
      parentId,
      channelName,
      ModuleType.gpio,
      ModuleSubType.genericGpio,
      enabled,
    );
    this.channelNumber = channelNumber;
    this.defaultHigh = defaultHigh;
  }
}
