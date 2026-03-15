import { DeploymentStatus } from './deployment_status.js';
import { ScriptChannel } from './script_channel.js';

export class Script {
  id: string;
  scriptName: string;
  description: string;
  lastSaved: Date;

  deploymentStatus: Record<string, DeploymentStatus>;

  scriptChannels: Array<ScriptChannel>;

  constructor(id: string, scriptName: string, description: string, lastSaved: Date) {
    this.id = id;
    this.scriptName = scriptName;
    this.description = description;
    this.lastSaved = lastSaved;
    this.deploymentStatus = {};
    this.scriptChannels = new Array<ScriptChannel>();
  }
}
