import { expect, describe, it } from 'vitest';
import { MessageHandler } from './message_handler.js';
import { MessageHelper } from './message_helper.js';
import { SerialMessageType } from './serial_message.js';
import { SerialWorkerResponseType } from './serial_worker_response.js';

const RS = MessageHelper.RS;
const GS = MessageHelper.GS;
const US = MessageHelper.US;

function createMessage(type: SerialMessageType, id: string, payload: string): string {
  const valString = MessageHelper.ValidationMap.get(type);

  return `${type}${RS}${valString}${RS}${id}${GS}${payload}`;
}

describe('Serial Message Handler Tests', () => {
  it('validateMessage should return true for valid message', () => {
    const messageHandler = new MessageHandler();

    const message = createMessage(SerialMessageType.REGISTRATION_SYNC, '123', 'payload');

    const result = messageHandler.validateMessage(message);

    expect(result.valid).toBe(true);
    expect(result.type).toBe(SerialMessageType.REGISTRATION_SYNC);
    expect(result.id).toBe('123');
    expect(result.data).toBe('payload');
  });

  it('validateMessage should return false for invalid message', () => {
    const messageHandler = new MessageHandler();

    const message = 'invalid message';

    const result = messageHandler.validateMessage(message);

    expect(result.valid).toBe(false);
    expect(result.type).toBe(SerialMessageType.UNKNOWN);
  });

  it('validateMessage should return false for invalid header', () => {
    const messageHandler = new MessageHandler();

    const message = 'invalid header' + GS + 'payload';

    const result = messageHandler.validateMessage(message);

    expect(result.valid).toBe(false);
    expect(result.type).toBe(SerialMessageType.UNKNOWN);
  });

  it('validateMessage should return false for invalid type', () => {
    const messageHandler = new MessageHandler();

    const message = 'invalid' + RS + 'invalid' + RS + '123' + GS + 'payload';

    const result = messageHandler.validateMessage(message);

    expect(result.valid).toBe(false);
    expect(result.type).toBe(SerialMessageType.UNKNOWN);
  });

  it('handlePollAck should return valid response (legacy 3-field)', () => {
    const messageHandler = new MessageHandler();

    const message = createMessage(
      SerialMessageType.POLL_ACK,
      '123',
      'mac' + US + 'name' + US + 'fingerprint',
    );

    const validation = messageHandler.validateMessage(message);

    const response = messageHandler.handlePollAck(validation.data);

    expect(response.type).toBe(SerialWorkerResponseType.POLL);
    expect(response.controller.name).toBe('name');
    expect(response.controller.address).toBe('mac');
    expect(response.controller.fingerprint).toBe('fingerprint');
    expect(response.controller.firmwareVersion).toBeUndefined();
  });

  it('handlePollAck should parse firmware version (4-field)', () => {
    const messageHandler = new MessageHandler();

    const message = createMessage(
      SerialMessageType.POLL_ACK,
      '123',
      'mac' + US + 'name' + US + 'fingerprint' + US + '1.2.0-dev.102',
    );

    const validation = messageHandler.validateMessage(message);

    const response = messageHandler.handlePollAck(validation.data);

    expect(response.type).toBe(SerialWorkerResponseType.POLL);
    expect(response.controller.firmwareVersion).toBe('1.2.0-dev.102');
  });

  it('handlePollAck should treat empty firmware field as undefined', () => {
    const messageHandler = new MessageHandler();

    const message = createMessage(
      SerialMessageType.POLL_ACK,
      '123',
      'mac' + US + 'name' + US + 'fingerprint' + US + '',
    );

    const validation = messageHandler.validateMessage(message);

    const response = messageHandler.handlePollAck(validation.data);

    expect(response.type).toBe(SerialWorkerResponseType.POLL);
    expect(response.controller.firmwareVersion).toBeUndefined();
  });

  it('handlePollAck should treat whitespace-only firmware field as undefined', () => {
    const messageHandler = new MessageHandler();

    const message = createMessage(
      SerialMessageType.POLL_ACK,
      '123',
      'mac' + US + 'name' + US + 'fingerprint' + US + '   ',
    );

    const validation = messageHandler.validateMessage(message);

    const response = messageHandler.handlePollAck(validation.data);

    expect(response.type).toBe(SerialWorkerResponseType.POLL);
    expect(response.controller.firmwareVersion).toBeUndefined();
  });

  it('handlePollAck should reject 5-field payload as UNKNOWN', () => {
    const messageHandler = new MessageHandler();

    const message = createMessage(
      SerialMessageType.POLL_ACK,
      '123',
      'mac' + US + 'name' + US + 'fingerprint' + US + '1.2.0' + US + 'extra',
    );

    const validation = messageHandler.validateMessage(message);

    const response = messageHandler.handlePollAck(validation.data);

    expect(response.type).toBe(SerialWorkerResponseType.UNKNOWN);
  });

  it('handlePollAck should return valid response with invalid data', () => {
    const messageHandler = new MessageHandler();

    const message = createMessage(SerialMessageType.POLL_ACK, '123', 'mac' + US + 'name');

    const validation = messageHandler.validateMessage(message);

    const response = messageHandler.handlePollAck(validation.data);

    expect(response.type).toBe(SerialWorkerResponseType.UNKNOWN);
  });

  it('handleRegistraionSyncAck should return valid response', () => {
    const messageHandler = new MessageHandler();

    const message = createMessage(
      SerialMessageType.REGISTRATION_SYNC_ACK,
      '123',
      'mac1' + US + 'name1' + RS + 'mac2' + US + 'name2',
    );

    const validation = messageHandler.validateMessage(message);

    const response = messageHandler.handleRegistraionSyncAck(validation.data);

    expect(response.type).toBe(SerialWorkerResponseType.REGISTRATION_SYNC);
    expect(response.registrations.length).toBe(2);
    expect(response.registrations[0].name).toBe('name1');
    expect(response.registrations[0].address).toBe('mac1');
    expect(response.registrations[1].name).toBe('name2');
    expect(response.registrations[1].address).toBe('mac2');
  });

  // ── Deploy Config ACK ──────────────────────────────────────

  it('handleDeployConfigAck should return valid response', () => {
    const messageHandler = new MessageHandler();

    const payload = 'mac1' + US + 'name1' + US + 'fingerprint1';
    const response = messageHandler.handleDeployConfigAck(payload);

    expect(response.type).toBe(SerialWorkerResponseType.CONFIG_SYNC);
    expect(response.success).toBe(true);
    expect(response.controller.address).toBe('mac1');
    expect(response.controller.name).toBe('name1');
    expect(response.controller.fingerprint).toBe('fingerprint1');
  });

  it('handleDeployConfigAck should return UNKNOWN for invalid data', () => {
    const messageHandler = new MessageHandler();

    const payload = 'mac1' + US + 'name1'; // missing fingerprint
    const response = messageHandler.handleDeployConfigAck(payload);

    expect(response.type).toBe(SerialWorkerResponseType.UNKNOWN);
  });

  // ── Deploy Script ACK/NAK ────────────────────────────────

  it('handleDeployScriptAckNak should return success for ACK', () => {
    const messageHandler = new MessageHandler();

    const payload = 'mac1' + US + 'name1' + US + 'script-xyz';
    const response = messageHandler.handleDeployScriptAckNak(
      SerialMessageType.DEPLOY_SCRIPT_ACK,
      payload,
    );

    expect(response.type).toBe(SerialWorkerResponseType.SCRIPT_DEPLOY);
    expect(response.success).toBe(true);
    expect(response.scriptId).toBe('script-xyz');
    expect(response.controller.address).toBe('mac1');
  });

  it('handleDeployScriptAckNak should return failure for NAK', () => {
    const messageHandler = new MessageHandler();

    const payload = 'mac1' + US + 'name1' + US + 'script-xyz';
    const response = messageHandler.handleDeployScriptAckNak(
      SerialMessageType.DEPLOY_SCRIPT_NAK,
      payload,
    );

    expect(response.success).toBe(false);
    expect(response.scriptId).toBe('script-xyz');
  });

  it('handleDeployScriptAckNak should return UNKNOWN for invalid data', () => {
    const messageHandler = new MessageHandler();

    const payload = 'mac1' + US + 'name1'; // missing scriptId
    const response = messageHandler.handleDeployScriptAckNak(
      SerialMessageType.DEPLOY_SCRIPT_ACK,
      payload,
    );

    expect(response.type).toBe(SerialWorkerResponseType.UNKNOWN);
    expect(response.success).toBe(false);
  });

  // ── Run Script ACK/NAK ───────────────────────────────────

  it('handleRunScriptAckNak should return success for ACK', () => {
    const messageHandler = new MessageHandler();

    const payload = 'mac1' + US + 'name1' + US + 'script-abc';
    const response = messageHandler.handleRunScriptAckNak(
      SerialMessageType.RUN_SCRIPT_ACK,
      payload,
    );

    expect(response.type).toBe(SerialWorkerResponseType.SCRIPT_RUN);
    expect(response.success).toBe(true);
    expect(response.scriptId).toBe('script-abc');
    expect(response.controller.address).toBe('mac1');
  });

  it('handleRunScriptAckNak should return failure for NAK', () => {
    const messageHandler = new MessageHandler();

    const payload = 'mac1' + US + 'name1' + US + 'script-abc';
    const response = messageHandler.handleRunScriptAckNak(
      SerialMessageType.RUN_SCRIPT_NAK,
      payload,
    );

    expect(response.success).toBe(false);
    expect(response.scriptId).toBe('script-abc');
  });

  it('handleRunScriptAckNak should return UNKNOWN for invalid data', () => {
    const messageHandler = new MessageHandler();

    const payload = 'mac1'; // missing name and scriptId
    const response = messageHandler.handleRunScriptAckNak(
      SerialMessageType.RUN_SCRIPT_ACK,
      payload,
    );

    expect(response.type).toBe(SerialWorkerResponseType.UNKNOWN);
    expect(response.success).toBe(false);
  });

  // ── Registration (existing tests below) ──────────────────

  it('handleRegistraionSyncAck should return valid response with invalid records', () => {
    const messageHandler = new MessageHandler();

    const message = createMessage(
      SerialMessageType.REGISTRATION_SYNC_ACK,
      '123',
      'mac1' + US + 'name1' + RS + 'name2',
    );

    const validation = messageHandler.validateMessage(message);

    const response = messageHandler.handleRegistraionSyncAck(validation.data);

    expect(response.type).toBe(SerialWorkerResponseType.REGISTRATION_SYNC);
    expect(response.registrations.length).toBe(1);
    expect(response.registrations[0].name).toBe('name1');
    expect(response.registrations[0].address).toBe('mac1');
  });
});
