import { UploadStatus } from 'src/models/enums.js';

export interface DeploymentStatus {
  date: Date;
  value: UploadStatus;
  locationName: string;
}
