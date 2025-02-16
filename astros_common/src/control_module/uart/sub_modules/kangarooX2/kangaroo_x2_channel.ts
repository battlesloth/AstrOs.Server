import { ModuleSubType } from "../../../../astros_enums";
import { UartChannel } from "../../uart_channel";

export class KangarooX2Channel extends UartChannel {
  ch1Name: string;
  ch2Name: string;

  constructor(
    id: string,
    parentId: string,
    name: string,
    uartChannel: number,
    baudRate: number,
    ch1Name: string,
    ch2Name: string,
  ) {
    super(
      id,
      parentId,
      name,
      ModuleSubType.kangaroo,
      true,
      uartChannel,
      baudRate,
    );

    this.ch1Name = ch1Name;
    this.ch2Name = ch2Name;
  }
}
