import { BaseResponse } from './base_response.js';
import { TransmissionStatus } from 'src/models/enums.js';

export interface ScriptResponse extends BaseResponse {
  scriptId: string;
  locationId: string;
  status: TransmissionStatus;
  date: Date;
}
