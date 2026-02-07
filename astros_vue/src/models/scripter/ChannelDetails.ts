import type { ScriptChannelType } from '@/enums/scripts/scriptChannelType';

export interface ChannelDetails {
  id: string;
  name: string;
  locationId: string;
  available: boolean;
  scriptChannelType: ScriptChannelType;
}
