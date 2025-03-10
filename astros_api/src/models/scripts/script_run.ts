import { ControllerLocation, TransmissionType } from "astros-common";
import { ScriptConfig } from "./script_config.js";

export class ScriptRun {
  type: TransmissionType = TransmissionType.run;
  scriptId: string;
  configs: Array<ScriptConfig>;

  constructor(scriptId: string, locations: Array<ControllerLocation>) {
    this.scriptId = scriptId;

    this.configs = new Array<ScriptConfig>();

    locations.forEach((loc) => {
      const cfig = new ScriptConfig(loc.controller, "");
      this.configs.push(cfig);
    });
  }
}
