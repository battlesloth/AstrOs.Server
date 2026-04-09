import { ScriptChannelType } from 'src/models/enums.js';
import { ModuleChannelType } from 'src/models/control_module/base_channel.js';
import { ScriptEvent } from './script_event.js';

export class ScriptChannel {
  id: string;
  scriptId: string;
  channelType: ScriptChannelType;
  parentModuleId: string;
  moduleChannelId: string;
  moduleChannelType: string;
  moduleChannel: ModuleChannelType;
  maxDuration: number;

  events: Record<string, ScriptEvent>;

  constructor(
    id: string,
    scriptId: string,
    channelType: ScriptChannelType,
    parentModuleId: string,
    moduleChannelId: string,
    moduleChannelType: string,
    moduleChannel: ModuleChannelType,
    maxDuration: number,
  ) {
    this.id = id;

    this.scriptId = scriptId;
    this.channelType = channelType;
    this.parentModuleId = parentModuleId;
    this.moduleChannelId = moduleChannelId;
    this.moduleChannelType = moduleChannelType;
    this.moduleChannel = moduleChannel;
    this.maxDuration = maxDuration;

    this.events = {};
  }
}
