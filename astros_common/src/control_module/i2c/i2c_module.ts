import {
  ModuleSubType,
  ModuleType,
  ScriptChannelType,
} from "../../astros_enums";
import { ScriptChannelResource } from "../../scripts/script_channel_resource";
import { BaseModule } from "../base_module";
import { I2cChannel } from "./i2c_channel";

export class I2cModule extends BaseModule {
  i2cAddress: number;
  subModule: unknown;

  constructor(
    id: string,
    name: string,
    locationId: string,
    i2cAddress: number,
    subType: ModuleSubType,
  ) {
    super(id, name, locationId, ModuleType.i2c, subType);
    this.i2cAddress = i2cAddress;
    this.subModule = {};
  }

  override getScriptResources() {
    const resources: ScriptChannelResource[] = [];

    switch (this.moduleSubType) {
      case ModuleSubType.genericI2C:
        resources.push(
          new ScriptChannelResource(
            this.id,
            ScriptChannelType.GENERIC_I2C,
            this.name,
            this.id,
            this.locationId,
            new I2cChannel(this.id, this.locationId, this.name, true),
          ),
        );
        break;
    }

    return resources;
  }
}
