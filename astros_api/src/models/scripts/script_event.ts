import { ModuleType, ModuleSubType } from 'src/models/enums.js';
import { GenericSerialEvent } from './events/generic_serial_event.js';
import { GpioEvent } from './events/gpio_event.js';
import { HumanCyborgRelationsEvent } from './events/human_cyborg_relations_event.js';
import { I2cEvent } from './events/i2c_event.js';
import { KangarooEvent } from './events/kangaroo_event.js';
import { MaestroEvent } from './events/maestro_event.js';
import { RandomGpioEvent } from './events/random_gpio_event.js';
import { RandomMaestroEvent } from './events/random_maestro_event.js';

export type ScriptEventTypes =
  | GenericSerialEvent
  | GpioEvent
  | HumanCyborgRelationsEvent
  | I2cEvent
  | KangarooEvent
  | MaestroEvent
  | RandomGpioEvent
  | RandomMaestroEvent
  | undefined;

const RANDOM_SPAN_SUB_TYPES = [ModuleSubType.genericGpio, ModuleSubType.maestro] as const;
type RandomSpanSubType = (typeof RANDOM_SPAN_SUB_TYPES)[number];

// The sub-types with a random span payload. The repository refuses to save a
// span on any other sub-type and leaves one it finds out of the loaded script.
export function supportsRandomSpan(
  moduleSubType: ModuleSubType,
): moduleSubType is RandomSpanSubType {
  return (RANDOM_SPAN_SUB_TYPES as readonly ModuleSubType[]).includes(moduleSubType);
}

// isSpan marks a row with an end_time: GPIO and Maestro parse as their Random*
// payload, other sub-types throw (readScriptEvents leaves those out first).
export function moduleSubTypeToScriptEventTypes(
  moduleSubType: ModuleSubType,
  json: string,
  isSpan = false,
): ScriptEventTypes {
  if (isSpan) {
    if (!supportsRandomSpan(moduleSubType)) {
      throw new Error(`Random span not supported for moduleSubType: ${moduleSubType}`);
    }
    switch (moduleSubType) {
      case ModuleSubType.genericGpio:
        return JSON.parse(json) as RandomGpioEvent;
      case ModuleSubType.maestro:
        return JSON.parse(json) as RandomMaestroEvent;
      default: {
        // A sub-type added to RANDOM_SPAN_SUB_TYPES without a case here fails to compile.
        const unhandled: never = moduleSubType;
        throw new Error(`Random span not supported for moduleSubType: ${unhandled}`);
      }
    }
  }

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
  // Seconds, like time. null for a point event; a value marks a random span
  // from time to endTime.
  endTime: number | null;
  event: ScriptEventTypes;
}
