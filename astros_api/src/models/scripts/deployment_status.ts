import { UploadStatus } from '../enums.js';

export interface DeploymentStatus {
  date: Date;
  value: UploadStatus;
  locationName: string;
}
