import type { ModuleSubType } from '@/enums/modules/ModuleSubType';
import type { ModuleType } from '@/enums/modules/ModuleType';
import type { ScriptEventTypes } from './events/scriptEventTypes';

export interface ScriptEvent {
  scriptChannel: string;
  moduleType: ModuleType;
  moduleSubType: ModuleSubType;
  time: number;
  event: ScriptEventTypes;
}
