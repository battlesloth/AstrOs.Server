import { DirectCommnandType } from '../enums.js';

export interface DirectCommand {
  type: DirectCommnandType;
  controllerId: number;
  command: unknown;
}
