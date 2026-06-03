import { TransmissionType } from 'src/models/enums.js';

export interface BaseResponse {
  type: TransmissionType;
  success: boolean;
  message: string;
}
