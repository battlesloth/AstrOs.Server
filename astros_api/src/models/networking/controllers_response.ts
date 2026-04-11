import { ControlModule } from 'src/models/control_module/control_module.js';
import { BaseResponse } from './base_response.js';

export interface ControllersResponse extends BaseResponse {
  controllers: Array<ControlModule>;
}
