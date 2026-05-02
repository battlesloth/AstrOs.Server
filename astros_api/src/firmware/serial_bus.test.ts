import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'events';
import { WorkerSerialBus } from './serial_bus.js';
import { SerialWorkerResponseType } from '../serial/serial_worker_response.js';
import type {
  FwBackpressureResponse,
  FwChunkAckResponse,
  FwChunkNakResponse,
  FwTransferBeginAckResponse,
  FwTransferEndAckResponse,
  PollResponse,
} from '../serial/serial_worker_response.js';
import type { FwInboundAck } from '../models/firmware/chunk_streamer.js';

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
    it("forwards 'firmware'-kind sends via worker.postMessage", () => {
      const worker = createMockWorker();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bus = new WorkerSerialBus({ worker: worker as any });

      bus.send('payload-fw', { kind: 'firmware' });

      expect(worker.postMessage).toHaveBeenCalledTimes(1);
      expect(worker.postMessage).toHaveBeenCalledWith('payload-fw');
    });

    it("forwards 'normal'-kind sends via worker.postMessage too (c.6b does not enforce drop-when-locked)", () => {
      // c.6c will add a JobLock-aware drop policy on top of `kind`. c.6b's
      // job is just to wire the interface — both kinds must reach the worker
      // so the existing non-firmware traffic keeps flowing while we layer in
      // the streamer.
      const worker = createMockWorker();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bus = new WorkerSerialBus({ worker: worker as any });

      bus.send('payload-normal', { kind: 'normal' });

      expect(worker.postMessage).toHaveBeenCalledTimes(1);
      expect(worker.postMessage).toHaveBeenCalledWith('payload-normal');
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
});
