import { ScriptChannelType } from 'astros-common';

export interface LocationDetails {
  id: string;
  name: string;
}

export interface ChannelDetails {
  id: string;
  name: string;
  locationId: string;
  available: boolean;
  scriptChannelType: ScriptChannelType;
}
