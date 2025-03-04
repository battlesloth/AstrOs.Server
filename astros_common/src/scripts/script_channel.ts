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
  moduleChannelId: string;
  moduleChannelType: string;
  moduleChannel: ModuleChannelType;
  maxDuration: number;

  events: Map<number, ScriptEvent>;
  eventsKvpArray: Array<EventKVP>;

  constructor(
    id: string,
    scriptId: string,
    channelType: ScriptChannelType,
    moduleChannelId: string,
    moduleChannelType: string,
    moduleChannel: ModuleChannelType,
    maxDuration: number,
  ) {
    this.id = id;

    this.scriptId = scriptId;
    this.channelType = channelType;
    this.moduleChannelId = moduleChannelId;
    this.moduleChannelType = moduleChannelType;
    this.moduleChannel = moduleChannel;
    this.maxDuration = maxDuration;

    this.events = new Map<number, ScriptEvent>();
    this.eventsKvpArray = new Array<EventKVP>();
  }
}
