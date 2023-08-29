import { AudioModule } from "./audio_module";
import { ControlModule } from "./control_module";

export class ModuleCollection {
    audioModule?: AudioModule;
    coreModule?: ControlModule;
    domeModule?: ControlModule;
    bodyModule?: ControlModule;

    constructor(audioModule?: AudioModule, coreModule?: ControlModule, domeModule?: ControlModule, bodyModule?: ControlModule) {
        this.audioModule = audioModule;
        this.coreModule = coreModule;
        this.domeModule = domeModule;
        this.bodyModule = bodyModule;
    }
}