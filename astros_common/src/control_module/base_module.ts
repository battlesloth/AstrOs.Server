import { ModuleSubType, ModuleType } from "../astros_enums";

export abstract class BaseModule {
  id: string;
  name: string;
  locationId: string;
  moduleType: ModuleType;
  moduleSubType: ModuleSubType;

  constructor(
    id: string,
    name: string,
    locationId: string,
    moduleType: ModuleType,
    moduleSubType: ModuleSubType,
  ) {
    this.id = id;
    this.name = name;
    this.locationId = locationId;
    this.moduleType = moduleType;
    this.moduleSubType = moduleSubType;
  }
}
