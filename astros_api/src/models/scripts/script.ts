import { DeploymentStatus } from './deployment_status.js';
import { ScriptChannel } from './script_channel.js';

export interface Script {
  id: string;
  scriptName: string;
  description: string;
  lastSaved: Date;
  durationDS: number;
  playlistCount: number;
  deploymentStatus: Record<string, DeploymentStatus>;
  scriptChannels: Array<ScriptChannel>;
}
