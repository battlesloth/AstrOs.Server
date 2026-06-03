import { v4 as uuidv4 } from 'uuid';
import { TransmissionType } from '@api/models/enums.js';
import type { ConfigSync } from '@api/models/config/config_sync.js';
import type { ScriptConfig } from '@api/models/scripts/script_config.js';
import type { ScriptRun } from '@api/models/scripts/script_run.js';
import type { ScriptUpload } from '@api/models/scripts/script_upload.js';
import { BENCH, isMasterConfig } from './demo-location.js';

// Maestro event: `1|timeTill|maestroIdx|channel|position|speed|accel`
export function makeServoPulse(opts: {
  channel: number;
  position: number;
  timeTillMs?: number;
  maestroIdx?: number;
  speed?: number;
  accel?: number;
}): string {
  const {
    channel,
    position,
    timeTillMs = 0,
    maestroIdx = BENCH.maestroIdx,
    speed = 0,
    accel = 0,
  } = opts;
  return `1|${Math.round(timeTillMs)}|${maestroIdx}|${channel}|${position}|${speed}|${accel}`;
}

// GPIO toggle: high immediately, low after durMs. Produces two events.
export function makeGpioToggle(opts: { channel: number; durMs: number }): string {
  const { channel, durMs } = opts;
  return [`5|${Math.round(durMs)}|${channel}|1`, `5|0|${channel}|0`].join(';');
}

// Buffer event: `0|timeTill|0` — firmware treats as idle filler.
export function makeBuffer(timeTillMs: number): string {
  return `0|${Math.round(timeTillMs)}|0`;
}

export function joinEvents(events: string[]): string {
  return events.filter((e) => e.length > 0).join(';');
}

export interface ScriptAssignments {
  master: string;
  padawan: string;
}

export function buildScriptConfigs(sync: ConfigSync, scripts: ScriptAssignments): ScriptConfig[] {
  return sync.configs.map((c) => ({
    id: c.id,
    name: c.name,
    address: c.address,
    script: isMasterConfig(c) ? scripts.master : scripts.padawan,
  }));
}

export function buildScriptUpload(
  sync: ConfigSync,
  scripts: ScriptAssignments,
  scriptId: string = uuidv4(),
): ScriptUpload {
  return {
    type: TransmissionType.script,
    scriptId,
    configs: buildScriptConfigs(sync, scripts),
  };
}

export function buildScriptRun(sync: ConfigSync, scriptId: string): ScriptRun {
  return {
    type: TransmissionType.run,
    scriptId,
    configs: sync.configs.map((c) => ({
      id: c.id,
      name: c.name,
      address: c.address,
      script: '',
    })),
  };
}
