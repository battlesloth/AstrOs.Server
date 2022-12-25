import { ControllerType, TransmissionType } from "astros-common";
import { ControllerEndpoint } from "../controller_endpoint";

export class ScriptUpload {

    type: TransmissionType = TransmissionType.script;
    scriptId: string;
    scripts: Map<ControllerType, string>;
    endpoints: Array<ControllerEndpoint>;

    constructor(scriptId: string, scripts: Map<ControllerType, string>, endpoints: Array<ControllerEndpoint>){
        this.scriptId = scriptId;
        this.scripts = scripts;
        this.endpoints = endpoints;
    } 
}