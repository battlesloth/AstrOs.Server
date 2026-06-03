import { SerialMessageType } from '@api/serial/serial_message.js';
import type { ServoTest } from '@api/models/servo_test.js';
import type { Step } from '../runner.js';
import { sendFireAndForget } from './_shared.js';

// SERVO_TEST is fire-and-forget: firmware deliberately does not emit
// SERVO_TEST_ACK because the Vue web slider streams these on every value
// change and acking would create a per-frame ack storm.
export function servoTest(cmd: ServoTest): Step {
  return {
    name: 'servoTest',
    run: ({ transport }) => sendFireAndForget(transport, SerialMessageType.SERVO_TEST, cmd),
  };
}
