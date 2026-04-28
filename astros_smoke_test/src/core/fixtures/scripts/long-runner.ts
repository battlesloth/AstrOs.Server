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
import { POS_HOME, POS_MAX, POS_MIN } from './_heads-primitives.js';

// ~6.2s script: seed home, then servo sweeps four times while padawan LED
// pulses twice. Used by panic-drill so the panic arrives mid-run.
//
// Positions are PERCENT (0=min, 100=max, -1=home); ESP interpolates against
// the configured ms bounds from DEPLOY_CONFIG.
export function longRunner(sync: ConfigSync, scriptId: string = uuidv4()): ScriptUpload {
  const servo = getServoConfig(1);
  const master = joinEvents([
    makeServoPulse({ channel: servo.ch, position: POS_HOME, timeTillMs: 200 }),
    makeServoPulse({ channel: servo.ch, position: POS_MAX, timeTillMs: 750 }),
    makeServoPulse({ channel: servo.ch, position: POS_MIN, timeTillMs: 750 }),
    makeServoPulse({ channel: servo.ch, position: POS_MAX, timeTillMs: 750 }),
    makeServoPulse({ channel: servo.ch, position: POS_MIN, timeTillMs: 750 }),
    makeServoPulse({ channel: servo.ch, position: POS_MAX, timeTillMs: 750 }),
    makeServoPulse({ channel: servo.ch, position: POS_MIN, timeTillMs: 750 }),
    makeServoPulse({ channel: servo.ch, position: POS_MAX, timeTillMs: 750 }),
    makeServoPulse({ channel: servo.ch, position: POS_HOME, timeTillMs: 0 }),
  ]);
  const padawan = joinEvents([
    makeBuffer(200),
    makeGpioToggle({ channel: BENCH.padawanGpioRelayChannel, durMs: 1000 }),
    makeBuffer(1000),
    makeGpioToggle({ channel: BENCH.padawanGpioRelayChannel, durMs: 1000 }),
    makeBuffer(2250),
    makeBuffer(0),
  ]);
  return buildScriptUpload(sync, { master, padawan }, scriptId);
}
