import { ModuleSubType, ModuleType } from 'astros-common';

export interface AddModuleEvent {
  locationId: string;
  module: ModuleType;
}

export interface RemoveModuleEvent {
  locationId: string;
  id: string;
  module: ModuleType;
}

export interface ServoTestEvent {
  locationId: string;
  moduleType: ModuleType;
  moduleSubType: ModuleSubType;
  channelId: string;
}
