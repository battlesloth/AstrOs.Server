import { ControlModule } from "astros-common";

export class ScriptConfig {
    id: number;
    ip: string;
    script: string;

    constructor(controller: ControlModule, script: string){
        this.id = controller.id;
        this.ip = controller.ipAddress;
        this.script = script === undefined ? '' : script;
    }
}