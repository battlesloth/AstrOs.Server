import { describe, it, expect } from 'vitest';
import { MessageHelper } from '@api/serial/message_helper.js';
import { SerialMessageType } from '@api/serial/serial_message.js';
import { FakeTransport } from '../transport.js';
import { sendAndAwaitAck, sendFireAndForget } from './_shared.js';

function ackFor(type: SerialMessageType, id: string, body: string): string {
  const validation = MessageHelper.ValidationMap.get(type);
  return `${type}${MessageHelper.RS}${validation}${MessageHelper.RS}${id}${MessageHelper.GS}${body}`;
}

describe('sendAndAwaitAck', () => {
  it('resolves ok when a matching ACK arrives with the right message id', async () => {
    const transport = new FakeTransport();

    const promise = sendAndAwaitAck(transport, {
      messageType: SerialMessageType.REGISTRATION_SYNC,
      data: {},
      expectedAckType: SerialMessageType.REGISTRATION_SYNC_ACK,
      messageId: 'id-123',
      timeoutMs: 1000,
    });

    // pull the generated id from the sent framed message header
    await Promise.resolve();
    expect(transport.sent).toHaveLength(1);

    transport.emitLine(
      ackFor(
        SerialMessageType.REGISTRATION_SYNC_ACK,
        'id-123',
        `aa:bb:cc:dd:ee:ff${MessageHelper.US}master`,
      ),
    );

    const result = await promise;
    expect(result.ok).toBe(true);
    expect(result.messageId).toBe('id-123');
    expect(result.ackType).toBe(SerialMessageType.REGISTRATION_SYNC_ACK);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('ignores ACKs with a different message id', async () => {
    const transport = new FakeTransport();

    const promise = sendAndAwaitAck(transport, {
      messageType: SerialMessageType.REGISTRATION_SYNC,
      data: {},
      expectedAckType: SerialMessageType.REGISTRATION_SYNC_ACK,
      messageId: 'expected',
      timeoutMs: 150,
    });

    transport.emitLine(
      ackFor(SerialMessageType.REGISTRATION_SYNC_ACK, 'someone-else', 'aa:bb:cc:dd:ee:ff'),
    );

    const result = await promise;
    expect(result.ok).toBe(false);
    expect(result.timedOut).toBe(true);
  });

  it('returns ok=false and ackType=NAK when a NAK with matching id arrives', async () => {
    const transport = new FakeTransport();

    const promise = sendAndAwaitAck(transport, {
      messageType: SerialMessageType.DEPLOY_CONFIG,
      data: { configs: [{ address: 'aa', name: 'master', gpioChannels: [], maestroModules: [] }] },
      expectedAckType: SerialMessageType.DEPLOY_CONFIG_ACK,
      expectedNakType: SerialMessageType.DEPLOY_CONFIG_NAK,
      messageId: 'dc-1',
      timeoutMs: 1000,
    });

    transport.emitLine(
      ackFor(
        SerialMessageType.DEPLOY_CONFIG_NAK,
        'dc-1',
        `aa${MessageHelper.US}master${MessageHelper.US}fp`,
      ),
    );

    const result = await promise;
    expect(result.ok).toBe(false);
    expect(result.ackType).toBe(SerialMessageType.DEPLOY_CONFIG_NAK);
    expect(result.detail).toMatch(/NAK/);
  });

  it('times out when no matching ACK arrives within the deadline', async () => {
    const transport = new FakeTransport();

    const result = await sendAndAwaitAck(transport, {
      messageType: SerialMessageType.REGISTRATION_SYNC,
      data: {},
      expectedAckType: SerialMessageType.REGISTRATION_SYNC_ACK,
      timeoutMs: 50,
    });

    expect(result.ok).toBe(false);
    expect(result.timedOut).toBe(true);
    expect(result.detail).toMatch(/within 50ms/);
  });
});

describe('sendFireAndForget', () => {
  it('writes the framed message and resolves ok immediately', async () => {
    const transport = new FakeTransport();
    const result = await sendFireAndForget(transport, SerialMessageType.PANIC_STOP, {
      configs: [{ controller: { address: 'aa', name: 'master', id: '' } }],
    });

    expect(result.ok).toBe(true);
    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]).toContain(String(SerialMessageType.PANIC_STOP));
  });
});
