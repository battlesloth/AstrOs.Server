import type { Graphics } from 'pixi.js';
import type { ScriptChannelType } from '@/enums/scripts/scriptChannelType';
import type { ScriptEvent } from '@/models/scripts/scriptEvent';

export interface EventBox {
  channelId: string;
  timeInSeconds: number;
  graphics: Graphics;
  scriptEvent: ScriptEvent;
}
