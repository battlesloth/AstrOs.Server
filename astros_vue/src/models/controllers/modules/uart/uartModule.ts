import type { BaseModule } from "@/models/controllers/baseModule";

export interface UartModule extends BaseModule {
  uartChannel: number;
  baudRate: number;
  subModule: unknown;
}

