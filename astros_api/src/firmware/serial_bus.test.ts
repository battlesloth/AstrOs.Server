import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'events';
import { WorkerSerialBus } from './serial_bus.js';
import { SerialMessageType } from '../serial/serial_message.js';
import { SerialWorkerResponseType } from '../serial/serial_worker_response.js';
import type {
  FwBackpressureResponse,
  FwChunkAckResponse,
  FwChunkNakResponse,
  FwDeployDoneResponse,
  FwProgressResponse,
  FwTransferBeginAckResponse,
  FwTransferEndAckResponse,
  PollResponse,
} from '../serial/serial_worker_response.js';
import type { FwInboundAck } from '../models/firmware/chunk_streamer.js';
import type { FwDeployEvent } from '../models/firmware/flash_orchestrator.js';
import { FwStage } from '../models/firmware/firmware_messages.js';

// Minimal Worker-shape stand-in. The real Node worker_threads.Worker exposes
// `on('message', ...)`, `off('message', ...)` and `postMessage(...)`. An
// EventEmitter mirrors the listener surface; we bolt postMessage on as a spy
// so the production adapter never has to know it isn't talking to a real Worker.
function createMockWorker(): EventEmitter & { postMessage: ReturnType<typeof vi.fn> } {
  const emitter = new EventEmitter() as EventEmitter & {
    postMessage: ReturnType<typeof vi.fn>;
  };
  emitter.postMessage = vi.fn();
  return emitter;
}

describe('WorkerSerialBus', () => {
  describe('send', () => {
    it("wraps 'firmware'-kind sends in the RAW_WIRE IPC envelope", () => {
      // The serial worker expects a structured { type, data } envelope on
      // worker.postMessage. Pre-formed wire bytes from the streamer must
      // be wrapped in RAW_WIRE so the worker echoes them straight to the
      // SEND_SERIAL_MESSAGE path (bypassing msgService.generateMessage's
      // tracker — see comment on SerialMessageType.RAW_WIRE). Forwarding
      // a raw string would land in the worker's `isNaN(msg.type)` guard
      // and the bytes would never reach the port.
      const worker = createMockWorker();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bus = new WorkerSerialBus({ worker: worker as any });

      bus.send('payload-fw', { kind: 'firmware' });

      expect(worker.postMessage).toHaveBeenCalledTimes(1);
      expect(worker.postMessage).toHaveBeenCalledWith({
        type: SerialMessageType.RAW_WIRE,
        data: 'payload-fw',
      });
    });

    it("wraps 'normal'-kind sends in the RAW_WIRE envelope too (c.6b does not enforce drop-when-locked)", () => {
      // c.6c will add a JobLock-aware drop policy on top of `kind`. c.6b's
      // job is just to wire the interface — both kinds reach the worker
      // via the same RAW_WIRE path so existing non-firmware traffic keeps
      // flowing while we layer in the streamer. The drop policy lands in
      // c.6c's adapter and inspects `kind` then.
      const worker = createMockWorker();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bus = new WorkerSerialBus({ worker: worker as any });

      bus.send('payload-normal', { kind: 'normal' });

      expect(worker.postMessage).toHaveBeenCalledTimes(1);
      expect(worker.postMessage).toHaveBeenCalledWith({
        type: SerialMessageType.RAW_WIRE,
        data: 'payload-normal',
      });
    });
  });

  describe('subscribeFwAcks', () => {
    it('dispatches FW_TRANSFER_BEGIN_ACK matching the transferId', () => {
      const worker = createMockWorker();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bus = new WorkerSerialBus({ worker: worker as any });
      const handler = vi.fn();

      bus.subscribeFwAcks('xfer-1', handler);

      const msg: FwTransferBeginAckResponse = {
        type: SerialWorkerResponseType.FW_TRANSFER_BEGIN_ACK,
        payload: { transferId: 'xfer-1', status: 'OK' },
      };
      worker.emit('message', msg);

      expect(handler).toHaveBeenCalledTimes(1);
      const ack = handler.mock.calls[0][0] as FwInboundAck;
      expect(ack.kind).toBe('beginAck');
      expect(ack.transferId).toBe('xfer-1');
      // Narrowed by `kind === 'beginAck'`, status is on FwTransferBeginAck.
      if (ack.kind === 'beginAck') {
        expect(ack.status).toBe('OK');
      }
    });

    it('dispatches FW_CHUNK_ACK with the chunkAck kind discriminator', () => {
      const worker = createMockWorker();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bus = new WorkerSerialBus({ worker: worker as any });
      const handler = vi.fn();

      bus.subscribeFwAcks('xfer-1', handler);

      const msg: FwChunkAckResponse = {
        type: SerialWorkerResponseType.FW_CHUNK_ACK,
        payload: {
          transferId: 'xfer-1',
          highestContiguousSeq: 99,
          nextExpectedSeq: 100,
          windowRemaining: 8,
        },
      };
      worker.emit('message', msg);

      expect(handler).toHaveBeenCalledTimes(1);
      const ack = handler.mock.calls[0][0] as FwInboundAck;
      expect(ack.kind).toBe('chunkAck');
      if (ack.kind === 'chunkAck') {
        expect(ack.highestContiguousSeq).toBe(99);
        expect(ack.nextExpectedSeq).toBe(100);
        expect(ack.windowRemaining).toBe(8);
      }
    });

    it('dispatches FW_CHUNK_NAK with the chunkNak kind discriminator', () => {
      const worker = createMockWorker();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bus = new WorkerSerialBus({ worker: worker as any });
      const handler = vi.fn();

      bus.subscribeFwAcks('xfer-1', handler);

      const msg: FwChunkNakResponse = {
        type: SerialWorkerResponseType.FW_CHUNK_NAK,
        payload: { transferId: 'xfer-1', lastGoodSeq: 42, reasonCode: 'CRC' },
      };
      worker.emit('message', msg);

      expect(handler).toHaveBeenCalledTimes(1);
      const ack = handler.mock.calls[0][0] as FwInboundAck;
      expect(ack.kind).toBe('chunkNak');
      if (ack.kind === 'chunkNak') {
        expect(ack.lastGoodSeq).toBe(42);
        expect(ack.reasonCode).toBe('CRC');
      }
    });

    it('dispatches FW_TRANSFER_END_ACK with the transferEndAck kind discriminator', () => {
      const worker = createMockWorker();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bus = new WorkerSerialBus({ worker: worker as any });
      const handler = vi.fn();

      bus.subscribeFwAcks('xfer-1', handler);

      const msg: FwTransferEndAckResponse = {
        type: SerialWorkerResponseType.FW_TRANSFER_END_ACK,
        payload: {
          transferId: 'xfer-1',
          status: 'OK',
          computedSha256Hex: 'a'.repeat(64),
        },
      };
      worker.emit('message', msg);

      expect(handler).toHaveBeenCalledTimes(1);
      const ack = handler.mock.calls[0][0] as FwInboundAck;
      expect(ack.kind).toBe('transferEndAck');
      if (ack.kind === 'transferEndAck') {
        expect(ack.status).toBe('OK');
        expect(ack.computedSha256Hex).toBe('a'.repeat(64));
      }
    });

    it('dispatches FW_BACKPRESSURE with the backpressure kind discriminator', () => {
      const worker = createMockWorker();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bus = new WorkerSerialBus({ worker: worker as any });
      const handler = vi.fn();

      bus.subscribeFwAcks('xfer-1', handler);

      const msg: FwBackpressureResponse = {
        type: SerialWorkerResponseType.FW_BACKPRESSURE,
        payload: { transferId: 'xfer-1', action: 'PAUSE', reason: 'master_busy' },
      };
      worker.emit('message', msg);

      expect(handler).toHaveBeenCalledTimes(1);
      const ack = handler.mock.calls[0][0] as FwInboundAck;
      expect(ack.kind).toBe('backpressure');
      if (ack.kind === 'backpressure') {
        expect(ack.action).toBe('PAUSE');
        expect(ack.reason).toBe('master_busy');
      }
    });

    it('filters out FW messages whose transferId does not match', () => {
      const worker = createMockWorker();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bus = new WorkerSerialBus({ worker: worker as any });
      const handler = vi.fn();

      bus.subscribeFwAcks('xfer-1', handler);

      const msg: FwChunkAckResponse = {
        type: SerialWorkerResponseType.FW_CHUNK_ACK,
        payload: {
          transferId: 'xfer-2',
          highestContiguousSeq: 5,
          nextExpectedSeq: 6,
          windowRemaining: 16,
        },
      };
      worker.emit('message', msg);

      expect(handler).not.toHaveBeenCalled();
    });

    it('ignores non-FW worker messages (e.g. POLL responses)', () => {
      // The streamer must not see registration syncs, poll acks, etc. — only
      // the five FW_* variants in FwInboundAck. Anything else gets dropped.
      const worker = createMockWorker();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bus = new WorkerSerialBus({ worker: worker as any });
      const handler = vi.fn();

      bus.subscribeFwAcks('xfer-1', handler);

      const msg: PollResponse = {
        type: SerialWorkerResponseType.POLL,
        controller: { id: '', name: 'mod', address: 'aa:bb' },
      };
      worker.emit('message', msg);

      expect(handler).not.toHaveBeenCalled();
    });

    it('ignores FW_PROGRESS and FW_DEPLOY_DONE — those are routed elsewhere', () => {
      // FwInboundAck deliberately omits progress + deploy-done; the streamer
      // only cares about the per-chunk ACK/NAK loop and end-of-transfer ack.
      // Progress + deploy-done flow to the orchestrator, not the streamer.
      const worker = createMockWorker();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bus = new WorkerSerialBus({ worker: worker as any });
      const handler = vi.fn();

      bus.subscribeFwAcks('xfer-1', handler);

      worker.emit('message', {
        type: SerialWorkerResponseType.FW_PROGRESS,
        payload: { transferId: 'xfer-1' },
      });
      worker.emit('message', {
        type: SerialWorkerResponseType.FW_DEPLOY_DONE,
        payload: { transferId: 'xfer-1' },
      });

      expect(handler).not.toHaveBeenCalled();
    });

    it('disposer detaches the listener so subsequent emits are ignored', () => {
      const worker = createMockWorker();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bus = new WorkerSerialBus({ worker: worker as any });
      const handler = vi.fn();

      const dispose = bus.subscribeFwAcks('xfer-1', handler);

      const msg: FwChunkAckResponse = {
        type: SerialWorkerResponseType.FW_CHUNK_ACK,
        payload: {
          transferId: 'xfer-1',
          highestContiguousSeq: 1,
          nextExpectedSeq: 2,
          windowRemaining: 16,
        },
      };
      worker.emit('message', msg);
      expect(handler).toHaveBeenCalledTimes(1);

      dispose();

      worker.emit('message', msg);
      expect(handler).toHaveBeenCalledTimes(1);
      // Sanity-check the disposer actually unhooked the listener (no leak).
      expect(worker.listenerCount('message')).toBe(0);
    });

    it('multiple concurrent subscribers are independent', () => {
      // c.6c will run only one streamer at a time (JobLock), but the bus
      // contract still has to support more than one subscriber without
      // crosstalk — each disposer must remove only its own listener.
      const worker = createMockWorker();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bus = new WorkerSerialBus({ worker: worker as any });
      const handlerA = vi.fn();
      const handlerB = vi.fn();

      const disposeA = bus.subscribeFwAcks('xfer-A', handlerA);
      bus.subscribeFwAcks('xfer-B', handlerB);

      worker.emit('message', {
        type: SerialWorkerResponseType.FW_CHUNK_ACK,
        payload: {
          transferId: 'xfer-A',
          highestContiguousSeq: 1,
          nextExpectedSeq: 2,
          windowRemaining: 16,
        },
      } satisfies FwChunkAckResponse);
      worker.emit('message', {
        type: SerialWorkerResponseType.FW_CHUNK_ACK,
        payload: {
          transferId: 'xfer-B',
          highestContiguousSeq: 7,
          nextExpectedSeq: 8,
          windowRemaining: 12,
        },
      } satisfies FwChunkAckResponse);

      expect(handlerA).toHaveBeenCalledTimes(1);
      expect(handlerB).toHaveBeenCalledTimes(1);

      disposeA();

      worker.emit('message', {
        type: SerialWorkerResponseType.FW_CHUNK_ACK,
        payload: {
          transferId: 'xfer-A',
          highestContiguousSeq: 2,
          nextExpectedSeq: 3,
          windowRemaining: 16,
        },
      } satisfies FwChunkAckResponse);
      worker.emit('message', {
        type: SerialWorkerResponseType.FW_CHUNK_ACK,
        payload: {
          transferId: 'xfer-B',
          highestContiguousSeq: 8,
          nextExpectedSeq: 9,
          windowRemaining: 11,
        },
      } satisfies FwChunkAckResponse);

      expect(handlerA).toHaveBeenCalledTimes(1); // unchanged
      expect(handlerB).toHaveBeenCalledTimes(2);
    });
  });

  describe('subscribeDeployEvents', () => {
    it('dispatches FW_PROGRESS matching the transferId as { kind: "progress" }', () => {
      const worker = createMockWorker();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bus = new WorkerSerialBus({ worker: worker as any });
      const handler = vi.fn();

      bus.subscribeDeployEvents('xfer-1', handler);

      const msg: FwProgressResponse = {
        type: SerialWorkerResponseType.FW_PROGRESS,
        payload: {
          transferId: 'xfer-1',
          controllerId: 'core',
          stage: FwStage.Sending,
          bytesSent: 1024,
          totalBytes: 8192,
          detail: '',
        },
      };
      worker.emit('message', msg);

      expect(handler).toHaveBeenCalledTimes(1);
      const event = handler.mock.calls[0][0] as FwDeployEvent;
      expect(event.kind).toBe('progress');
      if (event.kind === 'progress') {
        expect(event.payload.transferId).toBe('xfer-1');
        expect(event.payload.controllerId).toBe('core');
        expect(event.payload.stage).toBe(FwStage.Sending);
        expect(event.payload.bytesSent).toBe(1024);
        expect(event.payload.totalBytes).toBe(8192);
      }
    });

    it('dispatches FW_DEPLOY_DONE matching the transferId as { kind: "done" }', () => {
      const worker = createMockWorker();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bus = new WorkerSerialBus({ worker: worker as any });
      const handler = vi.fn();

      bus.subscribeDeployEvents('xfer-1', handler);

      const msg: FwDeployDoneResponse = {
        type: SerialWorkerResponseType.FW_DEPLOY_DONE,
        payload: {
          transferId: 'xfer-1',
          results: [
            { controllerId: 'core', outcome: 'OK', finalVersion: '1.2.3', error: '' },
            {
              controllerId: 'dome',
              outcome: 'FAILED',
              finalVersion: '1.2.2',
              error: 'reboot_timeout',
            },
          ],
        },
      };
      worker.emit('message', msg);

      expect(handler).toHaveBeenCalledTimes(1);
      const event = handler.mock.calls[0][0] as FwDeployEvent;
      expect(event.kind).toBe('done');
      if (event.kind === 'done') {
        expect(event.payload.transferId).toBe('xfer-1');
        expect(event.payload.results).toHaveLength(2);
        expect(event.payload.results[0]).toEqual({
          controllerId: 'core',
          outcome: 'OK',
          finalVersion: '1.2.3',
          error: '',
        });
        expect(event.payload.results[1].outcome).toBe('FAILED');
        expect(event.payload.results[1].error).toBe('reboot_timeout');
      }
    });

    it('filters out FW_PROGRESS whose transferId does not match', () => {
      const worker = createMockWorker();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bus = new WorkerSerialBus({ worker: worker as any });
      const handler = vi.fn();

      bus.subscribeDeployEvents('xfer-1', handler);

      const msg: FwProgressResponse = {
        type: SerialWorkerResponseType.FW_PROGRESS,
        payload: {
          transferId: 'xfer-2',
          controllerId: 'core',
          stage: FwStage.Sending,
          bytesSent: 0,
          totalBytes: 8192,
          detail: '',
        },
      };
      worker.emit('message', msg);

      expect(handler).not.toHaveBeenCalled();
    });

    it('ignores non-deploy worker messages (FW_CHUNK_ACK, FW_TRANSFER_BEGIN_ACK, FW_TRANSFER_END_ACK, FW_CHUNK_NAK, FW_BACKPRESSURE, POLL)', () => {
      // The orchestrator must not see upload-phase acks/naks or unrelated
      // worker traffic — only the two deploy-phase events. Anything else gets
      // dropped. This is the symmetric guarantee to the streamer's
      // "FwInboundAck does not include progress/done" contract.
      const worker = createMockWorker();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bus = new WorkerSerialBus({ worker: worker as any });
      const handler = vi.fn();

      bus.subscribeDeployEvents('xfer-1', handler);

      const beginAck: FwTransferBeginAckResponse = {
        type: SerialWorkerResponseType.FW_TRANSFER_BEGIN_ACK,
        payload: { transferId: 'xfer-1', status: 'OK' },
      };
      const chunkAck: FwChunkAckResponse = {
        type: SerialWorkerResponseType.FW_CHUNK_ACK,
        payload: {
          transferId: 'xfer-1',
          highestContiguousSeq: 1,
          nextExpectedSeq: 2,
          windowRemaining: 16,
        },
      };
      const chunkNak: FwChunkNakResponse = {
        type: SerialWorkerResponseType.FW_CHUNK_NAK,
        payload: { transferId: 'xfer-1', lastGoodSeq: 0, reasonCode: 'CRC' },
      };
      const endAck: FwTransferEndAckResponse = {
        type: SerialWorkerResponseType.FW_TRANSFER_END_ACK,
        payload: { transferId: 'xfer-1', status: 'OK', computedSha256Hex: 'a'.repeat(64) },
      };
      const backpressure: FwBackpressureResponse = {
        type: SerialWorkerResponseType.FW_BACKPRESSURE,
        payload: { transferId: 'xfer-1', action: 'PAUSE', reason: 'master_busy' },
      };
      const poll: PollResponse = {
        type: SerialWorkerResponseType.POLL,
        controller: { id: '', name: 'mod', address: 'aa:bb' },
      };

      worker.emit('message', beginAck);
      worker.emit('message', chunkAck);
      worker.emit('message', chunkNak);
      worker.emit('message', endAck);
      worker.emit('message', backpressure);
      worker.emit('message', poll);

      expect(handler).not.toHaveBeenCalled();
    });

    it('disposer detaches the listener so subsequent emits are ignored', () => {
      const worker = createMockWorker();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bus = new WorkerSerialBus({ worker: worker as any });
      const handler = vi.fn();

      const before = worker.listenerCount('message');
      const dispose = bus.subscribeDeployEvents('xfer-1', handler);
      expect(worker.listenerCount('message')).toBe(before + 1);

      const msg: FwProgressResponse = {
        type: SerialWorkerResponseType.FW_PROGRESS,
        payload: {
          transferId: 'xfer-1',
          controllerId: 'core',
          stage: FwStage.Sending,
          bytesSent: 100,
          totalBytes: 8192,
          detail: '',
        },
      };
      worker.emit('message', msg);
      expect(handler).toHaveBeenCalledTimes(1);

      dispose();

      // listenerCount drops back by exactly one — disposer removed only its listener.
      expect(worker.listenerCount('message')).toBe(before);

      worker.emit('message', msg);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('multiple concurrent subscribers on distinct transferIds are independent', () => {
      // Two flash jobs cannot run concurrently in c.6c (JobLock), but the
      // bus contract still has to support more than one subscriber without
      // crosstalk — each transferId-scoped handler must see only its own
      // events, and disposing one must not silence the other.
      const worker = createMockWorker();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bus = new WorkerSerialBus({ worker: worker as any });
      const handlerA = vi.fn();
      const handlerB = vi.fn();

      const disposeA = bus.subscribeDeployEvents('xfer-A', handlerA);
      bus.subscribeDeployEvents('xfer-B', handlerB);

      worker.emit('message', {
        type: SerialWorkerResponseType.FW_PROGRESS,
        payload: {
          transferId: 'xfer-A',
          controllerId: 'core',
          stage: FwStage.Sending,
          bytesSent: 256,
          totalBytes: 8192,
          detail: '',
        },
      } satisfies FwProgressResponse);
      worker.emit('message', {
        type: SerialWorkerResponseType.FW_PROGRESS,
        payload: {
          transferId: 'xfer-B',
          controllerId: 'dome',
          stage: FwStage.Verifying,
          bytesSent: 8192,
          totalBytes: 8192,
          detail: '',
        },
      } satisfies FwProgressResponse);

      expect(handlerA).toHaveBeenCalledTimes(1);
      expect(handlerB).toHaveBeenCalledTimes(1);

      disposeA();

      worker.emit('message', {
        type: SerialWorkerResponseType.FW_DEPLOY_DONE,
        payload: {
          transferId: 'xfer-A',
          results: [{ controllerId: 'core', outcome: 'OK', finalVersion: '1.0.0', error: '' }],
        },
      } satisfies FwDeployDoneResponse);
      worker.emit('message', {
        type: SerialWorkerResponseType.FW_DEPLOY_DONE,
        payload: {
          transferId: 'xfer-B',
          results: [{ controllerId: 'dome', outcome: 'OK', finalVersion: '1.0.0', error: '' }],
        },
      } satisfies FwDeployDoneResponse);

      expect(handlerA).toHaveBeenCalledTimes(1); // unchanged after disposer
      expect(handlerB).toHaveBeenCalledTimes(2);
    });
  });
});
