import { SerialMessageType } from '@api/serial/serial_message.js';
import type { ServoTest } from '@api/models/servo_test.js';
import type { Step } from '../runner.js';
import { sendAndAwaitAck } from './_shared.js';

export function servoTest(cmd: ServoTest): Step {
  return {
    name: 'servoTest',
    run: ({ transport }) =>
      sendAndAwaitAck(transport, {
        messageType: SerialMessageType.SERVO_TEST,
        data: cmd,
        expectedAckType: SerialMessageType.SERVO_TEST_ACK,
      }),
  };
}
