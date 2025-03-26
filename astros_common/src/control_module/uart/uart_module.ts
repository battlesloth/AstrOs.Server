import {
  ModuleSubType,
  ModuleType,
  ScriptChannelType,
} from "../../astros_enums";
import { ScriptChannelResource } from "../../scripts/script_channel_resource";
import { BaseModule } from "../base_module";
import { KangarooX2 } from "./sub_modules/kangarooX2/kangaroo_x2";
import { KangarooX2Channel } from "./sub_modules/kangarooX2/kangaroo_x2_channel";
import { MaestroModule } from "./sub_modules/maestro/maestro_module";
import { UartChannel } from "./uart_channel";

export class UartModule extends BaseModule {
  uartChannel: number;
  baudRate: number;
  subModule: unknown;

  constructor(
    id: string,
    name: string,
    locationId: string,
    subType: ModuleSubType,
    uartChannel: number,
    baudRate: number,
  ) {
    super(id, name, locationId, ModuleType.uart, subType);
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

function generateGenericSerialResources(
  m: UartModule,
): ScriptChannelResource[] {
  const ch = new UartChannel(m.id, m.id, m.name, m.moduleSubType, true);

  return [
    new ScriptChannelResource(
      m.id,
      ScriptChannelType.GENERIC_UART,
      m.name,
      m.id,
      m.locationId,
      ch,
    ),
  ];
}

function generateKangarooResources(m: UartModule): ScriptChannelResource[] {
  const mod = m.subModule as KangarooX2;

  const ch = new KangarooX2Channel(
    mod.id,
    m.id,
    m.name,
    mod.ch1Name,
    mod.ch2Name,
  );

  return [
    new ScriptChannelResource(
      mod.id,
      ScriptChannelType.KANGAROO,
      m.name,
      m.id,
      m.locationId,
      ch,
    ),
  ];
}

function generateMaestroResources(m: UartModule): ScriptChannelResource[] {
  const resources: ScriptChannelResource[] = [];

  const mod = m.subModule as MaestroModule;

  for (const board of mod.boards) {
    for (const ch of board.channels) {
      if (!ch.enabled) continue;

      resources.push(
        new ScriptChannelResource(
          ch.id,
          ch.isServo ? ScriptChannelType.SERVO : ScriptChannelType.GPIO,
          ch.channelName,
          m.id,
          m.locationId,
          ch,
        ),
      );
    }
  }

  return resources;
}

function generateHCRResources(m: UartModule): ScriptChannelResource[] {
  const ch = new UartChannel(m.id, m.id, m.name, m.moduleSubType, true);

  return [
    new ScriptChannelResource(
      m.id,
      ScriptChannelType.AUDIO,
      m.name,
      m.id,
      m.locationId,
      ch,
    ),
  ];
}
