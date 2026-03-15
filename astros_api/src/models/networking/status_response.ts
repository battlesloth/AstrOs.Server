import { BaseResponse } from './base_response.js';
import { TransmissionType } from '../enums.js';

export class StatusResponse extends BaseResponse {
  controllerId: string;
  controllerLocation: string;
  up: boolean;
  synced: boolean;

  constructor(controllerId: string, controllerLocation: string, up: boolean, synced: boolean) {
    super(TransmissionType.status, true, '');

    this.controllerId = controllerId;
    this.controllerLocation = controllerLocation;
    this.up = up;
    this.synced = synced;
  }
}
