import { ModuleSubType, ModuleType, ScriptChannelType } from 'src/models/enums.js';
import { ScriptChannelResource } from 'src/models/scripts/script_channel_resource.js';
import { BaseModule } from 'src/models/control_module/base_module.js';
import { I2cChannel } from './i2c_channel.js';

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
      resources.push({
        channelId: m.id,
        scriptChannelType: ScriptChannelType.GENERIC_I2C,
        name: m.name,
        parentModuleId: m.id,
        locationId: m.locationId,
        channel: new I2cChannel(m.id, m.locationId, m.name, true),
        available: true,
      });
      break;
  }

  return resources;
}
