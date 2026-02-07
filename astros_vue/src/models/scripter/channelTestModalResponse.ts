import type { ModuleSubType, ModuleType } from '@/enums';
import type { ScriptEventTypes } from '../scripts/events/scriptEventTypes';

export interface ChannelTestModalResponse {
  controllerId: string;
  moduleId: string;
  moduleType: ModuleType;
  moduleSubType: ModuleSubType;
  channelId: string;
  event: ScriptEventTypes;
}
