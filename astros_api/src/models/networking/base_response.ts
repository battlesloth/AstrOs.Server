import { TransmissionType } from '../enums.js';

export class BaseResponse {
  type: TransmissionType;
  success: boolean;
  message: string;

  constructor(type: TransmissionType, success: boolean, msg: string) {
    this.type = type;
    this.success = success;
    this.message = msg;
  }
}
