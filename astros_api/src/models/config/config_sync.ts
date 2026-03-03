import { ControllerLocation, TransmissionType } from 'astros-common';
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
