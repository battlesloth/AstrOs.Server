import type { BaseModule } from "@/models/controllers/baseModule";
import type { GpioChannel } from "./gpioChannel";

export interface GpioModule extends BaseModule {
  channels: GpioChannel[];
}
