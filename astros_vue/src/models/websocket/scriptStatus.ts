import type { BaseWsMessage } from './baseWsMessage';
import type { UploadStatus } from '@/enums/scripts/uploadStatus';
import type { Location } from '@/enums';

export interface ScriptStatus extends BaseWsMessage {
  scriptId: string;
  locationId: Location;
  status: UploadStatus;
  date: Date;
}
