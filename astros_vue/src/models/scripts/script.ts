import type { DeploymentStatus } from "./deploymentStatus";
import type { ScriptChannel } from "./scriptChannel";

export interface Script {
  id: string;
  scriptName: string;
  description: string;
  lastSaved: Date;

  deploymentStatus: Record<string, DeploymentStatus>;

  scriptChannels: Array<ScriptChannel>;
}