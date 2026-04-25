import { SerialMessageType } from '@api/serial/serial_message.js';
import type { ControlModule } from '@api/models/index.js';
import type { Step } from '../runner.js';
import { sendAndAwaitAck } from './_shared.js';

export interface DirectCommandPayload {
  controller: ControlModule;
  command: string;
}

export function directCommand(payload: DirectCommandPayload): Step {
  return {
    name: 'directCommand',
    run: ({ transport }) =>
      sendAndAwaitAck(transport, {
        messageType: SerialMessageType.RUN_COMMAND,
        data: payload,
        expectedAckType: SerialMessageType.RUN_COMMAND_ACK,
        expectedNakType: SerialMessageType.RUN_COMMAND_NAK,
      }),
  };
}
