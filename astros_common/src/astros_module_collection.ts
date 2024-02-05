
import { ControlModule } from "./control_module/control_module";

export class AstrOsModuleCollection {
    coreModule?: ControlModule;
    domeModule?: ControlModule;
    bodyModule?: ControlModule;

    constructor(coreModule?: ControlModule, domeModule?: ControlModule, bodyModule?: ControlModule) {
        this.coreModule = coreModule;
        this.domeModule = domeModule;
        this.bodyModule = bodyModule;
    }
}