import { DirectCommnandType } from '../enums.js';

export class DirectCommand {
  type: DirectCommnandType;
  controllerId: number;
  command: unknown;

  constructor(type: DirectCommnandType, controllerId: number, command: unknown) {
    this.type = type;
    this.controllerId = controllerId;
    this.command = command;
  }
}
