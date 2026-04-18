import { SerialMessageType } from '@api/serial/serial_message.js';
import type { ControlModule } from '@api/models/index.js';
import type { Step } from '../runner.js';
import { sendAndAwaitAck } from './_shared.js';

export function formatSd(controllers: ControlModule[]): Step {
  return {
    name: 'formatSd',
    run: ({ transport }) =>
      sendAndAwaitAck(transport, {
        messageType: SerialMessageType.FORMAT_SD,
        data: controllers,
        expectedAckType: SerialMessageType.FORMAT_SD_ACK,
        expectedNakType: SerialMessageType.FORMAT_SD_NAK,
      }),
  };
}
