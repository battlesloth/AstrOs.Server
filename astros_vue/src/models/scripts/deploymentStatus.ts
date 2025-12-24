import type { UploadStatus } from "@/enums/scripts/uploadStatus";

export interface DeploymentStatus {
  date: Date;
  value: UploadStatus;
}