import { ControlModule } from 'src/models/control_module/control_module.js';

export class ScriptConfig {
  id: string;
  name: string;
  address: string;
  script: string;

  constructor(controller: ControlModule, script: string) {
    this.id = controller.id;
    this.name = controller.name;
    this.address = controller.address;
    this.script = script === undefined ? '' : script;
  }
}
