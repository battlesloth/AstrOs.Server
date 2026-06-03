import { TransmissionType } from 'src/models/enums.js';
import { ControllerLocation } from 'src/models/control_module/controller_location.js';
import { ScriptConfig, createScriptConfig } from './script_config.js';

export interface ScriptRun {
  type: TransmissionType;
  scriptId: string;
  configs: Array<ScriptConfig>;
}

export function createScriptRun(scriptId: string, locations: Array<ControllerLocation>): ScriptRun {
  return {
    type: TransmissionType.run,
    scriptId,
    configs: locations.map((loc) => createScriptConfig(loc.controller, '')),
  };
}
