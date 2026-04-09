import { DirectCommnandType } from 'src/models/enums.js';

export interface DirectCommand {
  type: DirectCommnandType;
  controllerId: number;
  command: unknown;
}
