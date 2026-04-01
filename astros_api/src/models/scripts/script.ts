import { DeploymentStatus } from './deployment_status.js';
import { ScriptChannel } from './script_channel.js';

export class Script {
  id: string;
  scriptName: string;
  description: string;
  lastSaved: Date;
  durationDS: number;
  playlistCount: number;

  deploymentStatus: Record<string, DeploymentStatus>;

  scriptChannels: Array<ScriptChannel>;

  constructor(
    id: string,
    scriptName: string,
    description: string,
    lastSaved: Date,
    durationDS: number,
    playlistCount = 0,
  ) {
    this.id = id;
    this.scriptName = scriptName;
    this.description = description;
    this.lastSaved = lastSaved;
    this.durationDS = durationDS;
    this.playlistCount = playlistCount;
    this.deploymentStatus = {};
    this.scriptChannels = new Array<ScriptChannel>();
  }
}
