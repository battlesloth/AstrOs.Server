export interface ControlModule {
  address: string;
  name: string;
}

export interface BaseModule {
  id: string;
  i2cAddress?: number;
}

export interface GpioChannel {
  id: string;
}

export interface GpioModule {
  channels: GpioChannel[];
}

export interface I2cModule extends BaseModule {
  i2cAddress: number;
}

export interface UartModule extends BaseModule {
}

export interface ControllerLocation {
  id: string;
  locationName: string;
  description: string;
  configFingerprint: string;
  controller: ControlModule;
  gpioModule: GpioModule;
  i2cModules: I2cModule[];
  uartModules: UartModule[];
}
