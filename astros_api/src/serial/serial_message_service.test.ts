import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SerialMessageService } from './serial_message_service.js';
import { SerialMessageTracker } from './serial_message_tracker.js';
import { SerialMessageType } from './serial_message.js';
import { MessageHelper } from './message_helper.js';
import {
  ConfigSyncResponse,
  ISerialWorkerResponse,
  RegistrationResponse,
  ScriptDeployResponse,
  SerialWorkerResponseType,
} from './serial_worker_response.js';
import { ControlModule } from '../models/control_module/control_module.js';

const GS = MessageHelper.GS;
const RS = MessageHelper.RS;
const US = MessageHelper.US;

/**
 * Builds a valid serial message string that will pass validation.
 * Format: type{RS}validationString{RS}msgId{GS}payload
 */
function buildMessage(type: SerialMessageType, msgId: string, payload: string): string {
  const validationStr = MessageHelper.ValidationMap.get(type)!;
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
      const tracker = service.messageTracker.get('msg-1')!;
      expect(tracker.controllerStatus.size).toBe(2);
    });

    it('should not create tracker for untracked message types', () => {
      const service = new SerialMessageService(vi.fn());

      // SERVO_TEST is not in MessageTimeouts
      service.setMessageTimeout(
        SerialMessageType.SERVO_TEST,
        'msg-1',
        ['AA:BB:CC:DD:EE:01'],
        null,
      );

      expect(service.messageTracker.has('msg-1')).toBe(false);
    });

    it('should not create duplicate tracker for same msgId', () => {
      const service = new SerialMessageService(vi.fn());

      service.setMessageTimeout(
        SerialMessageType.RUN_SCRIPT,
        'msg-1',
        ['AA:BB:CC:DD:EE:01'],
        null,
      );

      service.setMessageTimeout(
        SerialMessageType.RUN_SCRIPT,
        'msg-1',
        ['AA:BB:CC:DD:EE:02'],
        null,
      );

      // Should still have original tracker with first controller
      const tracker = service.messageTracker.get('msg-1')!;
      expect(tracker.controllerStatus.has('AA:BB:CC:DD:EE:01')).toBe(true);
      expect(tracker.controllerStatus.has('AA:BB:CC:DD:EE:02')).toBe(false);
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
      const ack1 = new ScriptDeployResponse(true, 'script-1');
      ack1.controller = new ControlModule('', 'dome', 'AA:BB:CC:DD:EE:01');
      service.updateTracker('msg-1', ack1);

      // Tracker should still exist (one pending)
      expect(service.messageTracker.has('msg-1')).toBe(true);

      // ACK from second controller
      const ack2 = new ScriptDeployResponse(true, 'script-1');
      ack2.controller = new ControlModule('', 'body', 'AA:BB:CC:DD:EE:02');
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

      const ack = new RegistrationResponse(true);
      service.updateTracker('msg-1', ack);

      expect(service.messageTracker.has('msg-1')).toBe(false);
    });

    it('should ignore updateTracker for unknown msgId', () => {
      const service = new SerialMessageService(vi.fn());

      const ack = new ConfigSyncResponse(true);
      ack.controller = new ControlModule('', 'dome', 'AA:BB:CC:DD:EE:01');

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
      const ack = new ScriptDeployResponse(true, 'script-1');
      ack.controller = new ControlModule('', 'dome', 'AA:BB:CC:DD:EE:01');
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
      const ack = new ConfigSyncResponse(true);
      ack.controller = new ControlModule('', 'dome', 'AA:BB:CC:DD:EE:01');
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
