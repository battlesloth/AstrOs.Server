import type { ScriptChannelType } from "@/enums";

export interface ChannelTestModalResponse {
  controllerId: number;
  commandType: ScriptChannelType;
  command: unknown;
}