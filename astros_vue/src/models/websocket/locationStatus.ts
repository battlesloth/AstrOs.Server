import type { BaseWsMessage } from './baseWsMessage';
import { Location } from '@/enums/modules/Location';

export interface LocationStatus extends BaseWsMessage {
  controllerLocation: Location;
  controllerId: string;
  up: boolean;
  synced: boolean;
}
