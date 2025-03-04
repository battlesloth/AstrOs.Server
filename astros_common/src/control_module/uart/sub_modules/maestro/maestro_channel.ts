import { ModuleSubType } from "../../../../astros_enums";
import { UartChannel } from "../../uart_channel";

export class MaestroChannel extends UartChannel {
  channelNumber: number;
  // servo or GPIO
  isServo: boolean;
  minPos: number;
  maxPos: number;
  homePos: number;
  // if not servo, this is default low value
  inverted: boolean;

  constructor(
    id: string,
    parentId: string,
    channelName: string,
    enabled: boolean,
    channelNumber: number,
    isServo: boolean,
    minPos: number,
    maxPos: number,
    homePos: number,
    inverted: boolean,
  ) {
    super(id, parentId, channelName, ModuleSubType.maestro, enabled);

    this.channelNumber = channelNumber;
    this.isServo = isServo;
    this.minPos = minPos;
    this.maxPos = maxPos;
    this.homePos = homePos;
    this.inverted = inverted;
  }
}
