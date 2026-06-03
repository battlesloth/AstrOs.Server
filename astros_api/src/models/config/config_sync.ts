import { ControllerLocation } from 'src/models/control_module/controller_location.js';
import { TransmissionType } from 'src/models/enums.js';
import { ControllerConfig, createControllerConfig } from './controller_config.js';

export interface ConfigSync {
  type: TransmissionType;
  configs: Array<ControllerConfig>;
}

export function createConfigSync(locations: Array<ControllerLocation>): ConfigSync {
  return {
    type: TransmissionType.sync,
    configs: locations.map((loc) => createControllerConfig(loc)),
  };
}
