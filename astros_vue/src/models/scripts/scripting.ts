import { ScriptChannelType } from '@/enums/scripts/scriptChannelType';
import { ModuleType } from '@/enums/modules/ModuleType';
import { ModuleSubType } from '@/enums/modules/ModuleSubType';
import {
  HumanCyborgRelationsCmd,
  HcrCommandCategory,
} from '@/enums/scripts/humanCyborgRelations';
import type { ScriptEvent } from './scriptEvent';

export interface LocationDetails {
  id: string;
  name: string;
  assigned: boolean;
}

export interface ChannelDetails {
  id: string;
  name: string;
  locationId: string;
  available: boolean;
  scriptChannelType: ScriptChannelType;
}

export interface AddChannelModalResponse {
  channels: Map<ScriptChannelType, string[]>;
}

export enum KangarooAction {
  none,
  start,
  home,
  speed,
  position,
  positionIncremental,
}

export interface KangarooEvent {
  ch1Action: KangarooAction;
  ch1Speed: number;
  ch1Position: number;
  ch2Action: KangarooAction;
  ch2Speed: number;
  ch2Position: number;
}

export interface KangarooX2 {
  id: string;
  ch1Name: string;
  ch2Name: string;
}

export interface ChannelTestModalResponse {
  controllerId: number;
  commandType: ScriptChannelType;
  command: unknown;
}

// Script Event classes
export interface GpioEvent {
  setHigh: boolean;
}

export interface MaestroEvent {
  channel: number;
  isServo: boolean;
  position: number;
  speed: number;
  acceleration: number;
}

export interface I2cEvent {
  message: string;
}

export interface HcrCommand {
  id: string;
  category: HcrCommandCategory;
  command: HumanCyborgRelationsCmd;
  valueA: number;
  valueB: number;
}

export interface HumanCyborgRelationsEvent {
  commands: Array<HcrCommand>;
}

export interface GenericSerialEvent {
  value: string;
}

export type ScriptEventTypes =
  | GpioEvent
  | MaestroEvent
  | HumanCyborgRelationsEvent
  | I2cEvent
  | KangarooEvent
  | GenericSerialEvent
  | undefined;


export interface ScriptEventModalResponse {
  scriptEvent: ScriptEvent;
  time: number;
}
