import { BaseResponse } from './base_response.js';

export interface StatusResponse extends BaseResponse {
  controllerId: string;
  controllerLocation: string;
  up: boolean;
  synced: boolean;
  firmwareVersion?: string;
  firmwareCompatible: boolean;
}
