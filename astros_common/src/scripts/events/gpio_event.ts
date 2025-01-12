export class GpioEvent {
  channelId: number;
  setHigh: boolean;

  constructor(channelId: number, setHigh: boolean) {
    this.channelId = channelId;
    this.setHigh = setHigh;
  }
}
