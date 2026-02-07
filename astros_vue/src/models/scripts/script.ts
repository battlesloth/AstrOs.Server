import type { DeploymentStatus } from './deploymentStatus';
import type { ScriptChannel } from './scriptChannel';
import type { Location } from '@/enums';

export interface Script {
  id: string;
  scriptName: string;
  description: string;
  lastSaved: Date;

  deploymentStatus: Partial<Record<Location, DeploymentStatus>>;

  scriptChannels: Array<ScriptChannel>;
}
