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
  controllerAddress: string;
  controllerName: string;
  moduleSubType: ModuleSubType;
  moduleIdx: number;
  channelNumber: number;
  value: number;
}
