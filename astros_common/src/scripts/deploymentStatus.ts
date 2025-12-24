import { UploadStatus } from "../astros_enums";

export class DeploymentStatus {
  date: Date;
  value: UploadStatus;
  locationName: string;

  constructor(date: Date, value: UploadStatus, locationName: string) {
    this.date = date;
    this.value = value;
    this.locationName = locationName;
  }
}
