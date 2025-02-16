import { ModuleSubType, ModuleType, ScriptChannelType } from "../../astros_enums";
import { ScriptChannelResource } from "../../scripts/script_channel_resource";
import { BaseModule } from "../base_module";
import { GpioChannel } from "./gpio_channel";

export class GpioModule extends BaseModule {
  channels: GpioChannel[];

  constructor(locationId: string) {
    super(
      locationId, 
      "", 
      locationId, 
      ModuleType.gpio, 
      ModuleSubType.genericGpio 
    );
    this.channels = new Array<GpioChannel>();
  }

  override getScriptResources() {

    const resources: ScriptChannelResource[] = [];

    for (const ch of this.channels) {

      if (!ch.enabled) continue;

      resources.push(new ScriptChannelResource(
        ch.id,
        ScriptChannelType.GPIO,
        ch.channelName,
        this.id,
        this.locationId,
        ch
      ));
    }

    return resources;
  }
}
