import { ModuleSubType } from '@/enums/modules/ModuleSubType';
import { ScriptChannelType } from '@/enums/scripts/scriptChannelType';
import type { GpioModule } from '@/models/controllers/modules/gpio/gpioModule';
import type { I2cChannel } from '@/models/controllers/modules/i2c/i2cChannel';
import type { I2cModule } from '@/models/controllers/modules/i2c/i2cModule';
import type { KangarooChannel } from '@/models/controllers/modules/uart/subModules/kangarooX2/kangarooChannel';
import type { MaestroModule } from '@/models/controllers/modules/uart/subModules/maestro/maestroModule';
import type { UartChannel } from '@/models/controllers/modules/uart/uartChannel';
import type { UartModule } from '@/models/controllers/modules/uart/uartModule';
import type { ScriptChannelResource } from '@/models/scripter/ScriptChannelResource';
import type { KangarooX2 } from '@/models/scripts/scripting';

export function useModuleScriptResources() {
  function getGpioScriptResources(m: GpioModule): ScriptChannelResource[] {
    const resources: ScriptChannelResource[] = [];
    for (const ch of m.channels) {
      if (!ch.enabled) continue;
      resources.push({
        channelId: ch.id,
        scriptChannelType: ScriptChannelType.GPIO,
        name: ch.channelName,
        parentModuleId: m.id,
        locationId: m.locationId,
        channel: ch,
        available: true,
      });
    }
    return resources;
  }

  function getI2cScriptResources(m: I2cModule): ScriptChannelResource[] {
    const resources: ScriptChannelResource[] = [];
    switch (m.moduleSubType) {
      case ModuleSubType.GENERIC_I2C: {
        const ch: I2cChannel = {
          id: m.id,
          parentId: m.id,
          channelName: m.name,
          enabled: true,
          moduleType: m.moduleType,
          moduleSubType: m.moduleSubType,
        };

        resources.push({
          channelId: m.id,
          scriptChannelType: ScriptChannelType.GENERIC_I2C,
          name: m.name,
          parentModuleId: m.id,
          locationId: m.locationId,
          channel: ch,
          available: true,
        });
        break;
      }
    }
    return resources;
  }

  function getUartScriptResources(m: UartModule): ScriptChannelResource[] {
    let resources: ScriptChannelResource[] = [];

    switch (m.moduleSubType) {
      case ModuleSubType.GENERIC_SERIAL:
        resources = generateGenericSerialResources(m);
        break;
      case ModuleSubType.KANGAROO:
        resources = generateKangarooResources(m);
        break;
      case ModuleSubType.MAESTRO:
        resources = generateMaestroResources(m);
        break;
      case ModuleSubType.HUMAN_CYBORG_RELATIONS_SERIAL:
        resources = generateHCRResources(m);
        break;
    }

    return resources;
  }

  function generateGenericSerialResources(m: UartModule): ScriptChannelResource[] {
    const ch: UartChannel = {
      id: m.id,
      parentId: m.id,
      channelName: m.name,
      enabled: true,
      moduleType: m.moduleType,
      moduleSubType: m.moduleSubType,
    };

    const r: ScriptChannelResource = {
      channelId: m.id,
      scriptChannelType: ScriptChannelType.GENERIC_UART,
      name: m.name,
      parentModuleId: m.id,
      locationId: m.locationId,
      channel: ch,
      available: true,
    };
    return [r];
  }

  function generateKangarooResources(m: UartModule): ScriptChannelResource[] {
    const mod = m.subModule as KangarooX2;

    const ch: KangarooChannel = {
      id: mod.id,
      parentId: m.id,
      channelName: m.name,
      enabled: true,
      moduleType: m.moduleType,
      moduleSubType: m.moduleSubType,
      ch1Name: mod.ch1Name,
      ch2Name: mod.ch2Name,
    };

    const r: ScriptChannelResource = {
      channelId: mod.id,
      scriptChannelType: ScriptChannelType.KANGAROO,
      name: m.name,
      parentModuleId: m.id,
      locationId: m.locationId,
      channel: ch,
      available: true,
    };

    return [r];
  }

  function generateMaestroResources(m: UartModule): ScriptChannelResource[] {
    const resources: ScriptChannelResource[] = [];

    const mod = m.subModule as MaestroModule;

    for (const board of mod.boards) {
      for (const ch of board.channels) {
        if (!ch.enabled) continue;

        const r: ScriptChannelResource = {
          channelId: ch.id,
          scriptChannelType: ch.isServo ? ScriptChannelType.SERVO : ScriptChannelType.GPIO,
          name: ch.channelName,
          parentModuleId: m.id,
          locationId: m.locationId,
          channel: ch,
          available: true,
        };
        resources.push(r);
      }
    }

    return resources;
  }

  function generateHCRResources(m: UartModule): ScriptChannelResource[] {
    const ch: UartChannel = {
      id: m.id,
      parentId: m.id,
      channelName: m.name,
      enabled: true,
      moduleType: m.moduleType,
      moduleSubType: m.moduleSubType,
    };

    const r: ScriptChannelResource = {
      channelId: m.id,
      scriptChannelType: ScriptChannelType.AUDIO,
      name: m.name,
      parentModuleId: m.id,
      locationId: m.locationId,
      channel: ch,
      available: true,
    };
    return [r];
  }

  return {
    getGpioScriptResources,
    getI2cScriptResources,
    getUartScriptResources,
  };
}
