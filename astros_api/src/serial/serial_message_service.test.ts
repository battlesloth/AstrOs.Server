import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logger } from 'src/logger.js';
import { SerialMessageService } from './serial_message_service.js';
import { SerialMessageTracker } from './serial_message_tracker.js';
import { SerialMessageType } from './serial_message.js';
import { MessageHelper } from './message_helper.js';
import { SerialWorkerResponseType } from './serial_worker_response.js';
import type {
  ConfigSyncResponse,
  RegistrationResponse,
  ScriptDeployResponse,
} from './serial_worker_response.js';

const GS = MessageHelper.GS;
const RS = MessageHelper.RS;
const US = MessageHelper.US;

/**
 * Builds a valid serial message string that will pass validation.
 * Format: type{RS}validationString{RS}msgId{GS}payload
 */
function buildMessage(type: SerialMessageType, msgId: string, payload: string): string {
  const validationStr = MessageHelper.ValidationMap.get(type) as string;
  return `${type}${RS}${validationStr}${RS}${msgId}${GS}${payload}`;
}

describe('SerialMessageTracker', () => {
  it('should initialize all controllers as false', () => {
    const tracker = new SerialMessageTracker(
      'msg-1',
      SerialMessageType.DEPLOY_CONFIG,
      ['AA:BB:CC:DD:EE:01', 'AA:BB:CC:DD:EE:02'],
      null,
    );

    expect(tracker.id).toBe('msg-1');
    expect(tracker.type).toBe(SerialMessageType.DEPLOY_CONFIG);
    expect(tracker.controllerStatus.size).toBe(2);
    expect(tracker.controllerStatus.get('AA:BB:CC:DD:EE:01')).toBe(false);
    expect(tracker.controllerStatus.get('AA:BB:CC:DD:EE:02')).toBe(false);
  });

  it('should store metaData', () => {
    const tracker = new SerialMessageTracker(
      'msg-1',
      SerialMessageType.DEPLOY_SCRIPT,
      ['AA:BB:CC:DD:EE:01'],
      'script-123',
    );

    expect(tracker.metaData).toBe('script-123');
  });
});

describe('SerialMessageService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── handleMessage routing ────────────────────────────────────

  describe('handleMessage', () => {
    it('should return UNKNOWN for null message', () => {
      const service = new SerialMessageService(vi.fn());

      const result = service.handleMessage(null);

      expect(result.type).toBe(SerialWorkerResponseType.UNKNOWN);
    });

    it('should return UNKNOWN for empty message', () => {
      const service = new SerialMessageService(vi.fn());

      const result = service.handleMessage('');

      expect(result.type).toBe(SerialWorkerResponseType.UNKNOWN);
    });

    it('should return UNKNOWN for invalid message format', () => {
      const service = new SerialMessageService(vi.fn());

      const result = service.handleMessage('garbage data');

      expect(result.type).toBe(SerialWorkerResponseType.UNKNOWN);
    });

    it('should handle POLL_ACK without updating tracker', () => {
      const service = new SerialMessageService(vi.fn());

      // POLL_ACK = 3, payload: address{US}name{US}fingerprint
      const msg = buildMessage(
        SerialMessageType.POLL_ACK,
        'msg-1',
        `AA:BB:CC:DD:EE:01${US}dome${US}fp123`,
      );

      const result = service.handleMessage(msg);

      expect(result.type).toBe(SerialWorkerResponseType.POLL);
      // Tracker should not be created for POLL_ACK
      expect(service.messageTracker.size).toBe(0);
    });

    it('should route POLL_NAK to a PollNakResponse', () => {
      const service = new SerialMessageService(vi.fn());

      // POLL_NAK payload: address{US}name; msgId is 'na' (unsolicited)
      const msg = buildMessage(SerialMessageType.POLL_NAK, 'na', `AA:BB:CC:DD:EE:01${US}dome`);

      const result = service.handleMessage(msg);

      expect(result.type).toBe(SerialWorkerResponseType.POLL_NAK);
      expect(result.controller).toEqual({ address: 'AA:BB:CC:DD:EE:01', name: 'dome' });
    });

    it('should handle POLL_NAK without updating tracker', () => {
      const service = new SerialMessageService(vi.fn());

      // Seed a fully-acked tracker under the NAK frame's msgId: if POLL_NAK
      // were routed through updateTracker, the all-true status would delete it.
      const tracker = new SerialMessageTracker(
        'na',
        SerialMessageType.DEPLOY_CONFIG,
        ['AA:BB:CC:DD:EE:01'],
        null,
      );
      tracker.controllerStatus.set('AA:BB:CC:DD:EE:01', true);
      service.messageTracker.set('na', tracker);

      const msg = buildMessage(SerialMessageType.POLL_NAK, 'na', `AA:BB:CC:DD:EE:01${US}dome`);

      service.handleMessage(msg);

      expect(service.messageTracker.has('na')).toBe(true);
    });

    it('should return NO_OP for a valid but unhandled type (FORMAT_SD_ACK)', () => {
      const service = new SerialMessageService(vi.fn());

      const msg = buildMessage(SerialMessageType.FORMAT_SD_ACK, 'msg-1', 'payload');

      const result = service.handleMessage(msg);

      expect(result.type).toBe(SerialWorkerResponseType.NO_OP);
    });

    it('should return NO_OP for a valid but unhandled type (RUN_COMMAND_NAK)', () => {
      const service = new SerialMessageService(vi.fn());

      const msg = buildMessage(SerialMessageType.RUN_COMMAND_NAK, 'msg-1', 'payload');

      const result = service.handleMessage(msg);

      expect(result.type).toBe(SerialWorkerResponseType.NO_OP);
    });

    it('should warn with the payload for an unhandled NAK type (FORMAT_SD_NAK)', () => {
      const warnSpy = vi.spyOn(logger, 'warn');
      try {
        const service = new SerialMessageService(vi.fn());

        // A NAK is a controller actively reporting failure (here: a failed SD
        // wipe) — it must stay visible above debug even without a handler.
        const msg = buildMessage(SerialMessageType.FORMAT_SD_NAK, 'msg-1', 'sd-mount-error');

        const result = service.handleMessage(msg);

        expect(result.type).toBe(SerialWorkerResponseType.NO_OP);
        expect(warnSpy).toHaveBeenCalledTimes(1);
        const logged = String(warnSpy.mock.calls[0][0]);
        expect(logged).toContain('FORMAT_SD_NAK');
        expect(logged).toContain('sd-mount-error');
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('should handle DEPLOY_CONFIG_ACK and update tracker', () => {
      const service = new SerialMessageService(vi.fn());

      // Pre-seed a tracker
      const msgId = 'msg-deploy-cfg';
      service.messageTracker.set(
        msgId,
        new SerialMessageTracker(
          msgId,
          SerialMessageType.DEPLOY_CONFIG,
          ['AA:BB:CC:DD:EE:01'],
          null,
        ),
      );

      // DEPLOY_CONFIG_ACK payload: address{US}name{US}fingerprint
      const msg = buildMessage(
        SerialMessageType.DEPLOY_CONFIG_ACK,
        msgId,
        `AA:BB:CC:DD:EE:01${US}dome${US}fp-new`,
      );

      service.handleMessage(msg);

      // Tracker should be removed (all controllers ACK'd)
      expect(service.messageTracker.has(msgId)).toBe(false);
    });

    // ── FW_* response routing ────────────────────────────────
    // Regression coverage for the bug where the handleMessage switch had no
    // FW_* cases — inbound firmware response frames validated successfully but
    // fell through, causing the worker to postMessage `{ type: UNKNOWN }` and
    // the orchestrator to time out at begin_timeout. See
    // fix(api/serial): route FW_* responses through serial_message_service.

    it('routes FW_TRANSFER_BEGIN_ACK to handleFwTransferBeginAck', () => {
      const service = new SerialMessageService(vi.fn());

      const msg = buildMessage(
        SerialMessageType.FW_TRANSFER_BEGIN_ACK,
        'msg-fw-begin',
        `xfer-1${US}OK`,
      );

      const result = service.handleMessage(msg);

      expect(result.type).toBe(SerialWorkerResponseType.FW_TRANSFER_BEGIN_ACK);
      if (result.type === SerialWorkerResponseType.FW_TRANSFER_BEGIN_ACK) {
        expect(result.payload.transferId).toBe('xfer-1');
        expect(result.payload.status).toBe('OK');
      }
    });

    it('routes FW_CHUNK_ACK to handleFwChunkAck', () => {
      const service = new SerialMessageService(vi.fn());

      const msg = buildMessage(
        SerialMessageType.FW_CHUNK_ACK,
        'msg-fw-chunk-ack',
        `xfer-1${US}5${US}6${US}10`,
      );

      const result = service.handleMessage(msg);

      expect(result.type).toBe(SerialWorkerResponseType.FW_CHUNK_ACK);
      if (result.type === SerialWorkerResponseType.FW_CHUNK_ACK) {
        expect(result.payload.transferId).toBe('xfer-1');
        expect(result.payload.highestContiguousSeq).toBe(5);
        expect(result.payload.nextExpectedSeq).toBe(6);
        expect(result.payload.windowRemaining).toBe(10);
      }
    });

    it('routes FW_CHUNK_NAK to handleFwChunkNak', () => {
      const service = new SerialMessageService(vi.fn());

      const msg = buildMessage(
        SerialMessageType.FW_CHUNK_NAK,
        'msg-fw-chunk-nak',
        `xfer-1${US}3${US}4${US}CRC`,
      );

      const result = service.handleMessage(msg);

      expect(result.type).toBe(SerialWorkerResponseType.FW_CHUNK_NAK);
      if (result.type === SerialWorkerResponseType.FW_CHUNK_NAK) {
        expect(result.payload.transferId).toBe('xfer-1');
        expect(result.payload.lastGoodSeq).toBe(3);
        expect(result.payload.nextExpectedSeq).toBe(4);
        expect(result.payload.reasonCode).toBe('CRC');
      }
    });

    it('routes FW_TRANSFER_END_ACK to handleFwTransferEndAck', () => {
      const service = new SerialMessageService(vi.fn());

      const sha = 'a'.repeat(64);
      const msg = buildMessage(
        SerialMessageType.FW_TRANSFER_END_ACK,
        'msg-fw-end',
        `xfer-1${US}OK${US}${sha}`,
      );

      const result = service.handleMessage(msg);

      expect(result.type).toBe(SerialWorkerResponseType.FW_TRANSFER_END_ACK);
      if (result.type === SerialWorkerResponseType.FW_TRANSFER_END_ACK) {
        expect(result.payload.transferId).toBe('xfer-1');
        expect(result.payload.status).toBe('OK');
        expect(result.payload.computedSha256Hex).toBe(sha);
      }
    });

    it('routes FW_PROGRESS to handleFwProgress', () => {
      const service = new SerialMessageService(vi.fn());

      const msg = buildMessage(
        SerialMessageType.FW_PROGRESS,
        'msg-fw-progress',
        `xfer-1${US}ctrl-1${US}SENDING${US}1024${US}4096${US}detail-text`,
      );

      const result = service.handleMessage(msg);

      expect(result.type).toBe(SerialWorkerResponseType.FW_PROGRESS);
      if (result.type === SerialWorkerResponseType.FW_PROGRESS) {
        expect(result.payload.transferId).toBe('xfer-1');
        expect(result.payload.controllerId).toBe('ctrl-1');
        expect(result.payload.stage).toBe('SENDING');
        expect(result.payload.bytesSent).toBe(1024);
        expect(result.payload.totalBytes).toBe(4096);
        expect(result.payload.detail).toBe('detail-text');
      }
    });

    it('routes FW_DEPLOY_DONE to handleFwDeployDone', () => {
      const service = new SerialMessageService(vi.fn());

      // Wire format: transferId<US>result_1<RS>result_2<RS>...
      // where each result is controllerId<US>outcome<US>finalVersion<US>error.
      // The single-controller case below has no RS — the result list is just
      // result_1 — so the bytes coincidentally read as a flat structure, but
      // the protocol is hierarchical (see message_handler.ts:handleFwDeployDone).
      const msg = buildMessage(
        SerialMessageType.FW_DEPLOY_DONE,
        'msg-fw-deploy-done',
        `xfer-1${US}ctrl-1${US}OK${US}1.5.0${US}`,
      );

      const result = service.handleMessage(msg);

      expect(result.type).toBe(SerialWorkerResponseType.FW_DEPLOY_DONE);
      if (result.type === SerialWorkerResponseType.FW_DEPLOY_DONE) {
        expect(result.payload.transferId).toBe('xfer-1');
        expect(result.payload.results).toHaveLength(1);
        expect(result.payload.results[0].controllerId).toBe('ctrl-1');
        expect(result.payload.results[0].outcome).toBe('OK');
        expect(result.payload.results[0].finalVersion).toBe('1.5.0');
        expect(result.payload.results[0].error).toBe('');
      }
    });

    it('routes FW_BACKPRESSURE to handleFwBackpressure', () => {
      const service = new SerialMessageService(vi.fn());

      const msg = buildMessage(
        SerialMessageType.FW_BACKPRESSURE,
        'msg-fw-bp',
        `xfer-1${US}PAUSE${US}sd_busy`,
      );

      const result = service.handleMessage(msg);

      expect(result.type).toBe(SerialWorkerResponseType.FW_BACKPRESSURE);
      if (result.type === SerialWorkerResponseType.FW_BACKPRESSURE) {
        expect(result.payload.transferId).toBe('xfer-1');
        expect(result.payload.action).toBe('PAUSE');
        expect(result.payload.reason).toBe('sd_busy');
      }
    });
  });

  // ── Tracker lifecycle ────────────────────────────────────────

  describe('tracker lifecycle', () => {
    it('should create tracker via setMessageTimeout for tracked types', () => {
      const service = new SerialMessageService(vi.fn());

      service.setMessageTimeout(
        SerialMessageType.RUN_SCRIPT,
        'msg-1',
        ['AA:BB:CC:DD:EE:01', 'AA:BB:CC:DD:EE:02'],
        null,
      );

      expect(service.messageTracker.has('msg-1')).toBe(true);
      const tracker = service.messageTracker.get('msg-1');
      expect(tracker).toBeDefined();
      expect(tracker?.controllerStatus.size).toBe(2);
    });

    it('should not create tracker for untracked message types', () => {
      const service = new SerialMessageService(vi.fn());

      // SERVO_TEST is not in MessageTimeouts
      service.setMessageTimeout(SerialMessageType.SERVO_TEST, 'msg-1', ['AA:BB:CC:DD:EE:01'], null);

      expect(service.messageTracker.has('msg-1')).toBe(false);
    });

    it('should not create duplicate tracker for same msgId', () => {
      const service = new SerialMessageService(vi.fn());

      service.setMessageTimeout(SerialMessageType.RUN_SCRIPT, 'msg-1', ['AA:BB:CC:DD:EE:01'], null);

      service.setMessageTimeout(SerialMessageType.RUN_SCRIPT, 'msg-1', ['AA:BB:CC:DD:EE:02'], null);

      // Should still have original tracker with first controller
      const tracker = service.messageTracker.get('msg-1');
      expect(tracker).toBeDefined();
      expect(tracker?.controllerStatus.has('AA:BB:CC:DD:EE:01')).toBe(true);
      expect(tracker?.controllerStatus.has('AA:BB:CC:DD:EE:02')).toBe(false);
    });

    it('should remove tracker when all controllers ACK', () => {
      const service = new SerialMessageService(vi.fn());

      // DEPLOY_SCRIPT is in MessageTimeouts, so setMessageTimeout will create a tracker
      service.setMessageTimeout(
        SerialMessageType.DEPLOY_SCRIPT,
        'msg-1',
        ['AA:BB:CC:DD:EE:01', 'AA:BB:CC:DD:EE:02'],
        'script-1',
      );

      // ACK from first controller
      const ack1 = {
        type: SerialWorkerResponseType.SCRIPT_DEPLOY,
        success: true,
        scriptId: 'script-1',
        controller: { id: '', name: 'dome', address: 'AA:BB:CC:DD:EE:01' },
      } as ScriptDeployResponse;
      service.updateTracker('msg-1', ack1);

      // Tracker should still exist (one pending)
      expect(service.messageTracker.has('msg-1')).toBe(true);

      // ACK from second controller
      const ack2 = {
        type: SerialWorkerResponseType.SCRIPT_DEPLOY,
        success: true,
        scriptId: 'script-1',
        controller: { id: '', name: 'body', address: 'AA:BB:CC:DD:EE:02' },
      } as ScriptDeployResponse;
      service.updateTracker('msg-1', ack2);

      // Tracker should be deleted
      expect(service.messageTracker.has('msg-1')).toBe(false);
    });

    it('should handle REGISTRATION_SYNC ACK using master address', () => {
      const service = new SerialMessageService(vi.fn());

      service.setMessageTimeout(
        SerialMessageType.REGISTRATION_SYNC,
        'msg-1',
        ['00:00:00:00:00:00'],
        null,
      );

      const ack: RegistrationResponse = {
        type: SerialWorkerResponseType.REGISTRATION_SYNC,
        success: true,
        registrations: [],
      };
      service.updateTracker('msg-1', ack);

      expect(service.messageTracker.has('msg-1')).toBe(false);
    });

    it('should ignore updateTracker for unknown msgId', () => {
      const service = new SerialMessageService(vi.fn());

      const ack: ConfigSyncResponse = {
        type: SerialWorkerResponseType.CONFIG_SYNC,
        success: true,
        controller: { id: '', name: 'dome', address: 'AA:BB:CC:DD:EE:01' },
      };

      // Should not throw
      service.updateTracker('nonexistent', ack);
    });
  });

  // ── Timeout handling ─────────────────────────────────────────

  describe('timeout handling', () => {
    it('should fire timeout callback for failed controllers', () => {
      const timeoutCallback = vi.fn();
      const service = new SerialMessageService(timeoutCallback);

      service.setMessageTimeout(
        SerialMessageType.DEPLOY_SCRIPT,
        'msg-1',
        ['AA:BB:CC:DD:EE:01', 'AA:BB:CC:DD:EE:02'],
        'script-1',
      );

      // Let timeout fire (5000ms)
      vi.advanceTimersByTime(5000);

      // Should have 2 failure responses (one per failed controller)
      expect(timeoutCallback).toHaveBeenCalledTimes(2);

      const call1 = timeoutCallback.mock.calls[0][0] as ScriptDeployResponse;
      const call2 = timeoutCallback.mock.calls[1][0] as ScriptDeployResponse;
      expect(call1.success).toBe(false);
      expect(call2.success).toBe(false);

      // Tracker should be deleted
      expect(service.messageTracker.has('msg-1')).toBe(false);
    });

    it('should only report failed controllers on timeout', () => {
      const timeoutCallback = vi.fn();
      const service = new SerialMessageService(timeoutCallback);

      service.setMessageTimeout(
        SerialMessageType.DEPLOY_SCRIPT,
        'msg-1',
        ['AA:BB:CC:DD:EE:01', 'AA:BB:CC:DD:EE:02'],
        'script-1',
      );

      // ACK from first controller before timeout
      const ack = {
        type: SerialWorkerResponseType.SCRIPT_DEPLOY,
        success: true,
        scriptId: 'script-1',
        controller: { id: '', name: 'dome', address: 'AA:BB:CC:DD:EE:01' },
      } as ScriptDeployResponse;
      service.updateTracker('msg-1', ack);

      vi.advanceTimersByTime(5000);

      // Only the second controller should be reported as failed
      expect(timeoutCallback).toHaveBeenCalledTimes(1);
      const failedResponse = timeoutCallback.mock.calls[0][0] as ScriptDeployResponse;
      expect(failedResponse.controller.address).toBe('AA:BB:CC:DD:EE:02');
    });

    it('should not fire timeout if all controllers ACK before deadline', () => {
      const timeoutCallback = vi.fn();
      const service = new SerialMessageService(timeoutCallback);

      service.setMessageTimeout(
        SerialMessageType.DEPLOY_CONFIG,
        'msg-1',
        ['AA:BB:CC:DD:EE:01'],
        null,
      );

      // ACK before timeout
      const ack: ConfigSyncResponse = {
        type: SerialWorkerResponseType.CONFIG_SYNC,
        success: true,
        controller: { id: '', name: 'dome', address: 'AA:BB:CC:DD:EE:01' },
      };
      service.updateTracker('msg-1', ack);

      vi.advanceTimersByTime(5000);

      // Tracker was removed, so handleTimeout is a no-op
      expect(timeoutCallback).not.toHaveBeenCalled();
    });

    it('should include scriptId in DEPLOY_SCRIPT failure response', () => {
      const timeoutCallback = vi.fn();
      const service = new SerialMessageService(timeoutCallback);

      service.setMessageTimeout(
        SerialMessageType.DEPLOY_SCRIPT,
        'msg-1',
        ['AA:BB:CC:DD:EE:01'],
        'script-xyz',
      );

      vi.advanceTimersByTime(5000);

      expect(timeoutCallback).toHaveBeenCalledTimes(1);
      const response = timeoutCallback.mock.calls[0][0] as ScriptDeployResponse;
      expect(response.success).toBe(false);
      expect(response.scriptId).toBe('script-xyz');
      expect(response.controller.address).toBe('AA:BB:CC:DD:EE:01');
    });

    it('should produce single failure response for REGISTRATION_SYNC timeout', () => {
      const timeoutCallback = vi.fn();
      const service = new SerialMessageService(timeoutCallback);

      service.setMessageTimeout(
        SerialMessageType.REGISTRATION_SYNC,
        'msg-1',
        ['00:00:00:00:00:00'],
        null,
      );

      vi.advanceTimersByTime(5000);

      expect(timeoutCallback).toHaveBeenCalledTimes(1);
      const response = timeoutCallback.mock.calls[0][0] as RegistrationResponse;
      expect(response.success).toBe(false);
      expect(response.type).toBe(SerialWorkerResponseType.REGISTRATION_SYNC);
    });
  });

  // ── generateFailureResponse ──────────────────────────────────

  describe('generateFailureResponse', () => {
    it('should generate one response per failed controller for DEPLOY_CONFIG', () => {
      const service = new SerialMessageService(vi.fn());

      const tracker = new SerialMessageTracker(
        'msg-1',
        SerialMessageType.DEPLOY_CONFIG,
        ['AA:BB:CC:DD:EE:01', 'AA:BB:CC:DD:EE:02', 'AA:BB:CC:DD:EE:03'],
        null,
      );
      // Mark one as successful
      tracker.controllerStatus.set('AA:BB:CC:DD:EE:02', true);

      const responses = service.generateFailureResponse(tracker);

      expect(responses).toHaveLength(2);
      const addresses = responses.map((r) => (r as ConfigSyncResponse).controller.address);
      expect(addresses).toContain('AA:BB:CC:DD:EE:01');
      expect(addresses).toContain('AA:BB:CC:DD:EE:03');
      expect(addresses).not.toContain('AA:BB:CC:DD:EE:02');
    });

    it('should return empty for unhandled message types', () => {
      const service = new SerialMessageService(vi.fn());

      const tracker = new SerialMessageTracker(
        'msg-1',
        SerialMessageType.RUN_SCRIPT,
        ['AA:BB:CC:DD:EE:01'],
        null,
      );

      const responses = service.generateFailureResponse(tracker);

      expect(responses).toHaveLength(0);
    });
  });
});
