import { I2cType } from "../../astros_enums";

export class I2cModule {
  id: string;
  name: string;
  locationId: string;
  i2cAddress: number;
  type: I2cType;
  subModule: unknown;

  constructor(
    id: string,
    name: string,
    locationId: string,
    i2cAddress: number,
    type: I2cType,
  ) {
    this.id = id;
    this.name = name;
    this.locationId = locationId;
    this.i2cAddress = i2cAddress;
    this.type = type;
    this.subModule = {};
  }
}
