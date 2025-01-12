import { UartType } from "../../astros_enums";
import { BaseChannel } from "../base_channel";

export class UartChannel extends BaseChannel {
  uartType: UartType;
  parentModuleId: string;
  uartChannel: number;
  baudRate: number;

  constructor(
    id: number,
    name: string,
    enabled: boolean,
    uartType: UartType,
    parentModuleId: string,
    uartChannel: number,
    baudRate: number,
  ) {
    super(id, name, enabled);
    this.uartType = uartType;
    this.parentModuleId = parentModuleId;
    this.uartChannel = uartChannel;
    this.baudRate = baudRate;
  }
}
