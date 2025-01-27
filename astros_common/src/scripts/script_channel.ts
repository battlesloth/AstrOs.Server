import { ChannelSubType, ChannelType } from "../astros_enums";
import { ModuleChannelType } from "../control_module/base_channel";
import { ScriptEvent } from "./script_event";

export interface EventKVP {
  key: number;
  value: ScriptEvent;
}

export class ScriptChannel {
  id: string;
  scriptId: string;
  locationId: string;
  type: ChannelType;
  subType: ChannelSubType;

  channel: ModuleChannelType;
  channelNumber: number;
  maxDuration: number;
  events: Map<number, ScriptEvent>;
  eventsKvpArray: Array<EventKVP>;

  constructor(
    id: string,
    scriptId: string,
    locationId: string,
    type: ChannelType,
    subType: ChannelSubType,
    channelNumber: number,
    channel: ModuleChannelType,
    maxDuration: number,
  ) {
    this.id = id;
    this.scriptId = scriptId;
    this.locationId = locationId;
    this.type = type;
    this.subType = subType;
    this.channelNumber = channelNumber;
    this.channel = channel;
    this.maxDuration = maxDuration;

    this.events = new Map<number, ScriptEvent>();
    this.eventsKvpArray = new Array<EventKVP>();
  }
}
