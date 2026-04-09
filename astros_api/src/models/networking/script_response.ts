import { BaseResponse } from './base_response.js';
import { TransmissionStatus } from '../enums.js';

export interface ScriptResponse extends BaseResponse {
  scriptId: string;
  locationId: string;
  status: TransmissionStatus;
  date: Date;
}
