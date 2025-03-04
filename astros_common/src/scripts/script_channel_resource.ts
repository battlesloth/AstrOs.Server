import { ScriptChannelType } from "../astros_enums";
import { ModuleChannelType } from "../control_module/base_channel";

export class ScriptChannelResource {
  channelId: string;
  scriptChannelType: ScriptChannelType;
  name: string;
  parentModuleId: string;
  locationId: string;
  channel: ModuleChannelType;
  available: boolean;

  constructor(
    channelId: string,
    type: ScriptChannelType,
    name: string,
    parentModuleId: string,
    locationId: string,
    channel: ModuleChannelType,
  ) {
    this.channelId = channelId;
    this.scriptChannelType = type;
    this.name = name;
    this.parentModuleId = parentModuleId;
    this.locationId = locationId;
    this.channel = channel;

    this.available = true;
  }
}
