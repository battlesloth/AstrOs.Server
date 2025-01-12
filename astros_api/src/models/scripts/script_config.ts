import { ControlModule } from "astros-common";

export class ScriptConfig {
  id: number;
  name: string;
  address: string;
  script: string;

  constructor(controller: ControlModule, script: string) {
    this.id = controller.id;
    this.name = controller.name;
    this.address = controller.address;
    this.script = script === undefined ? "" : script;
  }
}
