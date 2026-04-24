import { v4 as uuidv4 } from 'uuid';
import type { ConfigSync } from '@api/models/config/config_sync.js';
import type { ScriptUpload } from '@api/models/scripts/script_upload.js';
import { BENCH, getServoConfig } from '../demo-location.js';
import {
  buildScriptUpload,
  joinEvents,
  makeBuffer,
  makeGpioToggle,
  makeServoPulse,
} from '../helpers.js';

// Master servo sweeps home → max → home while padawan pulses the relay LED,
// concurrent, ~2.2s total. Seed at home for deterministic starting state.
export function multiChannel(sync: ConfigSync, scriptId: string = uuidv4()): ScriptUpload {
  const servo = getServoConfig(1);
  const master = joinEvents([
    makeServoPulse({ channel: servo.ch, position: servo.homePos, timeTillMs: 200 }),
    makeServoPulse({ channel: servo.ch, position: servo.maxPos, timeTillMs: 1000 }),
    makeServoPulse({ channel: servo.ch, position: servo.homePos, timeTillMs: 0 }),
    makeBuffer(1000),
    makeBuffer(0),
  ]);
  const padawan = joinEvents([
    makeBuffer(200),
    makeGpioToggle({ channel: BENCH.padawanGpioRelayChannel, durMs: 500 }),
    makeBuffer(1500),
    makeBuffer(0),
  ]);
  return buildScriptUpload(sync, { master, padawan }, scriptId);
}
