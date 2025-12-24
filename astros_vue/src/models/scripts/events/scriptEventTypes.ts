import type { GenericSerialEvent } from "./generic_serial_event";
import type { GpioEvent } from "./gpio_event";
import type { HumanCyborgRelationsEvent } from "./human_cyborg_relations_event";
import type { I2cEvent } from "./i2c_event";
import type { KangarooEvent } from "./kangaroo_event";
import type { MaestroEvent } from "./maestro_event";

export type ScriptEventTypes =
  | GenericSerialEvent
  | GpioEvent
  | HumanCyborgRelationsEvent
  | I2cEvent
  | KangarooEvent
  | MaestroEvent
  | undefined;