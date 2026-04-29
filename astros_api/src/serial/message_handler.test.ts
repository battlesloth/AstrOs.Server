import { expect, describe, it } from 'vitest';
import { MessageHandler } from './message_handler.js';
import { MessageHelper } from './message_helper.js';
import { SerialMessageType } from './serial_message.js';
import { SerialWorkerResponseType } from './serial_worker_response.js';
import { FwStage } from '../models/firmware/firmware_messages.js';

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

  // -------------------------------------------------------------------------
  // Firmware OTA incoming messages (.docs/protocol.md § A).
  // -------------------------------------------------------------------------

  it('handle FW_TRANSFER_BEGIN_ACK parses transferId + status', () => {
    const handler = new MessageHandler();
    const payload = `xfer-1${US}OK`;

    const response = handler.handleFwTransferBeginAck(payload);

    expect(response.type).toBe(SerialWorkerResponseType.FW_TRANSFER_BEGIN_ACK);
    expect(response.payload).toEqual({ transferId: 'xfer-1', status: 'OK' });
  });

  it('handle FW_TRANSFER_BEGIN_ACK preserves rejection codes verbatim', () => {
    const handler = new MessageHandler();
    const payload = `xfer-1${US}sd_full`;

    const response = handler.handleFwTransferBeginAck(payload);

    expect(response.payload.status).toBe('sd_full');
  });

  it('handle FW_CHUNK_ACK parses cumulative ack window state', () => {
    const handler = new MessageHandler();
    const payload = `xfer-1${US}99${US}100${US}8`;

    const response = handler.handleFwChunkAck(payload);

    expect(response.type).toBe(SerialWorkerResponseType.FW_CHUNK_ACK);
    expect(response.payload).toEqual({
      transferId: 'xfer-1',
      highestContiguousSeq: 99,
      nextExpectedSeq: 100,
      windowRemaining: 8,
    });
  });

  it('handle FW_CHUNK_ACK rejects numeric fields with trailing garbage', () => {
    const handler = new MessageHandler();
    // parseInt would silently truncate '99junk' to 99; the strict validator
    // must reject the frame entirely so a malformed ack cannot poison
    // downstream window-tracking state.
    const payload = `xfer-1${US}99junk${US}100${US}8`;

    const response = handler.handleFwChunkAck(payload);

    expect(response.type).toBe(SerialWorkerResponseType.UNKNOWN);
  });

  it('handle FW_CHUNK_ACK rejects windowRemaining outside the configured sliding window', () => {
    const handler = new MessageHandler();
    // Per .docs/protocol.md the serial sliding window is 16 frames; any
    // larger value is malformed and must be rejected so the orchestrator
    // can't end up sending more in-flight chunks than the contract allows.
    const payload = `xfer-1${US}99${US}100${US}17`;

    const response = handler.handleFwChunkAck(payload);

    expect(response.type).toBe(SerialWorkerResponseType.UNKNOWN);
  });

  it('handle FW_CHUNK_NAK parses last-good-seq + reason', () => {
    const handler = new MessageHandler();
    const payload = `xfer-1${US}42${US}CRC`;

    const response = handler.handleFwChunkNak(payload);

    expect(response.type).toBe(SerialWorkerResponseType.FW_CHUNK_NAK);
    expect(response.payload).toEqual({
      transferId: 'xfer-1',
      lastGoodSeq: 42,
      reasonCode: 'CRC',
    });
  });

  it('handle FW_CHUNK_NAK rejects unknown reason codes', () => {
    const handler = new MessageHandler();
    const payload = `xfer-1${US}42${US}NONSENSE`;

    const response = handler.handleFwChunkNak(payload);

    expect(response.type).toBe(SerialWorkerResponseType.UNKNOWN);
  });

  it('handle FW_CHUNK_NAK rejects lastGoodSeq with trailing garbage', () => {
    const handler = new MessageHandler();
    const payload = `xfer-1${US}42junk${US}CRC`;

    const response = handler.handleFwChunkNak(payload);

    expect(response.type).toBe(SerialWorkerResponseType.UNKNOWN);
  });

  it('handle FW_TRANSFER_END_ACK parses status + computed hash', () => {
    const handler = new MessageHandler();
    const payload = `xfer-1${US}OK${US}${'a'.repeat(64)}`;

    const response = handler.handleFwTransferEndAck(payload);

    expect(response.type).toBe(SerialWorkerResponseType.FW_TRANSFER_END_ACK);
    expect(response.payload).toEqual({
      transferId: 'xfer-1',
      status: 'OK',
      computedSha256Hex: 'a'.repeat(64),
    });
  });

  it('handle FW_TRANSFER_END_ACK preserves HASH_MISMATCH status', () => {
    const handler = new MessageHandler();
    const payload = `xfer-1${US}HASH_MISMATCH${US}${'b'.repeat(64)}`;

    const response = handler.handleFwTransferEndAck(payload);

    expect(response.payload.status).toBe('HASH_MISMATCH');
  });

  it('handle FW_TRANSFER_END_ACK rejects hashes with wrong length', () => {
    const handler = new MessageHandler();
    // 63 chars (one short). A sloppy parser would still pass this through and
    // every later byte-comparison against the server's reference hash would
    // appear as a hash mismatch, hiding the wire-format corruption.
    const payload = `xfer-1${US}OK${US}${'a'.repeat(63)}`;

    const response = handler.handleFwTransferEndAck(payload);

    expect(response.type).toBe(SerialWorkerResponseType.UNKNOWN);
  });

  it('handle FW_TRANSFER_END_ACK rejects hashes with non-hex characters', () => {
    const handler = new MessageHandler();
    const payload = `xfer-1${US}OK${US}${'g'.repeat(64)}`;

    const response = handler.handleFwTransferEndAck(payload);

    expect(response.type).toBe(SerialWorkerResponseType.UNKNOWN);
  });

  it('handle FW_TRANSFER_END_ACK rejects uppercase hex (contract requires lowercase)', () => {
    const handler = new MessageHandler();
    // Lowercase-only matters for byte-equality against crypto.createHash
    // output, which is always lowercase.
    const payload = `xfer-1${US}OK${US}${'A'.repeat(64)}`;

    const response = handler.handleFwTransferEndAck(payload);

    expect(response.type).toBe(SerialWorkerResponseType.UNKNOWN);
  });

  it('handle FW_PROGRESS parses controller stage update', () => {
    const handler = new MessageHandler();
    const payload = `xfer-1${US}core${US}SENDING${US}524288${US}1234567${US}ok`;

    const response = handler.handleFwProgress(payload);

    expect(response.type).toBe(SerialWorkerResponseType.FW_PROGRESS);
    expect(response.payload).toEqual({
      transferId: 'xfer-1',
      controllerId: 'core',
      stage: FwStage.Sending,
      bytesSent: 524288,
      totalBytes: 1234567,
      detail: 'ok',
    });
  });

  it('handle FW_PROGRESS rejects unknown stage values', () => {
    const handler = new MessageHandler();
    const payload = `xfer-1${US}core${US}NONSENSE${US}0${US}0${US}`;

    const response = handler.handleFwProgress(payload);

    expect(response.type).toBe(SerialWorkerResponseType.UNKNOWN);
  });

  it('handle FW_PROGRESS rejects byte counts with trailing garbage', () => {
    const handler = new MessageHandler();
    const payload = `xfer-1${US}core${US}SENDING${US}1024junk${US}1234567${US}ok`;

    const response = handler.handleFwProgress(payload);

    expect(response.type).toBe(SerialWorkerResponseType.UNKNOWN);
  });

  it('handle FW_DEPLOY_DONE parses per-controller results', () => {
    const handler = new MessageHandler();
    const payload =
      `xfer-1${US}` +
      `core${US}OK${US}1.4.0${US}${RS}` +
      `dome${US}FAILED${US}1.3.2${US}reboot_timeout`;

    const response = handler.handleFwDeployDone(payload);

    expect(response.type).toBe(SerialWorkerResponseType.FW_DEPLOY_DONE);
    expect(response.payload.transferId).toBe('xfer-1');
    expect(response.payload.results).toEqual([
      { controllerId: 'core', outcome: 'OK', finalVersion: '1.4.0', error: '' },
      { controllerId: 'dome', outcome: 'FAILED', finalVersion: '1.3.2', error: 'reboot_timeout' },
    ]);
  });

  it('handle FW_DEPLOY_DONE rejects an OK result that carries a non-empty error', () => {
    const handler = new MessageHandler();
    // OK + non-empty error violates the per-result invariant in protocol.md
    // ("errorOrEmpty"); accepting it would produce inconsistent UI state.
    const payload = `xfer-1${US}core${US}OK${US}1.4.0${US}stale_data`;

    const response = handler.handleFwDeployDone(payload);

    expect(response.type).toBe(SerialWorkerResponseType.UNKNOWN);
  });

  it('handle FW_BACKPRESSURE parses pause/resume + reason', () => {
    const handler = new MessageHandler();
    const payload = `xfer-1${US}PAUSE${US}sd_writing`;

    const response = handler.handleFwBackpressure(payload);

    expect(response.type).toBe(SerialWorkerResponseType.FW_BACKPRESSURE);
    expect(response.payload).toEqual({
      transferId: 'xfer-1',
      action: 'PAUSE',
      reason: 'sd_writing',
    });
  });

  it('handle FW_BACKPRESSURE rejects unknown action values', () => {
    const handler = new MessageHandler();
    const payload = `xfer-1${US}NONSENSE${US}reason`;

    const response = handler.handleFwBackpressure(payload);

    expect(response.type).toBe(SerialWorkerResponseType.UNKNOWN);
  });
});
