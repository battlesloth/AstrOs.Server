import { ModuleSubType } from "../../../../astros_enums";
import { UartChannel } from "../../uart_channel";

export class KangarooX2Channel extends UartChannel {
  ch1Name: string;
  ch2Name: string;

  constructor(
    id: string,
    parentId: string,
    name: string,
    ch1Name: string,
    ch2Name: string,
  ) {
    super(
      id,
      parentId,
      name,
      ModuleSubType.kangaroo,
      true,
    );

    this.ch1Name = ch1Name;
    this.ch2Name = ch2Name;
  }
}
