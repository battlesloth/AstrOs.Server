import { ControllerLocation } from '../control_module/controller_location.js';
import { TransmissionType } from '../enums.js';
import { ControllerConfig } from './controller_config.js';

export class ConfigSync {
  type: TransmissionType = TransmissionType.sync;
  configs: Array<ControllerConfig>;

  constructor(locations: Array<ControllerLocation>) {
    this.configs = new Array<ControllerConfig>();

    for (const location of locations) {
      this.configs.push(new ControllerConfig(location));
    }
  }
}
