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
    parentId: string;
    channelName: string;
    channelNumber: number;
    enabled: boolean;
    defaultHigh: boolean;
}

export interface GpioModule {
    channels: GpioChannel[];
}

export interface I2cModule extends BaseModule {
    idx: number;
    name: string;
    locationId: string;
    i2cAddress: number;
    moduleSubType: number;
    subModule?: unknown;
}

export interface UartModule extends BaseModule {
    idx: number;
    name: string;
    locationId: string;
    moduleSubType: number;
    uartChannel: number;
    baudRate: number;
    subModule?: unknown;
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
