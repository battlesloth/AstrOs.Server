import { BaseChannel } from "../base_channel";

export class GpioChannel extends BaseChannel {
  defaultLow: boolean;

  constructor(
    id: number,
    channelName: string,
    defaultLow: boolean,
    enabled: boolean,
  ) {
    super(id, channelName, enabled);
    this.defaultLow = defaultLow;
  }
}
