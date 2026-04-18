import { v4 as uuidv4 } from 'uuid';
import type { ConfigSync } from '@api/models/config/config_sync.js';
import type { ScriptUpload } from '@api/models/scripts/script_upload.js';
import { BENCH } from '../demo-location.js';
import { buildScriptUpload, joinEvents, makeBuffer, makeServoPulse } from '../helpers.js';

// One servo on master channel 1 sweeps max → min → home over ~1.5s.
export function waveHello(sync: ConfigSync, scriptId: string = uuidv4()): ScriptUpload {
  const master = joinEvents([
    makeServoPulse({ channel: 1, position: BENCH.servoMaxPos, timeTillMs: 500 }),
    makeServoPulse({ channel: 1, position: BENCH.servoMinPos, timeTillMs: 500 }),
    makeServoPulse({ channel: 1, position: BENCH.servoHomePos, timeTillMs: 0 }),
  ]);
  const padawan = joinEvents([makeBuffer(1000), makeBuffer(0)]);
  return buildScriptUpload(sync, { master, padawan }, scriptId);
}
