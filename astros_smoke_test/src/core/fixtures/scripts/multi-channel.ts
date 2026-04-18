import { v4 as uuidv4 } from 'uuid';
import type { ConfigSync } from '@api/models/config/config_sync.js';
import type { ScriptUpload } from '@api/models/scripts/script_upload.js';
import { BENCH } from '../demo-location.js';
import {
  buildScriptUpload,
  joinEvents,
  makeBuffer,
  makeGpioToggle,
  makeServoPulse,
} from '../helpers.js';

// Master servo sweeps while padawan pulses the relay LED, concurrent, ~2s total.
export function multiChannel(sync: ConfigSync, scriptId: string = uuidv4()): ScriptUpload {
  const master = joinEvents([
    makeServoPulse({ channel: 1, position: BENCH.servoMaxPos, timeTillMs: 1000 }),
    makeServoPulse({ channel: 1, position: BENCH.servoHomePos, timeTillMs: 0 }),
    makeBuffer(1000),
    makeBuffer(0),
  ]);
  const padawan = joinEvents([
    makeGpioToggle({ channel: BENCH.padawanGpioRelayChannel, durMs: 500 }),
    makeBuffer(1500),
    makeBuffer(0),
  ]);
  return buildScriptUpload(sync, { master, padawan }, scriptId);
}
