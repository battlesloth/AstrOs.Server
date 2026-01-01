import { ScriptChannelType } from "../astros_enums";
import { ModuleChannelType } from "../control_module/base_channel";
import { ScriptEvent } from "./script_event";

export interface EventKVP {
  key: number;
  value: ScriptEvent;
}

export class ScriptChannel {
  id: string;
  scriptId: string;
  channelType: ScriptChannelType;
  parentModuleId: string;
  moduleChannelId: string;
  moduleChannelType: string;
  moduleChannel: ModuleChannelType;
  maxDuration: number;

  events: Record<number, ScriptEvent>;

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
