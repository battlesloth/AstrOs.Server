import { ModuleSubType } from 'astros-common';

export class ServoTest {
  controllerAddress: string;
  controllerName: string;
  moduleSubType: ModuleSubType;
  moduleIdx: number;
  channelNumber: number;
  msValue: number;

  constructor(
    controllerAddress: string,
    controllerName: string,
    moduleSubType: ModuleSubType,
    moduleIdx: number,
    channelNumber: number,
    msValue: number,
  ) {
    this.controllerAddress = controllerAddress;
    this.controllerName = controllerName;
    this.moduleSubType = moduleSubType;
    this.moduleIdx = moduleIdx;
    this.channelNumber = channelNumber;
    this.msValue = msValue;
  }
}
