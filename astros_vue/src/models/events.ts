import { Location } from '../enums/modules/Location';
import { ModuleType } from "../enums/modules/ModuleType";
import { ModuleSubType } from "../enums/modules/ModuleSubType";

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
  moduleIdx: number;
  channelNumber: number;
  homePosition: number;
}

export interface AddressChangeEvent {
  old: number;
  new: number;
}
