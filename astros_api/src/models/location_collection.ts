import { ControllerLocation } from './control_module/controller_location.js';

export class LocationCollection {
  coreModule?: ControllerLocation;
  domeModule?: ControllerLocation;
  bodyModule?: ControllerLocation;

  constructor(
    coreModule?: ControllerLocation,
    domeModule?: ControllerLocation,
    bodyModule?: ControllerLocation,
  ) {
    this.coreModule = coreModule;
    this.domeModule = domeModule;
    this.bodyModule = bodyModule;
  }
}
