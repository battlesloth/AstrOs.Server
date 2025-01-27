import { ControllerLocation, TransmissionType } from "astros-common";
import { ScriptConfig } from "./script_config";

export class ScriptUpload {
  type: TransmissionType = TransmissionType.script;
  scriptId: string;
  configs: Array<ScriptConfig>;

  constructor(
    scriptId: string,
    scripts: Map<string, string>,
    locations: Array<ControllerLocation>,
  ) {
    this.scriptId = scriptId;

    this.configs = new Array<ScriptConfig>();

    locations.forEach((loc) => {
      if (loc.controller.address != "") {
        const cfig = new ScriptConfig(
          loc.controller,
          scripts.get(loc.id) || "",
        );
        this.configs.push(cfig);
      }
    });
  }
}
