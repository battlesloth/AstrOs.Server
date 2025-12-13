import type { BaseChannel } from '@/models/controllers/baseChannel';

export interface PwmChannel extends BaseChannel {
  channelId: number;
  minPos: number;
  maxPos: number;
  homePos: number;
  inverted: boolean;
}
