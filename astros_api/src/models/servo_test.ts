import { ModuleSubType } from 'src/models/index.js';

export interface ServoTest {
  controllerAddress: string;
  controllerName: string;
  moduleSubType: ModuleSubType;
  moduleIdx: number;
  channelNumber: number;
  msValue: number;
}
