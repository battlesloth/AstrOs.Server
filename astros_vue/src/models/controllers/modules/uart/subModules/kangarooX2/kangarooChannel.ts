import type { UartChannel } from "@/models/controllers/modules/uart/uartChannel";

export interface KangarooChannel extends UartChannel {
  ch1Name: string;
  ch2Name: string;
}
