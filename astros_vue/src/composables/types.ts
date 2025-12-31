import type { Graphics } from 'pixi.js';
import type { ScriptChannelType } from '@/enums/scripts/scriptChannelType';
import type { ScriptEvent } from '@/models/scripts/scriptEvent';

export interface Channel {
  chNum: number;
  id: string;
  name: string;
  channelType: ScriptChannelType;
  events: ScriptEvent[];
}

export interface EventBox {
  channelId: string;
  timeInSeconds: number;
  graphics: Graphics;
}
