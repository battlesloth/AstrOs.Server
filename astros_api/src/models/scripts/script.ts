import { LocationName } from '../constants.js';
import { DeploymentStatus } from './deployment_status.js';
import { ScriptChannel } from './script_channel.js';

export interface Script {
  id: string;
  scriptName: string;
  description: string;
  lastSaved: Date;
  durationDS: number;
  playlistCount: number;
  // Keyed by location name ('body'|'core'|'dome'); the WS update path and every
  // frontend consumer look it up by that name. A UUID key is now a type error.
  deploymentStatus: Partial<Record<LocationName, DeploymentStatus>>;
  scriptChannels: Array<ScriptChannel>;
}
