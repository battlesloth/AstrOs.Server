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

// ~6s script: servo sweeps four times while padawan LED pulses twice.
// Used by panic-drill so the panic arrives mid-run.
export function longRunner(sync: ConfigSync, scriptId: string = uuidv4()): ScriptUpload {
  const servo = getServoConfig(1);
  const master = joinEvents([
    makeServoPulse({ channel: servo.ch, position: servo.maxPos, timeTillMs: 750 }),
    makeServoPulse({ channel: servo.ch, position: servo.minPos, timeTillMs: 750 }),
    makeServoPulse({ channel: servo.ch, position: servo.maxPos, timeTillMs: 750 }),
    makeServoPulse({ channel: servo.ch, position: servo.minPos, timeTillMs: 750 }),
    makeServoPulse({ channel: servo.ch, position: servo.maxPos, timeTillMs: 750 }),
    makeServoPulse({ channel: servo.ch, position: servo.minPos, timeTillMs: 750 }),
    makeServoPulse({ channel: servo.ch, position: servo.maxPos, timeTillMs: 750 }),
    makeServoPulse({ channel: servo.ch, position: servo.homePos, timeTillMs: 0 }),
  ]);
  const padawan = joinEvents([
    makeGpioToggle({ channel: BENCH.padawanGpioRelayChannel, durMs: 1000 }),
    makeBuffer(1000),
    makeGpioToggle({ channel: BENCH.padawanGpioRelayChannel, durMs: 1000 }),
    makeBuffer(2250),
    makeBuffer(0),
  ]);
  return buildScriptUpload(sync, { master, padawan }, scriptId);
}
