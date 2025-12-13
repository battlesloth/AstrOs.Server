import type { BaseChannel } from '@/models/controllers/baseChannel';

export interface GpioChannel extends BaseChannel {
  channelNumber: number;
  defaultHigh: boolean;
}
