import { ControlModule } from 'src/models/control_module/control_module.js';

export interface ScriptConfig {
  id: string;
  name: string;
  address: string;
  script: string;
}

export function createScriptConfig(controller: ControlModule, script: string): ScriptConfig {
  return {
    id: controller.id,
    name: controller.name,
    address: controller.address,
    script: script ?? '',
  };
}
