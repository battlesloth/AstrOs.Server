import { UartType } from "../../astros_enums";

export class UartModule {
  id: string;
  name: string;
  locationId: string;
  uartType: UartType;
  uartChannel: number;
  baudRate: number;
  subModule: unknown;

  constructor(
    id: string,
    name: string,
    locationId: string,
    uartType: UartType,
    uartChannel: number,
    baudRate: number,
  ) {
    this.id = id;
    this.name = name;
    this.locationId = locationId;
    this.uartType = uartType;
    this.uartChannel = uartChannel;
    this.baudRate = baudRate;
    this.subModule = {};
  }
}
