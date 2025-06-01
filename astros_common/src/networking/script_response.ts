import { BaseResponse } from "./base_response";
import { TransmissionStatus, TransmissionType } from "../astros_enums";

export class ScriptResponse extends BaseResponse {
  scriptId: string;
  locationId: string;
  status: TransmissionStatus;
  date: Date;

  constructor(
    scriptId: string,
    locationId: string,
    status: TransmissionStatus,
    date: Date,
  ) {
    super(TransmissionType.script, true, "");

    this.scriptId = scriptId;
    this.locationId = locationId;
    this.status = status;
    this.date = date;
  }
}
