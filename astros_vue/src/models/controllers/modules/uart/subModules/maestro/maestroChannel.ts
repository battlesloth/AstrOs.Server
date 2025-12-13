import type { UartChannel } from "@/models/controllers/modules/uart/uartChannel";

export interface MaestroChannel extends UartChannel {
  channelNumber: number;
  // servo or GPIO
  isServo: boolean;
  minPos: number;
  maxPos: number;
  homePos: number;
  // if not servo, this is default low value
  inverted: boolean;
}
