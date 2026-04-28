import { SerialMessageType } from '@api/serial/serial_message.js';
import type { ScriptRun } from '@api/models/scripts/script_run.js';
import type { Step } from '../runner.js';
import { sendAndAwaitAck } from './_shared.js';

export function runScript(run: ScriptRun): Step {
  return {
    name: 'runScript',
    run: ({ transport }) =>
      sendAndAwaitAck(transport, {
        messageType: SerialMessageType.RUN_SCRIPT,
        data: run,
        expectedAckType: SerialMessageType.RUN_SCRIPT_ACK,
        expectedNakType: SerialMessageType.RUN_SCRIPT_NAK,
      }),
  };
}
