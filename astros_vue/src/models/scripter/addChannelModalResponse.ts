import type { ScriptChannelType } from '@/enums';
import type { ChannelDetails } from './channelDetails';

export interface AddChannelModalResponse {
  channels: Map<ScriptChannelType, ChannelDetails[]>;
}