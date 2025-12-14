import type { ModuleType } from "../../enums/modules/ModuleType";
import type { ModuleSubType } from "../../enums/modules/ModuleSubType";

export interface BaseChannel {
  id: string;
  parentId: string;
  channelName: string;
  enabled: boolean;

  moduleType: ModuleType;
  moduleSubType: ModuleSubType;
}
