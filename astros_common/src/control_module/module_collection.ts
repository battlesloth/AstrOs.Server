
import { ControlModule } from "./control_module";

export class ModuleCollection {
    coreModule?: ControlModule;
    domeModule?: ControlModule;
    bodyModule?: ControlModule;

    constructor(coreModule?: ControlModule, domeModule?: ControlModule, bodyModule?: ControlModule) {
        this.coreModule = coreModule;
        this.domeModule = domeModule;
        this.bodyModule = bodyModule;
    }
}