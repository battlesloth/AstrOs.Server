import { BaseResponse } from './base_response.js';

export interface StatusResponse extends BaseResponse {
  controllerId: string;
  /**
   * Hardware MAC address of the controller. Distinct from `controllerId`
   * (which is the database UUID) — the firmware flash flow uses this as
   * the per-controller key on the WS event stream
   * (`FlashJobState.controllers[].controllerId`).
   */
  controllerAddress: string;
  controllerLocation: string;
  up: boolean;
  synced: boolean;
  firmwareVersion?: string;
  firmwareCompatible: boolean;
}
