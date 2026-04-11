import { ModuleSubType, ModuleType, ScriptChannelType } from 'src/models/enums.js';
import { ScriptChannelResource } from 'src/models/scripts/script_channel_resource.js';
import { BaseModule } from 'src/models/control_module/base_module.js';
import { KangarooX2 } from './sub_modules/kangarooX2/kangaroo_x2.js';
import { KangarooX2Channel } from './sub_modules/kangarooX2/kangaroo_x2_channel.js';
import { MaestroModule } from './sub_modules/maestro/maestro_module.js';
import { UartChannel } from './uart_channel.js';

export class UartModule extends BaseModule {
  uartChannel: number;
  baudRate: number;
  subModule: unknown;

  constructor(
    idx: number,
    id: string,
    name: string,
    locationId: string,
    subType: ModuleSubType,
    uartChannel: number,
    baudRate: number,
  ) {
    super(idx, id, name, locationId, ModuleType.uart, subType);
    this.uartChannel = uartChannel;
    this.baudRate = baudRate;
    this.subModule = {};
  }
}

export function getUartScriptResources(m: UartModule): ScriptChannelResource[] {
  let resources: ScriptChannelResource[] = [];

  switch (m.moduleSubType) {
    case ModuleSubType.genericSerial:
      resources = generateGenericSerialResources(m);
      break;
    case ModuleSubType.kangaroo:
      resources = generateKangarooResources(m);
      break;
    case ModuleSubType.maestro:
      resources = generateMaestroResources(m);
      break;
    case ModuleSubType.humanCyborgRelationsSerial:
      resources = generateHCRResources(m);
      break;
  }

  return resources;
}

function generateGenericSerialResources(m: UartModule): ScriptChannelResource[] {
  const ch = new UartChannel(m.id, m.id, m.name, m.moduleSubType, true);

  return [
    {
      channelId: m.id,
      scriptChannelType: ScriptChannelType.GENERIC_UART,
      name: m.name,
      parentModuleId: m.id,
      locationId: m.locationId,
      channel: ch,
      available: true,
    },
  ];
}

function generateKangarooResources(m: UartModule): ScriptChannelResource[] {
  const mod = m.subModule as KangarooX2;

  const ch = new KangarooX2Channel(mod.id, m.id, m.name, mod.ch1Name, mod.ch2Name);

  return [
    {
      channelId: mod.id,
      scriptChannelType: ScriptChannelType.KANGAROO,
      name: m.name,
      parentModuleId: m.id,
      locationId: m.locationId,
      channel: ch,
      available: true,
    },
  ];
}

function generateMaestroResources(m: UartModule): ScriptChannelResource[] {
  const resources: ScriptChannelResource[] = [];

  const mod = m.subModule as MaestroModule;

  for (const board of mod.boards) {
    for (const ch of board.channels) {
      if (!ch.enabled) continue;

      resources.push({
        channelId: ch.id,
        scriptChannelType: ch.isServo ? ScriptChannelType.SERVO : ScriptChannelType.GPIO,
        name: ch.channelName,
        parentModuleId: m.id,
        locationId: m.locationId,
        channel: ch,
        available: true,
      });
    }
  }

  return resources;
}

function generateHCRResources(m: UartModule): ScriptChannelResource[] {
  const ch = new UartChannel(m.id, m.id, m.name, m.moduleSubType, true);

  return [
    {
      channelId: m.id,
      scriptChannelType: ScriptChannelType.AUDIO,
      name: m.name,
      parentModuleId: m.id,
      locationId: m.locationId,
      channel: ch,
      available: true,
    },
  ];
}
