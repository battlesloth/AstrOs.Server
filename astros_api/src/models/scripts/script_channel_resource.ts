import { ScriptChannelType } from 'src/models/enums.js';
import { ModuleChannelType } from 'src/models/control_module/base_channel.js';

export interface ScriptChannelResource {
  channelId: string;
  scriptChannelType: ScriptChannelType;
  name: string;
  parentModuleId: string;
  locationId: string;
  channel: ModuleChannelType;
  available: boolean;
}
