import { ModuleType, ModuleSubType } from "../astros_enums";

export class ScriptEvent {
  scriptChannel: string;
  moduleType: ModuleType;
  moduleSubType: ModuleSubType;
  time: number;
  dataJson: string;

  constructor(
    scriptChannel: string,
    moduleType: ModuleType,
    moduleSubType: ModuleSubType,
    time: number,
    dataJson: string,
  ) {
    this.scriptChannel = scriptChannel;
    this.moduleType = moduleType;
    this.moduleSubType = moduleSubType;
    this.time = time;
    this.dataJson = dataJson;
  }
}
