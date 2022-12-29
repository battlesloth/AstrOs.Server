import { ControlModule, TransmissionType } from "astros-common";
import { ScriptConfig } from "./script_config";

export class ScriptRun {

    type: TransmissionType = TransmissionType.run;
    scriptId: string;
    configs: Array<ScriptConfig>;

    constructor(scriptId: string, controllers: Array<ControlModule> ){
        this.scriptId = scriptId;
        
        this.configs = new Array<ScriptConfig>();

        controllers.forEach(ctl =>{
            const cfig = new ScriptConfig(ctl, '')
            this.configs.push(cfig);
        });
    } 
}