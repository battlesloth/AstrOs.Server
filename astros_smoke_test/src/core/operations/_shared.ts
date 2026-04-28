import { v4 as uuidv4 } from 'uuid';
import { MessageGenerator } from '@api/serial/message_generator.js';
import { MessageHandler } from '@api/serial/message_handler.js';
import { MessageHelper } from '@api/serial/message_helper.js';
import { SerialMessageType } from '@api/serial/serial_message.js';
import type { Transport } from '../transport.js';
import type { StepResult } from '../runner.js';

const DEFAULT_TIMEOUT_MS = 5000;

export interface SendAndAwaitAckOptions {
  messageType: SerialMessageType;
  data: unknown;
  expectedAckType: SerialMessageType;
  expectedNakType?: SerialMessageType;
  timeoutMs?: number;
  messageId?: string;
}

export async function sendAndAwaitAck(
  transport: Transport,
  opts: SendAndAwaitAckOptions,
): Promise<StepResult> {
  const id = opts.messageId ?? uuidv4();
  const timeoutMs =
    opts.timeoutMs ?? MessageHelper.MessageTimeouts.get(opts.messageType) ?? DEFAULT_TIMEOUT_MS;

  const generator = new MessageGenerator();
  const handler = new MessageHandler();
  const framed = generator.generateMessage(opts.messageType, id, opts.data);

  if (!framed.msg || framed.msg === '\n') {
    return {
      ok: false,
      messageId: id,
      durationMs: 0,
      detail: `Message generator returned empty payload for type ${SerialMessageType[opts.messageType]}`,
    };
  }

  const started = Date.now();

  return new Promise<StepResult>((resolve) => {
    let settled = false;

    const finish = (result: StepResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      transport.off('line', onLine);
      resolve(result);
    };

    const onLine = (line: string) => {
      const v = handler.validateMessage(line);
      if (!v.valid || v.id !== id) return;

      if (v.type === opts.expectedAckType) {
        finish({
          ok: true,
          messageId: id,
          ackType: v.type,
          durationMs: Date.now() - started,
          rawResponse: line,
        });
        return;
      }

      if (opts.expectedNakType !== undefined && v.type === opts.expectedNakType) {
        finish({
          ok: false,
          messageId: id,
          ackType: v.type,
          durationMs: Date.now() - started,
          rawResponse: line,
          detail: `Received NAK: ${SerialMessageType[v.type]}`,
        });
      }
    };

    const timer = setTimeout(() => {
      finish({
        ok: false,
        timedOut: true,
        messageId: id,
        durationMs: Date.now() - started,
        detail: `No ACK for ${SerialMessageType[opts.messageType]} within ${timeoutMs}ms`,
      });
    }, timeoutMs);

    transport.on('line', onLine);

    transport.write(framed.msg).catch((err: Error) => {
      finish({
        ok: false,
        messageId: id,
        durationMs: Date.now() - started,
        detail: `Write failed: ${err.message}`,
      });
    });
  });
}

export async function sendFireAndForget(
  transport: Transport,
  messageType: SerialMessageType,
  data: unknown,
  messageId?: string,
): Promise<StepResult> {
  const id = messageId ?? uuidv4();
  const generator = new MessageGenerator();
  const framed = generator.generateMessage(messageType, id, data);
  const started = Date.now();

  try {
    await transport.write(framed.msg);
    return { ok: true, messageId: id, durationMs: Date.now() - started };
  } catch (err) {
    return {
      ok: false,
      messageId: id,
      durationMs: Date.now() - started,
      detail: `Write failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
