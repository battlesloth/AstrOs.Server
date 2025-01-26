import { I2cType } from "../../astros_enums";
import { I2cChannel } from "./i2c_channel";

export class I2cModule {
  id: string;
  name: string;
  locationId: number;
  i2cAddress: number;
  type: I2cType;
  channels: I2cChannel[];

  constructor(id: string, name: string, locationId: number, i2cAddress: number,  type: I2cType) {
    this.id = id;
    this.name = name;
    this.locationId = locationId;
    this.i2cAddress = i2cAddress;
    this.type = type;
    this.channels = new Array<I2cChannel>();
  }
}
