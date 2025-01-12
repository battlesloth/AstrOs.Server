import { GpioChannel } from "./gpio_channel";

export class GpioModule {
  channels: GpioChannel[];

  constructor() {
    this.channels = new Array<GpioChannel>();
  }
}
