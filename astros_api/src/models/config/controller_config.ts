import { ControllerLocation } from 'src/models/control_module/controller_location.js';
import { GpioChannel } from 'src/models/control_module/gpio/gpio_channel.js';
import { UartModule } from 'src/models/control_module/uart/uart_module.js';
import { ModuleSubType } from 'src/models/enums.js';

export interface ControllerConfig {
  id: string;
  location: string;
  name: string;
  address: string;
  gpioChannels: Array<GpioChannel>;
  maestroModules: Array<UartModule>;
}

export function createControllerConfig(location: ControllerLocation): ControllerConfig {
  return {
    id: location.controller?.id ?? '',
    location: location.locationName,
    name: location.controller?.name ?? '',
    address: location.controller?.address ?? '',
    gpioChannels: location.gpioModule?.channels ?? [],
    maestroModules: location.uartModules.filter(
      (mod) => mod.moduleSubType === ModuleSubType.maestro,
    ),
  };
}
