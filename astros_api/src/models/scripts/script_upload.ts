import { ControlModule, TransmissionType } from "astros-common";
import { ScriptConfig } from "./script_config";

export class ScriptUpload {

    type: TransmissionType = TransmissionType.script;
    scriptId: string;
    configs: Array<ScriptConfig>;

    constructor(scriptId: string, scripts: Map<number, string>, controllers: Array<ControlModule>) {
        this.scriptId = scriptId;

        this.configs = new Array<ScriptConfig>();

        controllers.forEach(ctl => {
            const cfig = new ScriptConfig(ctl, scripts.get(ctl.id) || "")
            this.configs.push(cfig);
        });
    }
}