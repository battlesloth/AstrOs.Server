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
    idx: number,
    id: string,
    name: string,
    locationId: string,
    i2cAddress: number,
    subType: ModuleSubType,
  ) {
    super(idx, id, name, locationId, ModuleType.i2c, subType);
    this.i2cAddress = i2cAddress;
    this.subModule = {};
  }
}

export function getI2cScriptResources(m: I2cModule): ScriptChannelResource[] {
  const resources: ScriptChannelResource[] = [];

  switch (m.moduleSubType) {
    case ModuleSubType.genericI2C:
      resources.push(
        new ScriptChannelResource(
          m.id,
          ScriptChannelType.GENERIC_I2C,
          m.name,
          m.id,
          m.locationId,
          new I2cChannel(m.id, m.locationId, m.name, true),
        ),
      );
      break;
  }

  return resources;
}
