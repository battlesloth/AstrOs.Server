import { UartType } from "../../../../astros_enums";
import { UartChannel } from "../../uart_channel";

export class MaestroChannel extends UartChannel {
  // servo or GPIO
  isServo: boolean;
  minPos: number;
  maxPos: number;
  homePos: number;
  // if not servo, this is default low value
  inverted: boolean;

  constructor(
    id: number,
    channelName: string,
    enabled: boolean,
    parentModuleId: string,
    isServo: boolean,
    minPos: number,
    maxPos: number,
    homePos: number,
    inverted: boolean,
    uartChannel: number,
    baudRate: number,
  ) {
    super(
      id,
      channelName,
      enabled,
      UartType.maestro,
      parentModuleId,
      uartChannel,
      baudRate,
    );

    this.isServo = isServo;
    this.minPos = minPos;
    this.maxPos = maxPos;
    this.homePos = homePos;
    this.inverted = inverted;
  }
}
