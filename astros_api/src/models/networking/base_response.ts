import { TransmissionType } from '../enums.js';

export interface BaseResponse {
  type: TransmissionType;
  success: boolean;
  message: string;
}
