import { ControllerEndpoint } from "../controller_endpoint";

export class ScriptUpload {

    scriptId: string;
    script: string;
    endpoints: Array<ControllerEndpoint>;


    constructor(scriptId: string, script: string, endpoints: Array<ControllerEndpoint>){
        this.scriptId = scriptId;
        this.script = script;
        this.endpoints = endpoints;
    } 
}