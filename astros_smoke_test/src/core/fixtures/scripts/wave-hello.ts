import { v4 as uuidv4 } from 'uuid';
import type { ConfigSync } from '@api/models/config/config_sync.js';
import type { ScriptUpload } from '@api/models/scripts/script_upload.js';
import { getServoConfig } from '../demo-location.js';
import { buildScriptUpload, joinEvents, makeBuffer, makeServoPulse } from '../helpers.js';

// One servo on master channel 1 sweeps max → min → home over ~1.5s.
export function waveHello(sync: ConfigSync, scriptId: string = uuidv4()): ScriptUpload {
  const servo = getServoConfig(1);
  const master = joinEvents([
    makeServoPulse({ channel: servo.ch, position: servo.maxPos, timeTillMs: 500 }),
    makeServoPulse({ channel: servo.ch, position: servo.minPos, timeTillMs: 500 }),
    makeServoPulse({ channel: servo.ch, position: servo.homePos, timeTillMs: 0 }),
  ]);
  const padawan = joinEvents([makeBuffer(1000), makeBuffer(0)]);
  return buildScriptUpload(sync, { master, padawan }, scriptId);
}
