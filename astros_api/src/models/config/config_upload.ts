import { ControlModule, TransmissionType } from "astros-common";
import { ControllerConfig } from "./controller_config";

export class ScriptUpload {

    type: TransmissionType = TransmissionType.sync;
    configs: Array<ControllerConfig>;

    constructor(controllers: Array<ControlModule>){
        
        this.configs = new Array<ControllerConfig>();

        controllers.forEach(ctl =>{
            this.configs.push(new ControllerConfig(ctl));
        });
    } 
}