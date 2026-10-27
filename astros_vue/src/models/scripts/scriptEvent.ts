import type { ModuleSubType } from '@/enums/modules/ModuleSubType';
import type { ModuleType } from '@/enums/modules/ModuleType';
import type { ScriptEventTypes } from './events/scriptEventTypes';

export interface ScriptEvent {
  id: string;
  scriptChannel: string;
  moduleType: ModuleType;
  moduleSubType: ModuleSubType;
  time: number;
  // Seconds, like time. null for a point event; a value marks a random span
  // from time to endTime.
  endTime: number | null;
  event: ScriptEventTypes;
}
