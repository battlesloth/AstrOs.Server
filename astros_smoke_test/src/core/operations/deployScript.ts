import { SerialMessageType } from '@api/serial/serial_message.js';
import type { ScriptUpload } from '@api/models/scripts/script_upload.js';
import type { Step } from '../runner.js';
import { sendAndAwaitAck } from './_shared.js';

export function deployScript(upload: ScriptUpload): Step {
  return {
    name: 'deployScript',
    run: ({ transport }) =>
      sendAndAwaitAck(transport, {
        messageType: SerialMessageType.DEPLOY_SCRIPT,
        data: upload,
        expectedAckType: SerialMessageType.DEPLOY_SCRIPT_ACK,
        expectedNakType: SerialMessageType.DEPLOY_SCRIPT_NAK,
      }),
  };
}
