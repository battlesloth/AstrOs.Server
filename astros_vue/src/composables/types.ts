import type { Graphics } from 'pixi.js';

export interface Channel {
  id: number;
  name: string;
  events: any[];
}

export interface EventBox {
  channelId: number;
  timeInSeconds: number;
  graphics: Graphics;
}
