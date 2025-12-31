import type { ScriptChannelValue } from './scriptChannelValue';

export interface AddChannelModalResponse {
  channels: Map<ScriptChannelValue, string[]>;
}