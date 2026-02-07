import type { GenericSerialEvent } from './genericSerialEvent';
import type { GpioEvent } from './gpioEvent';
import type { HumanCyborgRelationsEvent } from './humanCyborgRelationsEvent';
import type { I2cEvent } from './i2cEvent';
import type { KangarooEvent } from './kangarooEvent';
import type { MaestroEvent } from './maestroEvent';

export type ScriptEventTypes =
  | GenericSerialEvent
  | GpioEvent
  | HumanCyborgRelationsEvent
  | I2cEvent
  | KangarooEvent
  | MaestroEvent
  | undefined;
