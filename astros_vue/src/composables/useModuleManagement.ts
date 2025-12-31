import type { I2cModule, KangarooModule, MaestroBoard, MaestroChannel, MaestroModule, UartModule } from '@/models';
import { Location, ModuleType, ModuleSubType } from '@/enums';
import { useLocationStore } from '@/stores/location';
import { v4 as uuid } from 'uuid';

export function useModuleManagement() {
  const locationStore = useLocationStore();

  function removeModule(locationId: Location, id: string, moduleType: ModuleType) {
    switch (moduleType) {
      case ModuleType.UART:
        removeUartModule(locationId, id);
        break;
      case ModuleType.I2C:
        removeI2cModule(locationId, id);
        break;
      default:
        throw new Error(`Unsupported module type for removal: ${moduleType}`);
    }
  }

  function removeUartModule(locationId: Location, id: string) {
    const location = locationStore.getLocation(locationId);
    if (!location) {
      throw new Error(`Location not found for ID: ${locationId}`);
    }
    location.uartModules = location.uartModules.filter((module) => module.id !== id);
  }

  function removeI2cModule(locationId: Location, id: string) {
    const location = locationStore.getLocation(locationId);
    if (!location) {
      throw new Error(`Location not found for ID: ${locationId}`);
    }
    location.i2cModules = location.i2cModules.filter((module) => module.id !== id);
  }

  function addModule(locationId: Location, moduleType: ModuleType, moduleSubType?: ModuleSubType) {
    switch (moduleType) {
      case ModuleType.UART:
        addUartModule(locationId, moduleSubType);
        break;
      case ModuleType.I2C:
        addI2cModule(locationId, moduleSubType);
        break;
      default:
        throw new Error(`Unsupported module type for addition: ${moduleType}`);
    }
  }

  function addUartModule(locationId: Location, moduleSubType?: ModuleSubType) {
    const location = locationStore.getLocation(locationId);
    if (!location) {
      throw new Error(`Location not found for ID: ${locationId}`);
    }

    // body reserves channel 1 for other Rasberry Pi communications
    const defaultChannel = locationId === Location.BODY ? 2 : 1;

    const module: UartModule = {
      id: uuid(),
      idx: -1,
      locationId: location.id,
      moduleType: ModuleType.UART,
      moduleSubType: moduleSubType ?? ModuleSubType.GENERIC_SERIAL,
      name: 'New Serial Module',
      uartChannel: defaultChannel,
      baudRate: 9600,
      subModule: undefined,
    };

    switch (moduleSubType) {
      case ModuleSubType.HUMAN_CYBORG_RELATIONS_SERIAL:
        module.name = 'New HCR Module';
        break;
      case ModuleSubType.KANGAROO:
        module.name = 'New Kangaroo Module';
        module.subModule = newKangarooModule();
        break;
      case ModuleSubType.MAESTRO:
        module.name = 'New Maestro Module';
        module.subModule = newMaestroModule();
        break;
      default:
        console.error('Unsupported UART module subtype for addition:', moduleSubType);
    }

    location.uartModules.push(module);
  }

  function addI2cModule(locationId: Location, moduleSubType?: ModuleSubType) {
    const location = locationStore.getLocation(locationId);
    if (!location) {
      throw new Error(`Location not found for ID: ${locationId}`);
    }

    const nextAddress = getNextAvailableI2cAddress(location.i2cModules);

    const module: I2cModule = {
      id: uuid(),
      idx: -1,
      locationId: location.id,
      moduleType: ModuleType.I2C,
      moduleSubType: moduleSubType ?? ModuleSubType.GENERIC_I2C,
      name: 'New I2C Module',
      i2cAddress: nextAddress,
      subModule: undefined,
    };

    switch (moduleSubType) {
      case ModuleSubType.GENERIC_I2C:
        break;
      case ModuleSubType.PWM_BOARD:
        throw new Error('I2C PWM Board not implemented yet.');
      case ModuleSubType.HUMAN_CYBORG_RELATIONS_I2C:
        throw new Error('I2C HCR not implemented yet.');
      default:
        console.error('Unsupported I2C module subtype for addition:', moduleSubType);
    }

    location.i2cModules.push(module);
  }

  function newKangarooModule(): KangarooModule {
    return {
      id: uuid(),
      ch1Name: 'Channel 1',
      ch2Name: 'Channel 2',
    };
  }

  function newMaestroModule(): MaestroModule {
    const moduleId = uuid();

    const board: MaestroBoard = {
      id: uuid(),
      parentId: moduleId,
      name: 'Board 1',
      boardId: 0,
      channelCount: 24,
      channels: [],
    };

    for (let i = 0; i < board.channelCount; i++) {
      const channel: MaestroChannel = {
        id: uuid(),
        parentId: board.id,
        channelNumber: i,
        channelName: `Channel ${i}`,
        enabled: false,
        isServo: false,
        inverted: false,
        minPos: 500,
        maxPos: 2500,
        homePos: 1250,
        moduleType: ModuleType.UART,
        moduleSubType: ModuleSubType.MAESTRO,
      };
      board.channels.push(channel);
    }

    return {
      boards: [board],
    };
  }

  function getNextAvailableI2cAddress(modules: I2cModule[]): number {
    const usedAddresses = new Set<number>();
    for (const module of modules) {
      usedAddresses.add(module.i2cAddress);
    }
    for (let i = 0; i < 128; i++) {
      if (!usedAddresses.has(i)) {
        return i;
      }
    }
    throw new Error('No available I2C addresses.');
  }

  return {
    addModule,
    removeModule,
  };
}
