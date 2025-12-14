import { ModuleSubType, ModuleType, Location } from './enums';

export interface AddModuleEvent {
  locationId: Location;
  moduleType: ModuleType;
  moduleSubType?: ModuleSubType;
}

export interface RemoveModuleEvent {
  locationId: Location;
  id: string;
  moduleType: ModuleType;
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
