import { ModuleType, ModuleSubType } from "../astros_enums";
import { GenericSerialEvent } from "./events/generic_serial_event";
import { GpioEvent } from "./events/gpio_event";
import { HumanCyborgRelationsEvent } from "./events/human_cyborg_relations_event";
import { I2cEvent } from "./events/i2c_event";
import { KangarooEvent } from "./events/kangaroo_event";
import { MaestroEvent } from "./events/maestro_event";

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

export class ScriptEvent {
  scriptChannel: string;
  moduleType: ModuleType;
  moduleSubType: ModuleSubType;
  time: number;
  event: ScriptEventTypes;

  constructor(
    scriptChannel: string,
    moduleType: ModuleType,
    moduleSubType: ModuleSubType,
    time: number,
    event: ScriptEventTypes,
  ) {
    this.scriptChannel = scriptChannel;
    this.moduleType = moduleType;
    this.moduleSubType = moduleSubType;
    this.time = time;
    this.event = event;
  }
}
