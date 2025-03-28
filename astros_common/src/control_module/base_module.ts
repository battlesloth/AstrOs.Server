import { ModuleSubType, ModuleType } from "../astros_enums";

export abstract class BaseModule {
  // idx is the primary key for the module,
  // but why an index? Why not just use the id?
  // We don't want to have to send UUIDs over the wire
  // for every script event as that will blow up the message size
  // so we use the index to reference the module in the script.
  // Why not just use the index as the id?
  // Becuase it's easier to catch errors in the web code if the id 
  // is a UUID since collisions are nearly impossible.
  idx: number;
  id: string;
  name: string;
  locationId: string;
  moduleType: ModuleType;
  moduleSubType: ModuleSubType;

  constructor(
    idx: number,
    id: string,
    name: string,
    locationId: string,
    moduleType: ModuleType,
    moduleSubType: ModuleSubType,
  ) {
    this.idx = idx;
    this.id = id;
    this.name = name;
    this.locationId = locationId;
    this.moduleType = moduleType;
    this.moduleSubType = moduleSubType;
  }
}
