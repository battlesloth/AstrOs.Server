import { DeploymentStatus } from "./deploymentStatus";
import { ScriptChannel } from "./script_channel";

export class Script {
  id: string;
  scriptName: string;
  description: string;
  lastSaved: Date;

  deploymentStatus: Record<string, DeploymentStatus>;

  scriptChannels: Array<ScriptChannel>;

  constructor(
    id: string,
    scriptName: string,
    description: string,
    lastSaved: Date,
  ) {
    this.id = id;
    this.scriptName = scriptName;
    this.description = description;
    this.lastSaved = lastSaved;
    this.deploymentStatus = {};
    this.scriptChannels = new Array<ScriptChannel>();
  }
}
