import type { ModuleSubType, ModuleType, ScriptChannelType } from '@/enums';
import type { ModuleChannelType } from '../controllers';

export interface ChannelTestValue {
  locationId: string;
  moduleId: string;
  moduleChannel: ModuleChannelType;
  moduleType: ModuleType;
  moduleSubType: ModuleSubType;
  channelId: string;
  channelType: ScriptChannelType;
}
