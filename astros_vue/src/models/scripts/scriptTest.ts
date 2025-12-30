import { TransmissionStatus } from '@/enums/transmissionStatus';

export interface DeploymentLocation {
  id: string;
  name: string;
}

export interface ScriptResponse {
  type: number;
  locationId: string;
  status: TransmissionStatus;
}

export const AstrOsConstants = {
  CORE: 'core',
  DOME: 'dome',
  BODY: 'body',
} as const;
