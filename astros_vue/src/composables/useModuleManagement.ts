import type { I2cModule } from '@/models/controllers/modules/i2c/i2cModule';
import type { KangarooModule } from '@/models/controllers/modules/uart/subModules/kangarooX2/kangarooModule';
import type { MaestroBoard } from '@/models/controllers/modules/uart/subModules/maestro/maestroBoard';
import type { MaestroChannel } from '@/models/controllers/modules/uart/subModules/maestro/maestroChannel';
import type { MaestroModule } from '@/models/controllers/modules/uart/subModules/maestro/maestroModule';
import type { UartModule } from '@/models/controllers/modules/uart/uartModule';
import { Location } from '@/enums/modules/Location';
import { ModuleType } from "@/enums/modules/ModuleType";
import { ModuleSubType } from "@/enums/modules/ModuleSubType";
import { useLocationStore } from '@/stores/location';
import { v4 as uuid } from 'uuid';

export function useModuleManagement() {

  const locationStore = useLocationStore();

  function removeModule(locationId: Location, id: string, moduleType: ModuleType) {
    switch (moduleType) {
      case ModuleType.uart:
        removeUartModule(locationId, id);
        break;
      case ModuleType.i2c:
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
    location.uartModules = location.uartModules.filter(module => module.id !== id);
  }

  function removeI2cModule(locationId: Location, id: string) {

    const location = locationStore.getLocation(locationId);
    if (!location) {
      throw new Error(`Location not found for ID: ${locationId}`);
    }
    location.i2cModules = location.i2cModules.filter(module => module.id !== id);
  }

  function addModule(locationId: Location, moduleType: ModuleType, moduleSubType?: ModuleSubType) {
    switch (moduleType) {
      case ModuleType.uart:
        addUartModule(locationId, moduleSubType);
        break;
      case ModuleType.i2c:
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
    const defaultChannel = locationId === Location.body ? 2 : 1;

    const module: UartModule = {
      id: uuid(),
      idx: -1,
      locationId: locationId,
      moduleType: ModuleType.uart,
      moduleSubType: moduleSubType ?? ModuleSubType.genericSerial,
      name: 'New Serial Module',
      uartChannel: defaultChannel,
      baudRate: 9600,
      subModule: undefined,
    }

    switch (moduleSubType) {
      case ModuleSubType.humanCyborgRelationsSerial:
        module.name = 'New HCR Serial Module';
        break;
      case ModuleSubType.kangaroo:
        module.name = 'New Kangaroo Module';
        module.subModule = newKangarooModule();
        break;
      case ModuleSubType.maestro:
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
      locationId: locationId,
      moduleType: ModuleType.i2c,
      moduleSubType: moduleSubType ?? ModuleSubType.genericI2C,
      name: 'New I2C Module',
      i2cAddress: nextAddress,
      subModule: undefined,
    }

    switch (moduleSubType) {
      case ModuleSubType.genericI2C:
        break;
      case ModuleSubType.pwmBoard:
        throw new Error('I2C PWM Board not implemented yet.');
      case ModuleSubType.humanCyborgRelationsI2C:
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
        channelName: `Channel ${i + 1}`,
        enabled: false,
        isServo: false,
        inverted: false,
        minPos: 500,
        maxPos: 2500,
        homePos: 1250,
        moduleType: ModuleType.uart,
        moduleSubType: ModuleSubType.maestro,
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

