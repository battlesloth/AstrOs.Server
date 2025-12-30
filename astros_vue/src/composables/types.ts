import type { Graphics } from 'pixi.js';

export interface Channel {
  chNum: number;
  id: string;
  name: string;
  events: any[];
}

export interface EventBox {
  channelId: string;
  timeInSeconds: number;
  graphics: Graphics;
}
