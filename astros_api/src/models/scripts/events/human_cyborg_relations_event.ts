import { HcrCommandCategory, HumanCyborgRelationsCmd } from '../../enums.js';

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
