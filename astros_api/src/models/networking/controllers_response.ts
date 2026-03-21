import { TransmissionType } from '../enums.js';
import { ControlModule } from '../control_module/control_module.js';
import { BaseResponse } from './base_response.js';

export class ControllersResponse extends BaseResponse {
  controllers: Array<ControlModule>;

  constructor(success: boolean, controllers: Array<ControlModule>) {
    super(TransmissionType.controllers, success, '');
    this.controllers = controllers;
  }
}
