import type { ModuleType } from "../../enums/modules/ModuleType";
import type { ModuleSubType } from "../../enums/modules/ModuleSubType";

export interface BaseModule {
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
  locationId: string; // uuid of location
  moduleType: ModuleType;
  moduleSubType: ModuleSubType;
}
