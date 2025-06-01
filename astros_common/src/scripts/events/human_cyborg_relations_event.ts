import {
  HcrCommandCategory,
  HumanCyborgRelationsCmd,
} from "../../astros_enums";

export class HcrCommand {
  id: string;
  category: HcrCommandCategory;
  command: HumanCyborgRelationsCmd;
  valueA: number;
  valueB: number;

  constructor(
    id: string,
    category: HcrCommandCategory,
    command: HumanCyborgRelationsCmd,
    valueA: number,
    valueB: number,
  ) {
    this.id = id;
    this.category = category;
    this.command = command;
    this.valueA = valueA;
    this.valueB = valueB;
  }
}

export class HumanCyborgRelationsEvent {
  commands: Array<HcrCommand>;

  constructor(commands: Array<HcrCommand>) {
    this.commands = commands;
  }
}
