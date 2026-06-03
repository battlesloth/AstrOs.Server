import { SerialMessageType } from '@api/serial/serial_message.js';
import type { Step } from '../runner.js';
import { sendAndAwaitAck } from './_shared.js';

export function registrationSync(): Step {
  return {
    name: 'registrationSync',
    run: ({ transport }) =>
      sendAndAwaitAck(transport, {
        messageType: SerialMessageType.REGISTRATION_SYNC,
        data: {},
        expectedAckType: SerialMessageType.REGISTRATION_SYNC_ACK,
      }),
  };
}
