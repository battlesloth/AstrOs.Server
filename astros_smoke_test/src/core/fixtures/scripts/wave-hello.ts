import { v4 as uuidv4 } from 'uuid';
import type { ConfigSync } from '@api/models/config/config_sync.js';
import type { ScriptUpload } from '@api/models/scripts/script_upload.js';
import { getServoConfig } from '../demo-location.js';
import { buildScriptUpload, joinEvents, makeBuffer, makeServoPulse } from '../helpers.js';

// Seed at home, sweep max → min → home over ~1.7s. The leading home pulse
// normalizes the starting position so subsequent runs are always visibly
// different from the final resting state of the previous run.
export function waveHello(sync: ConfigSync, scriptId: string = uuidv4()): ScriptUpload {
  const servo = getServoConfig(1);
  const master = joinEvents([
    makeServoPulse({ channel: servo.ch, position: servo.homePos, timeTillMs: 200 }),
    makeServoPulse({ channel: servo.ch, position: servo.maxPos, timeTillMs: 500 }),
    makeServoPulse({ channel: servo.ch, position: servo.minPos, timeTillMs: 500 }),
    makeServoPulse({ channel: servo.ch, position: servo.homePos, timeTillMs: 0 }),
  ]);
  const padawan = joinEvents([makeBuffer(1200), makeBuffer(0)]);
  return buildScriptUpload(sync, { master, padawan }, scriptId);
}
