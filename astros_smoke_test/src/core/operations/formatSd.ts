import { SerialMessageType } from '@api/serial/serial_message.js';
import type { ControlModule } from '@api/models/index.js';
import type { Step } from '../runner.js';
import { sendAndAwaitAck } from './_shared.js';

// SD format on an ESP32 against a FAT32 card is 20–60s in practice, well beyond
// the 5s DEFAULT_TIMEOUT_MS. Override per-call; MessageHelper.MessageTimeouts
// doesn't list FORMAT_SD because production fires it as fire-and-forget.
export const FORMAT_SD_TIMEOUT_MS = 60_000;

export function formatSd(
  controllers: ControlModule[],
  timeoutMs: number = FORMAT_SD_TIMEOUT_MS,
): Step {
  return {
    name: 'formatSd',
    run: ({ transport }) =>
      sendAndAwaitAck(transport, {
        messageType: SerialMessageType.FORMAT_SD,
        data: controllers,
        expectedAckType: SerialMessageType.FORMAT_SD_ACK,
        expectedNakType: SerialMessageType.FORMAT_SD_NAK,
        timeoutMs,
      }),
  };
}
