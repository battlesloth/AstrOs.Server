import { UartType } from "../../astros_enums";

export class UartModule {
  id: string;
  locationId: number;
  uartType: UartType;
  uartChannel: number;
  baudRate: number;
  name: string;
  subModule: any;

  constructor(
    id: string,
    locationId: number,
    uartType: UartType,
    uartChannel: number,
    baudRate: number,
    name: string,
  ) {
    this.id = id;
    this.locationId = locationId;
    this.uartType = uartType;
    this.uartChannel = uartChannel;
    this.baudRate = baudRate;
    this.name = name;
    this.subModule = {};
  }
}
