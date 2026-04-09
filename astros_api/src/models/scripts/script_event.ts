import { ModuleType, ModuleSubType } from 'src/models/enums.js';
import { GenericSerialEvent } from './events/generic_serial_event.js';
import { GpioEvent } from './events/gpio_event.js';
import { HumanCyborgRelationsEvent } from './events/human_cyborg_relations_event.js';
import { I2cEvent } from './events/i2c_event.js';
import { KangarooEvent } from './events/kangaroo_event.js';
import { MaestroEvent } from './events/maestro_event.js';

export type ScriptEventTypes =
  | GenericSerialEvent
  | GpioEvent
  | HumanCyborgRelationsEvent
  | I2cEvent
  | KangarooEvent
  | MaestroEvent
  | undefined;

export function moduleSubTypeToScriptEventTypes(
  moduleSubType: ModuleSubType,
  json: string,
): ScriptEventTypes {
  switch (moduleSubType) {
    case ModuleSubType.genericSerial:
      return JSON.parse(json) as GenericSerialEvent;
    case ModuleSubType.genericGpio:
      return JSON.parse(json) as GpioEvent;
    case ModuleSubType.humanCyborgRelationsI2C:
    case ModuleSubType.humanCyborgRelationsSerial:
      return JSON.parse(json) as HumanCyborgRelationsEvent;
    case ModuleSubType.genericI2C:
      return JSON.parse(json) as I2cEvent;
    case ModuleSubType.kangaroo:
      return JSON.parse(json) as KangarooEvent;
    case ModuleSubType.maestro:
      return JSON.parse(json) as MaestroEvent;
    default:
      throw new Error(`Unknown moduleSubType: ${moduleSubType}`);
  }
}

export interface ScriptEvent {
  id: string;
  scriptChannel: string;
  moduleType: ModuleType;
  moduleSubType: ModuleSubType;
  time: number;
  event: ScriptEventTypes;
}
