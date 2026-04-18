import { SerialMessageType } from '@api/serial/serial_message.js';
import type { ConfigSync } from '@api/models/config/config_sync.js';
import type { Step } from '../runner.js';
import { sendAndAwaitAck } from './_shared.js';

export function deployConfig(sync: ConfigSync): Step {
  return {
    name: 'deployConfig',
    run: ({ transport }) =>
      sendAndAwaitAck(transport, {
        messageType: SerialMessageType.DEPLOY_CONFIG,
        data: sync,
        expectedAckType: SerialMessageType.DEPLOY_CONFIG_ACK,
        expectedNakType: SerialMessageType.DEPLOY_CONFIG_NAK,
      }),
  };
}
