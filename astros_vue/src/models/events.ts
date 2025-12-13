import { ModuleSubType, ModuleType } from './enums';

export interface AddModuleEvent {
  locationId: string;
  module: ModuleType;
}

export interface RemoveModuleEvent {
  locationId?: string;
  id: string;
  module: ModuleType;
}

export interface ServoTestEvent {
  controllerAddress?: string;
  controllerName?: string;
  moduleSubType: ModuleSubType;
  channelNumber: number;
}

export interface AddressChangeEvent {
  old: number;
  new: number;
}
