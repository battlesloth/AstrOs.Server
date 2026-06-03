import { TransmissionType } from 'src/models/enums.js';
import { ControllerLocation } from 'src/models/control_module/controller_location.js';
import { ScriptConfig, createScriptConfig } from './script_config.js';

export interface ScriptUpload {
  type: TransmissionType;
  scriptId: string;
  configs: Array<ScriptConfig>;
}

export function createScriptUpload(
  scriptId: string,
  scripts: Map<string, string>,
  locations: Array<ControllerLocation>,
): ScriptUpload {
  return {
    type: TransmissionType.script,
    scriptId,
    configs: locations
      .filter((loc) => loc.controller.address !== '')
      .map((loc) => createScriptConfig(loc.controller, scripts.get(loc.id) || '')),
  };
}
