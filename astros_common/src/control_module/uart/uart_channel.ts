import { ModuleSubType, ModuleType } from "../../astros_enums";
import { BaseChannel } from "../base_channel";

export class UartChannel extends BaseChannel {
  uartChannel: number;
  baudRate: number;

  constructor(
    id: string,
    parentId: string,
    name: string,
    subType: ModuleSubType,
    enabled: boolean,
    uartChannel: number,
    baudRate: number,
  ) {
    super(id, parentId, name, ModuleType.uart, subType, enabled);
    this.uartChannel = uartChannel;
    this.baudRate = baudRate;
  }
}
