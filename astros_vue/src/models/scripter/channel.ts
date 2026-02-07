import type { ScriptChannelType } from '@/enums';
import type { ScriptEvent } from '../scripts/scriptEvent';

export interface Channel {
  //chNum: number;
  id: string;
  name: string;
  channelType: ScriptChannelType;
  events: ScriptEvent[];
}
