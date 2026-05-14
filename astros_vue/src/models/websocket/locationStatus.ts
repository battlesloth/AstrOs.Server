import type { BaseWsMessage } from './baseWsMessage';
import { Location } from '@/enums/modules/Location';

export interface LocationStatus extends BaseWsMessage {
  controllerLocation: Location;
  controllerId: string;
  /**
   * Hardware MAC address. Distinct from `controllerId` (database UUID).
   * The firmware flash flow uses this as the per-controller key on the WS
   * event stream, so the firmware view's MAC→location resolver learns it
   * from LocationStatus payloads. Optional because rolling deploys may
   * temporarily yield an older server that hasn't populated the field —
   * `useWebsocket.handleStatusMessage` skips the MAC mapping in that case.
   */
  controllerAddress?: string;
  up: boolean;
  synced: boolean;
  firmwareVersion?: string;
  firmwareCompatible: boolean;
}
