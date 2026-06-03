import { SerialMessageType } from '@api/serial/serial_message.js';
import type { ScriptRun } from '@api/models/scripts/script_run.js';
import type { Step } from '../runner.js';
import { sendFireAndForget } from './_shared.js';

export function panicStop(run: ScriptRun): Step {
  return {
    name: 'panicStop',
    run: ({ transport }) => sendFireAndForget(transport, SerialMessageType.PANIC_STOP, run),
  };
}
