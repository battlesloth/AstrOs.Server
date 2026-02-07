import type { ScriptChannelType } from '@/enums/scripts/scriptChannelType';
import type { ModuleChannelType } from '../controllers/moduleChannels';

export interface ScriptChannelResource {
  channelId: string;
  scriptChannelType: ScriptChannelType;
  name: string;
  parentModuleId: string;
  locationId: string;
  channel: ModuleChannelType;
  available: boolean;
}
