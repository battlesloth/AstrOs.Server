import {
  ModuleSubType,
  ModuleType,
  ScriptChannelType,
} from "../../astros_enums";
import { ScriptChannelResource } from "../../scripts/script_channel_resource";
import { BaseModule } from "../base_module";
import { GpioChannel } from "./gpio_channel";

export class GpioModule extends BaseModule {
  channels: GpioChannel[];

  constructor(locationId: string) {
    super(
      0,
      locationId,
      "",
      locationId,
      ModuleType.gpio,
      ModuleSubType.genericGpio,
    );
    this.channels = new Array<GpioChannel>();
  }
}

export function getGpioScriptResources(m: GpioModule): ScriptChannelResource[] {
  const resources: ScriptChannelResource[] = [];

  for (const ch of m.channels) {
    if (!ch.enabled) continue;

    resources.push(
      new ScriptChannelResource(
        ch.id,
        ScriptChannelType.GPIO,
        ch.channelName,
        m.id,
        m.locationId,
        ch,
      ),
    );
  }

  return resources;
}
