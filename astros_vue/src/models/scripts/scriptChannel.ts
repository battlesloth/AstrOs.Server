import type { ScriptChannelType } from '@/enums/scripts/scriptChannelType';
import type { ModuleChannelType } from '../controllers/moduleChannels';
import type { ScriptEvent } from './scriptEvent';

export interface ScriptChannel {
  id: string;
  scriptId: string;
  channelType: ScriptChannelType;
  parentModuleId: string;
  moduleChannelId: string;
  moduleChannelType: string;
  moduleChannel: ModuleChannelType;
  maxDuration: number;

  events: Map<number, ScriptEvent>;
}
