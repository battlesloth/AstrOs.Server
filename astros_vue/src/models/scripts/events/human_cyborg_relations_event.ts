import {
  HcrCommandCategory,
  HumanCyborgRelationsCmd,
} from "@/enums/scripts/humanCyborgRelations";

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
