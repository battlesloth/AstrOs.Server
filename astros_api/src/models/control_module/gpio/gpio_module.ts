import { ModuleSubType, ModuleType, ScriptChannelType } from 'src/models/enums.js';
import { ScriptChannelResource } from 'src/models/scripts/script_channel_resource.js';
import { BaseModule } from 'src/models/control_module/base_module.js';
import { GpioChannel } from './gpio_channel.js';

export class GpioModule extends BaseModule {
  channels: GpioChannel[];

  constructor(locationId: string) {
    super(0, locationId, '', locationId, ModuleType.gpio, ModuleSubType.genericGpio);
    this.channels = new Array<GpioChannel>();
  }
}

export function getGpioScriptResources(m: GpioModule): ScriptChannelResource[] {
  const resources: ScriptChannelResource[] = [];

  for (const ch of m.channels) {
    if (!ch.enabled) continue;

    resources.push({
      channelId: ch.id,
      scriptChannelType: ScriptChannelType.GPIO,
      name: ch.channelName,
      parentModuleId: m.id,
      locationId: m.locationId,
      channel: ch,
      available: true,
    });
  }

  return resources;
}
