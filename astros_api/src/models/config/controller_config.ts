import { ControllerLocation } from 'src/models/control_module/controller_location.js';
import { GpioChannel } from 'src/models/control_module/gpio/gpio_channel.js';
import { UartModule } from 'src/models/control_module/uart/uart_module.js';
import { ModuleSubType } from 'src/models/enums.js';

export class ControllerConfig {
  id: string;
  location: string;
  name: string;
  address: string;

  gpioChannels: Array<GpioChannel>;
  maestroModules: Array<UartModule>;

  constructor(location: ControllerLocation) {
    this.id = location.controller?.id ?? -1;
    this.location = location.locationName;
    this.name = location.controller?.name ?? '';
    this.address = location.controller?.address ?? '';

    this.gpioChannels = location.gpioModule?.channels ?? [];
    this.maestroModules = location.uartModules.filter(
      (mod) => mod.moduleSubType === ModuleSubType.maestro,
    );
  }
}
