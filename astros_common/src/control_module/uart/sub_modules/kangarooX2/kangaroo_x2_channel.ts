import { UartType } from "../../../../astros_enums";
import { UartChannel } from "../../uart_channel";

export class KangarooX2Channel extends UartChannel {
  dbId: string;
  ch1Name: string;
  ch2Name: string;

  constructor(
    name: string,
    dbId: string,
    parentModuleId: string,
    uartChannel: number,
    baudRate: number,
    ch1Name: string,
    ch2Name: string,
  ) {
    super(
      0,
      name,
      true,
      UartType.kangaroo,
      parentModuleId,
      uartChannel,
      baudRate,
    );

    this.dbId = dbId;
    this.ch1Name = ch1Name;
    this.ch2Name = ch2Name;
  }
}
