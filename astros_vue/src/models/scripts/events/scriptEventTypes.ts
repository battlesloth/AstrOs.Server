import type { GenericSerialEvent } from './genericSerialEvent';
import type { GpioEvent } from './gpioEvent';
import type { HumanCyborgRelationsEvent } from './humanCyborgRelationsEvent';
import type { I2cEvent } from './i2cEvent';
import type { KangarooEvent } from './kangarooEvent';
import type { MaestroEvent } from './maestroEvent';
import type { RandomGpioEvent } from './randomGpioEvent';
import type { RandomMaestroEvent } from './randomMaestroEvent';

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
