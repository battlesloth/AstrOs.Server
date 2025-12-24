import type { BaseWsMessage } from "./baseWsMessage";
import type { UploadStatus } from "@/enums/scripts/uploadStatus";

export interface ScriptStatus extends BaseWsMessage {
  scriptId: string;
  locationId: string;
  status: UploadStatus;
  date: Date;
}