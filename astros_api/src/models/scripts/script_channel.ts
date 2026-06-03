import { ScriptChannelType } from 'src/models/enums.js';
import { ModuleChannelType } from 'src/models/control_module/base_channel.js';
import { ScriptEvent } from './script_event.js';

export interface ScriptChannel {
  id: string;
  scriptId: string;
  channelType: ScriptChannelType;
  parentModuleId: string;
  moduleChannelId: string;
  moduleChannelType: string;
  moduleChannel: ModuleChannelType;
  maxDuration: number;
  events: Record<string, ScriptEvent>;
}
