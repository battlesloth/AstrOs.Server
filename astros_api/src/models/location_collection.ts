import { ControllerLocation } from './control_module/controller_location.js';

export interface LocationCollection {
  coreModule?: ControllerLocation;
  domeModule?: ControllerLocation;
  bodyModule?: ControllerLocation;
}
