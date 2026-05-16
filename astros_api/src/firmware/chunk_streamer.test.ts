import { promises as fsp } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  FwInboundAck,
  SerialBus,
  TransferResult,
  TransferSpec,
} from '../models/firmware/chunk_streamer.js';
import type { FwDeployEvent } from '../models/firmware/flash_orchestrator.js';
import type {
  FwBackpressure,
  FwBackpressureAction,
  FwChunkAck,
  FwChunkNak,
  FwChunkNakReason,
  FwTransferBeginAck,
  FwTransferEndAck,
} from '../models/firmware/firmware_messages.js';
import { ChunkStreamer } from './chunk_streamer.js';

// Inline FakeSerialBus — co-located with the streamer tests. If another suite
// ever needs to share this, lift to chunk_streamer_testing.ts. Keeping it
// inline keeps the surface area small and discourages accidental coupling
// between streamer tests and other suites.
type SendKind = Parameters<SerialBus['send']>[1]['kind'];

class FakeSerialBus implements SerialBus {
  readonly sent: Array<{ payload: string; kind: SendKind }> = [];
  // Map keyed by transferId. The streamer subscribes once at the start of
  // run(), so a single-entry map is enough; using a map keeps the contract
  // ready for the multi-streamer future without leaking implementation detail.
  readonly subscribers = new Map<string, (ack: FwInboundAck) => void>();

  send(payload: string, opts: { kind: SendKind }): void {
    this.sent.push({ payload, kind: opts.kind });
  }

  subscribeFwAcks(transferId: string, handler: (ack: FwInboundAck) => void): () => void {
    this.subscribers.set(transferId, handler);
    return () => {
      this.subscribers.delete(transferId);
    };
  }

  // No-op deploy-event subscriber to satisfy the SerialBus interface
  // (added in c.6c.1 Task 2). The streamer doesn't consume deploy events —
  // those flow to the orchestrator. These tests exercise upload-phase
  // behavior only, so no handler is ever invoked. The disposer is a no-op
  // for the same reason. flash_orchestrator.test.ts's FakeSerialBus has
  // the real impl with a `deliverDeployEvent` driver.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  subscribeDeployEvents(_transferId: string, _handler: (event: FwDeployEvent) => void): () => void {
    return () => {
      /* no-op disposer — these tests never subscribe to deploy events. */
    };
  }

  // Test-only helper: synthesize an inbound ack for a given transferId.
  deliver(transferId: string, ack: FwInboundAck): void {
    const handler = this.subscribers.get(transferId);
    if (!handler) {
      throw new Error(`FakeSerialBus.deliver: no subscriber for transferId=${transferId}`);
    }
    handler(ack);
  }
}

// Helpers ---------------------------------------------------------------------

const TRANSFER_ID = 'xfer-abc';
const SHA256_PLACEHOLDER = 'a'.repeat(64);

async function writeTempFirmware(bytes: Buffer): Promise<string> {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'chunk-streamer-test-'));
  const file = path.join(dir, 'firmware.bin');
  await fsp.writeFile(file, bytes);
  return file;
}

function specFor(filePath: string, sizeBytes: number): TransferSpec {
  return {
    transferId: TRANSFER_ID,
    source: { path: filePath, sha256: SHA256_PLACEHOLDER, sizeBytes },
    targets: ['core', 'master'],
  };
}

function beginAck(): FwInboundAck {
  return {
    kind: 'beginAck',
    transferId: TRANSFER_ID,
    status: 'OK',
  } satisfies { kind: 'beginAck' } & FwTransferBeginAck;
}

function chunkAck(highest: number, next: number): FwInboundAck {
  return {
    kind: 'chunkAck',
    transferId: TRANSFER_ID,
    highestContiguousSeq: highest,
    nextExpectedSeq: next,
    windowRemaining: 16,
  } satisfies { kind: 'chunkAck' } & FwChunkAck;
}

function chunkNak(
  lastGoodSeq: number,
  reasonCode: FwChunkNakReason,
  // Defaults to `lastGoodSeq + 1` for caller convenience — this matches what
  // a conformant master would send on a regular NAK, not a protocol guarantee.
  // First-chunk NAK callers must pass explicit nextExpectedSeq=0 because
  // lastGoodSeq=0 means "nothing committed" rather than "seq 0 committed".
  nextExpectedSeq: number = lastGoodSeq + 1,
): FwInboundAck {
  return {
    kind: 'chunkNak',
    transferId: TRANSFER_ID,
    lastGoodSeq,
    nextExpectedSeq,
    reasonCode,
  } satisfies { kind: 'chunkNak' } & FwChunkNak;
}

function endAck(status: 'OK' | 'HASH_MISMATCH' | 'IO_ERROR' = 'OK'): FwInboundAck {
  return {
    kind: 'transferEndAck',
    transferId: TRANSFER_ID,
    status,
    computedSha256Hex: SHA256_PLACEHOLDER,
  } satisfies { kind: 'transferEndAck' } & FwTransferEndAck;
}

function backpressure(action: FwBackpressureAction, reason = 'master_busy'): FwInboundAck {
  return {
    kind: 'backpressure',
    transferId: TRANSFER_ID,
    action,
    reason,
  } satisfies { kind: 'backpressure' } & FwBackpressure;
}

// Drives the BEGIN→CHUNK→END handshake. Because the streamer awaits each ack
// synchronously, every step must be deferred just enough for the streamer to
// reach the next bus.send() before we deliver. We yield through macrotasks
// (setImmediate) rather than microtasks so the streamer's `await fsp.readFile`
// is allowed to complete — microtask-only yields would starve the event loop.
//
// We bound the wait by wall-clock time rather than by iteration count: under
// heavy parallel test load (vitest runs many files in parallel; libuv's fs
// thread pool is contended), `fsp.readFile` can take longer than a fixed
// number of setImmediate cycles. A wall-clock bound is robust to that — the
// only thing it costs in the failure case is the elapsed milliseconds.
//
// Most suites have no time-dependent logic, so real timers are fine. Suites
// that drive timer-based behavior (per-chunk timeout, watchdog, etc.) opt in
// with `vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })`,
// deliberately leaving Date and setImmediate un-faked so this same `waitFor`
// helper continues to work without a parallel fake-timer-aware variant.
async function waitFor(predicate: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise<void>((r) => setImmediate(r));
  }
  throw new Error(`waitFor(${label}) timed out after 4000ms`);
}

function scheduleHappyPath(bus: FakeSerialBus): Promise<void> {
  return (async (): Promise<void> => {
    await waitFor(() => bus.sent.length >= 1, 'BEGIN sent');
    bus.deliver(TRANSFER_ID, beginAck());
    await waitFor(() => bus.sent.length >= 2, 'CHUNK sent');
    bus.deliver(TRANSFER_ID, chunkAck(0, 1));
    await waitFor(() => bus.sent.length >= 3, 'END sent');
    bus.deliver(TRANSFER_ID, endAck('OK'));
  })();
}

// -----------------------------------------------------------------------------

describe('ChunkStreamer — single-chunk happy path', () => {
  let tempPath: string;

  beforeEach(async () => {
    tempPath = await writeTempFirmware(Buffer.from('A'.repeat(100)));
  });

  afterEach(async () => {
    await fsp.rm(path.dirname(tempPath), { recursive: true, force: true });
  });

  it('drives BEGIN → CHUNK → END and resolves with the right TransferResult', async () => {
    const bus = new FakeSerialBus();
    const streamer = new ChunkStreamer({ bus });
    const observer = {};

    const driver = scheduleHappyPath(bus);
    const result: TransferResult = await streamer.run(specFor(tempPath, 100), observer);
    await driver;

    expect(result.transferId).toBe(TRANSFER_ID);
    expect(result.totalBytesSent).toBe(100);
    expect(result.totalChunks).toBe(1);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.endAck.transferId).toBe(TRANSFER_ID);
    expect(result.endAck.status).toBe('OK');
  });

  it('sends BEGIN, then CHUNK, then END in order — each with kind: firmware', async () => {
    const bus = new FakeSerialBus();
    const streamer = new ChunkStreamer({ bus });

    const driver = scheduleHappyPath(bus);
    await streamer.run(specFor(tempPath, 100), {});
    await driver;

    expect(bus.sent).toHaveLength(3);
    for (const entry of bus.sent) {
      expect(entry.kind).toBe('firmware');
    }
    // The wire framing comes from MessageGenerator (c.1). We don't assert the
    // full payload byte-for-byte — that's tested in message_generator.test.ts —
    // but we do verify each step's payload contains the type's mnemonic so a
    // wrong-step regression (e.g. CHUNK before BEGIN) would fail.
    expect(bus.sent[0].payload).toContain('FW_TRANSFER_BEGIN');
    expect(bus.sent[1].payload).toContain('FW_CHUNK');
    expect(bus.sent[2].payload).toContain('FW_TRANSFER_END');
  });

  it('invokes onTransferBegun, onChunkAck, onTransferEnd in order with the right args', async () => {
    const bus = new FakeSerialBus();
    const streamer = new ChunkStreamer({ bus });
    const onTransferBegun = vi.fn();
    const onChunkAck = vi.fn();
    const onTransferEnd = vi.fn();
    const callOrder: string[] = [];
    onTransferBegun.mockImplementation(() => callOrder.push('begun'));
    onChunkAck.mockImplementation(() => callOrder.push('chunkAck'));
    onTransferEnd.mockImplementation(() => callOrder.push('end'));

    const driver = scheduleHappyPath(bus);
    await streamer.run(specFor(tempPath, 100), {
      onTransferBegun,
      onChunkAck,
      onTransferEnd,
    });
    await driver;

    expect(callOrder).toEqual(['begun', 'chunkAck', 'end']);
    expect(onTransferBegun).toHaveBeenCalledWith(
      expect.objectContaining({ transferId: TRANSFER_ID, status: 'OK' }),
    );
    // Skeleton: highestContiguousSeq=0, bytesSent=full payload (single chunk).
    expect(onChunkAck).toHaveBeenCalledWith(0, 100);
    expect(onTransferEnd).toHaveBeenCalledWith(
      expect.objectContaining({ transferId: TRANSFER_ID, status: 'OK' }),
    );
  });

  it('disposes the FwAcks subscriber on resolve', async () => {
    const bus = new FakeSerialBus();
    const streamer = new ChunkStreamer({ bus });

    const driver = scheduleHappyPath(bus);
    await streamer.run(specFor(tempPath, 100), {});
    await driver;

    expect(bus.subscribers.size).toBe(0);
  });
});

describe('ChunkStreamer — sliding window', () => {
  // Counts FW_CHUNK sends in bus.sent. The first message is BEGIN; chunk
  // messages follow until END is sent at the very end. Used by waitFor
  // predicates that need to count outgoing chunks.
  function chunkSendCount(bus: FakeSerialBus): number {
    return bus.sent.filter((s) => s.payload.includes('FW_CHUNK')).length;
  }

  // Drives the BEGIN handshake but leaves the chunk phase to the test body.
  // After this resolves, the streamer has been informed that BEGIN_ACK
  // arrived and the in-flight window has been filled with up to WINDOW_SIZE
  // chunks. Returns once the initial fill has reached the expected count.
  async function driveBeginAndAwaitInitialFill(
    bus: FakeSerialBus,
    expectedInitialFill: number,
  ): Promise<void> {
    await waitFor(() => bus.sent.length >= 1, 'BEGIN sent');
    bus.deliver(TRANSFER_ID, beginAck());
    await waitFor(
      () => chunkSendCount(bus) >= expectedInitialFill,
      `initial window fill (${expectedInitialFill} chunks)`,
    );
  }

  it('window-aligned 16-chunk transfer: fills window, single cumulative ACK retires all 16', async () => {
    // 16 * 4096 = 65,536 bytes — exactly one full window at the default config.
    const buf = Buffer.alloc(16 * 4096, 0x42);
    const tempPath = await writeTempFirmware(buf);
    try {
      const bus = new FakeSerialBus();
      const streamer = new ChunkStreamer({ bus });
      const onChunkAck = vi.fn();

      const driver = (async (): Promise<void> => {
        // Initial fill: all 16 chunks should be sent before any ACK arrives.
        await driveBeginAndAwaitInitialFill(bus, 16);
        // Sanity: BEGIN + 16 chunks, no END yet.
        expect(bus.sent.length).toBe(17);
        expect(bus.sent[0].payload).toContain('FW_TRANSFER_BEGIN');
        expect(chunkSendCount(bus)).toBe(16);

        // One cumulative ACK retires all 16.
        bus.deliver(TRANSFER_ID, chunkAck(15, 16));

        await waitFor(
          () => bus.sent.some((s) => s.payload.includes('FW_TRANSFER_END')),
          'END sent',
        );
        bus.deliver(TRANSFER_ID, endAck('OK'));
      })();

      const result = await streamer.run(specFor(tempPath, buf.length), { onChunkAck });
      await driver;

      expect(result.totalChunks).toBe(16);
      expect(result.totalBytesSent).toBe(buf.length);
      // Single chunk-ack call: highestContiguousSeq=15, bytesSent=full payload.
      expect(onChunkAck).toHaveBeenCalledTimes(1);
      expect(onChunkAck).toHaveBeenCalledWith(15, buf.length);
      expect(bus.subscribers.size).toBe(0);
    } finally {
      await fsp.rm(path.dirname(tempPath), { recursive: true, force: true });
    }
  });

  it('large transfer (300 chunks): progressive ACKs drain and refill the window to completion', async () => {
    // 300 chunks at 100 bytes each = 30,000 bytes. Smaller-than-default
    // chunkSize keeps the test buffer tiny while still exercising 300 chunks.
    const chunkSize = 100;
    const totalChunks = 300;
    const buf = Buffer.alloc(chunkSize * totalChunks, 0x55);
    const tempPath = await writeTempFirmware(buf);
    try {
      const bus = new FakeSerialBus();
      const streamer = new ChunkStreamer({ bus, config: { chunkSizeBytes: chunkSize } });
      const onChunkAck = vi.fn();

      const driver = (async (): Promise<void> => {
        // Initial fill is WINDOW_SIZE (16) chunks.
        await driveBeginAndAwaitInitialFill(bus, 16);
        expect(chunkSendCount(bus)).toBe(16);

        // Walk acks in batches of 4 until everything is acked. After each ack,
        // wait for the streamer to top the window back up to its previous
        // high-water mark (or the lastSeq, whichever comes first).
        let highest = -1;
        const batch = 4;
        while (highest < totalChunks - 1) {
          const newHighest = Math.min(highest + batch, totalChunks - 1);
          bus.deliver(TRANSFER_ID, chunkAck(newHighest, newHighest + 1));
          // After this ack, the streamer should top the window up so that the
          // total sent count is min(newHighest + 1 + WINDOW_SIZE, totalChunks).
          const expectedSent = Math.min(newHighest + 1 + 16, totalChunks);
          await waitFor(
            () => chunkSendCount(bus) >= expectedSent,
            `top-up after ack ${newHighest} (expect ${expectedSent} chunks sent)`,
          );
          highest = newHighest;
        }

        await waitFor(
          () => bus.sent.some((s) => s.payload.includes('FW_TRANSFER_END')),
          'END sent',
        );
        bus.deliver(TRANSFER_ID, endAck('OK'));
      })();

      const result = await streamer.run(specFor(tempPath, buf.length), { onChunkAck });
      await driver;

      expect(result.totalChunks).toBe(totalChunks);
      expect(result.totalBytesSent).toBe(buf.length);
      expect(chunkSendCount(bus)).toBe(totalChunks);
      // 300 / 4 = 75 acks delivered.
      expect(onChunkAck).toHaveBeenCalledTimes(75);
      // Final ack: highestContiguousSeq = 299, bytesSent capped at buf.length.
      const finalCall = onChunkAck.mock.calls[onChunkAck.mock.calls.length - 1];
      expect(finalCall).toEqual([totalChunks - 1, buf.length]);
      expect(bus.subscribers.size).toBe(0);
    } finally {
      await fsp.rm(path.dirname(tempPath), { recursive: true, force: true });
    }
  });

  it('cumulative ACK consolidation: one ACK retires 5 in-flight chunks; window tops up by 4', async () => {
    // 20 chunks at 100 bytes each. Window size is 16 (default), so initial
    // fill sends seq 0..15 and 16..19 remain unsent. One ACK retiring seq 0..4
    // frees 5 slots; only 4 chunks remain to send (16, 17, 18, 19).
    const chunkSize = 100;
    const totalChunks = 20;
    const buf = Buffer.alloc(chunkSize * totalChunks, 0x77);
    const tempPath = await writeTempFirmware(buf);
    try {
      const bus = new FakeSerialBus();
      const streamer = new ChunkStreamer({ bus, config: { chunkSizeBytes: chunkSize } });
      const onChunkAck = vi.fn();

      const driver = (async (): Promise<void> => {
        await driveBeginAndAwaitInitialFill(bus, 16);
        expect(chunkSendCount(bus)).toBe(16);

        // Cumulative ACK retires seq 0..4 (5 in-flight chunks).
        bus.deliver(TRANSFER_ID, chunkAck(4, 5));
        // Top-up should send the remaining 4 chunks (seq 16..19) — not 5,
        // because lastSeq=19 caps further sends.
        await waitFor(() => chunkSendCount(bus) >= 20, 'top-up after consolidation ack');
        expect(chunkSendCount(bus)).toBe(20);
        // Observer sees one ack with bytesSent = (4+1) * 100 = 500.
        expect(onChunkAck).toHaveBeenCalledTimes(1);
        expect(onChunkAck).toHaveBeenCalledWith(4, 500);

        // Drain the rest with one final cumulative ack.
        bus.deliver(TRANSFER_ID, chunkAck(19, 20));
        await waitFor(
          () => bus.sent.some((s) => s.payload.includes('FW_TRANSFER_END')),
          'END sent',
        );
        bus.deliver(TRANSFER_ID, endAck('OK'));
      })();

      const result = await streamer.run(specFor(tempPath, buf.length), { onChunkAck });
      await driver;

      expect(result.totalChunks).toBe(totalChunks);
      expect(chunkSendCount(bus)).toBe(totalChunks);
      // Two acks total: one consolidating, one final.
      expect(onChunkAck).toHaveBeenCalledTimes(2);
      expect(onChunkAck.mock.calls[0]).toEqual([4, 500]);
      expect(onChunkAck.mock.calls[1]).toEqual([19, buf.length]);
      expect(bus.subscribers.size).toBe(0);
    } finally {
      await fsp.rm(path.dirname(tempPath), { recursive: true, force: true });
    }
  });

  it('observer.onChunkAck receives correct (highestContiguousSeq, bytesSent) per ack — capped at sourceBuffer.length', async () => {
    // Use a non-window-aligned tail so the bytesSent cap is exercised on the
    // final ack: 18 chunks at 100 bytes = 1,800 bytes. The last ack reports
    // highest=17, bytesSent should be exactly 1800 (not 18 * 100 if chunkSize
    // happened to be larger — they match here, but the cap path is taken).
    const chunkSize = 100;
    const totalChunks = 18;
    const totalBytes = chunkSize * totalChunks;
    const buf = Buffer.alloc(totalBytes, 0x33);
    const tempPath = await writeTempFirmware(buf);
    try {
      const bus = new FakeSerialBus();
      const streamer = new ChunkStreamer({ bus, config: { chunkSizeBytes: chunkSize } });
      const onChunkAck = vi.fn();

      const driver = (async (): Promise<void> => {
        await driveBeginAndAwaitInitialFill(bus, 16);

        // Ack seq 7 → bytesSent = 8 * 100 = 800.
        bus.deliver(TRANSFER_ID, chunkAck(7, 8));
        await waitFor(() => chunkSendCount(bus) >= 18, 'top-up after seq 7 ack');

        // Final ack: seq 17, bytesSent = 18 * 100 = 1800 (== buf.length).
        bus.deliver(TRANSFER_ID, chunkAck(totalChunks - 1, totalChunks));
        await waitFor(
          () => bus.sent.some((s) => s.payload.includes('FW_TRANSFER_END')),
          'END sent',
        );
        bus.deliver(TRANSFER_ID, endAck('OK'));
      })();

      await streamer.run(specFor(tempPath, totalBytes), { onChunkAck });
      await driver;

      expect(onChunkAck).toHaveBeenCalledTimes(2);
      expect(onChunkAck.mock.calls[0]).toEqual([7, 800]);
      expect(onChunkAck.mock.calls[1]).toEqual([17, totalBytes]);
    } finally {
      await fsp.rm(path.dirname(tempPath), { recursive: true, force: true });
    }
  });

  it('does not fire onChunkAck twice for a duplicate cumulative ACK', async () => {
    // Real-world hazard locked in: master retransmits a cumulative ACK (e.g.
    // its NIC-level retry kicks in, or a stale ACK arrives in the gap between
    // resolveChunkPhaseDone firing and the END-phase waiter being installed).
    // The monotonic guard prevents highestAcked from rolling back, but the
    // observer call must also be gated on cursor advance — otherwise the UI
    // would see a duplicate progress event with the same (lastSeq, bytes)
    // data and "complete twice."
    //
    // We deliver the seq=4 cumulative ACK twice in a row before END is sent.
    // After the first ACK, highestAcked==lastSeq==4 and the chunk phase is
    // released. The second ACK arrives while currentWaiter is still null
    // (the END-wait waiter has not yet been installed), so it routes to
    // handleChunkAck — exercising the duplicate-ACK path.
    const chunkSize = 100;
    const totalChunks = 5;
    const buf = Buffer.alloc(chunkSize * totalChunks, 0x99);
    const tempPath = await writeTempFirmware(buf);
    try {
      const bus = new FakeSerialBus();
      const streamer = new ChunkStreamer({ bus, config: { chunkSizeBytes: chunkSize } });
      const onChunkAck = vi.fn();

      const driver = (async (): Promise<void> => {
        // 5 chunks fit inside the default window — initial fill sends all 5.
        await driveBeginAndAwaitInitialFill(bus, totalChunks);
        expect(chunkSendCount(bus)).toBe(totalChunks);

        // First cumulative ACK retires all 5. Streamer transitions to END.
        bus.deliver(TRANSFER_ID, chunkAck(totalChunks - 1, totalChunks));
        // Duplicate cumulative ACK — same highestContiguousSeq. Delivered
        // synchronously here; in production this models a master retransmit
        // arriving while the streamer is still mid-transition to the END
        // phase (currentWaiter === null).
        bus.deliver(TRANSFER_ID, chunkAck(totalChunks - 1, totalChunks));

        await waitFor(
          () => bus.sent.some((s) => s.payload.includes('FW_TRANSFER_END')),
          'END sent',
        );
        bus.deliver(TRANSFER_ID, endAck('OK'));
      })();

      const result = await streamer.run(specFor(tempPath, buf.length), { onChunkAck });
      await driver;

      expect(result.totalChunks).toBe(totalChunks);
      // Critical assertion: observer fires exactly ONCE despite two ACKs.
      expect(onChunkAck).toHaveBeenCalledTimes(1);
      expect(onChunkAck).toHaveBeenCalledWith(totalChunks - 1, buf.length);
      expect(bus.subscribers.size).toBe(0);
    } finally {
      await fsp.rm(path.dirname(tempPath), { recursive: true, force: true });
    }
  });

  it('silently drops a chunkAck arriving during BEGIN-wait phase', async () => {
    // Locks in the phase-aware dispatcher's "drop unexpected acks" policy:
    // a chunkAck arriving while currentWaiter is set (BEGIN-wait or END-wait)
    // must be ignored — no exception, no observer call. A future
    // "improvement" that, e.g., starts logging or throwing on out-of-phase
    // acks would trip this test deliberately rather than silently shipping
    // a regression.
    const chunkSize = 100;
    const totalChunks = 5;
    const buf = Buffer.alloc(chunkSize * totalChunks, 0xab);
    const tempPath = await writeTempFirmware(buf);
    try {
      const bus = new FakeSerialBus();
      const streamer = new ChunkStreamer({ bus, config: { chunkSizeBytes: chunkSize } });
      const onChunkAck = vi.fn();

      const driver = (async (): Promise<void> => {
        // Wait for BEGIN to hit the wire. At this moment the streamer is in
        // BEGIN-wait — currentWaiter is the begin-ack waiter — and zero
        // chunks have been sent.
        await waitFor(() => bus.sent.length >= 1, 'BEGIN sent');
        expect(chunkSendCount(bus)).toBe(0);

        // Out-of-phase chunkAck during BEGIN-wait. Dispatcher must drop it
        // silently: no observer call, no thrown exception, no progress.
        bus.deliver(TRANSFER_ID, chunkAck(0, 1));
        // No chunks should have been sent in response — we are still in BEGIN.
        expect(chunkSendCount(bus)).toBe(0);
        expect(onChunkAck).not.toHaveBeenCalled();

        // Now deliver BEGIN_ACK; the run continues normally.
        bus.deliver(TRANSFER_ID, beginAck());
        await waitFor(() => chunkSendCount(bus) >= totalChunks, 'initial fill after BEGIN');
        bus.deliver(TRANSFER_ID, chunkAck(totalChunks - 1, totalChunks));
        await waitFor(
          () => bus.sent.some((s) => s.payload.includes('FW_TRANSFER_END')),
          'END sent',
        );
        bus.deliver(TRANSFER_ID, endAck('OK'));
      })();

      // run() must resolve successfully — the dropped ACK didn't poison state.
      const result = await streamer.run(specFor(tempPath, buf.length), { onChunkAck });
      await driver;

      expect(result.totalChunks).toBe(totalChunks);
      expect(result.endAck.status).toBe('OK');
      // Observer was called exactly once for the legitimate post-BEGIN ack —
      // the BEGIN-phase ack was dropped on the floor as required.
      expect(onChunkAck).toHaveBeenCalledTimes(1);
      expect(onChunkAck).toHaveBeenCalledWith(totalChunks - 1, buf.length);
      expect(bus.subscribers.size).toBe(0);
    } finally {
      await fsp.rm(path.dirname(tempPath), { recursive: true, force: true });
    }
  });
});

describe('ChunkStreamer — NAK + Go-Back-N', () => {
  // Counts FW_CHUNK sends in bus.sent. Each call to bus.send increments
  // bus.sent by one entry, so resends after a NAK appear as additional
  // FW_CHUNK entries — meaning chunkSendCount climbs past the chunk count
  // when Go-Back-N retransmits.
  function chunkSendCount(bus: FakeSerialBus): number {
    return bus.sent.filter((s) => s.payload.includes('FW_CHUNK')).length;
  }

  // Same helper as the sliding-window suite — duplicated locally to keep
  // each describe independent. driveBeginAndAwaitInitialFill returns once
  // the streamer has filled the in-flight window with `expectedInitialFill`
  // chunks following BEGIN_ACK.
  async function driveBeginAndAwaitInitialFill(
    bus: FakeSerialBus,
    expectedInitialFill: number,
  ): Promise<void> {
    await waitFor(() => bus.sent.length >= 1, 'BEGIN sent');
    bus.deliver(TRANSFER_ID, beginAck());
    await waitFor(
      () => chunkSendCount(bus) >= expectedInitialFill,
      `initial window fill (${expectedInitialFill} chunks)`,
    );
  }

  it('NAK at lastGoodSeq=5 clears window, restarts from seq=6, and converges to completion', async () => {
    // 20 chunks at 100 bytes. Initial fill sends seq 0..15. Master NAKs
    // claiming seq 5 was the last good one (CRC error on seq 6, say). The
    // streamer must:
    //   - clear inFlight
    //   - set nextToSend = 6, highestAcked = 5
    //   - top-up the window with seq 6..19 (the remaining 14 chunks; 14 < 16
    //     so no further sends after that until acks free slots)
    // Total resent in this scenario: seq 6..15 from the initial window are
    // resent on top of the surviving 4 unsent (16..19). Net effect on
    // bus.sent: initial 16 chunks + 14 resends = 30 FW_CHUNK entries before
    // the first post-NAK ack.
    const chunkSize = 100;
    const totalChunks = 20;
    const buf = Buffer.alloc(chunkSize * totalChunks, 0x42);
    const tempPath = await writeTempFirmware(buf);
    try {
      const bus = new FakeSerialBus();
      const streamer = new ChunkStreamer({ bus, config: { chunkSizeBytes: chunkSize } });
      const onChunkNak = vi.fn();
      const onChunkAck = vi.fn();

      const driver = (async (): Promise<void> => {
        await driveBeginAndAwaitInitialFill(bus, 16);
        const sentBeforeNak = chunkSendCount(bus);
        expect(sentBeforeNak).toBe(16);

        // NAK with lastGoodSeq=5, reason=CRC. Triggers Go-Back-N from seq 6.
        bus.deliver(TRANSFER_ID, chunkNak(5, 'CRC'));

        // After Go-Back-N, the streamer should refill the window from seq 6.
        // Remaining chunks (seq 6..19) is 14, which is below windowSize 16,
        // so all 14 fire and the window stays partially filled. Total
        // bus.sent FW_CHUNK count climbs to 16 (initial) + 14 (refill) = 30.
        await waitFor(() => chunkSendCount(bus) >= 30, 'Go-Back-N refill from seq 6');
        expect(chunkSendCount(bus)).toBe(30);

        // Drain the rest with one cumulative ack covering seq 0..19.
        bus.deliver(TRANSFER_ID, chunkAck(totalChunks - 1, totalChunks));
        await waitFor(
          () => bus.sent.some((s) => s.payload.includes('FW_TRANSFER_END')),
          'END sent',
        );
        bus.deliver(TRANSFER_ID, endAck('OK'));
      })();

      const result = await streamer.run(specFor(tempPath, buf.length), {
        onChunkNak,
        onChunkAck,
      });
      await driver;

      expect(result.totalChunks).toBe(totalChunks);
      expect(result.endAck.status).toBe('OK');
      // Observer fired with (lastGoodSeq, nextExpectedSeq, reason).
      expect(onChunkNak).toHaveBeenCalledTimes(1);
      expect(onChunkNak).toHaveBeenCalledWith(5, 6, 'CRC');
      // Total sends: 16 initial + 14 Go-Back-N refill = 30 FW_CHUNK entries.
      expect(chunkSendCount(bus)).toBe(30);
      expect(bus.subscribers.size).toBe(0);
    } finally {
      await fsp.rm(path.dirname(tempPath), { recursive: true, force: true });
    }
  });

  it('first-chunk NAK with nextExpectedSeq=0 resumes from seq 0 (not seq 1)', async () => {
    // Regression for the cross-repo protocol bug fixed by adding
    // next-expected-seq to FW_CHUNK_NAK. On the very first chunk's NAK, the
    // master sends lastGoodSeq=0 because nothing has been committed yet.
    // A naive `nextToSend = lastGoodSeq + 1 = 1` would skip seq 0 entirely
    // and deadlock the transfer (master keeps NAKing missing seq 0, sender
    // keeps sending from seq 1). The streamer now uses nak.nextExpectedSeq
    // directly, which the master sets to 0 in this case.
    const chunkSize = 100;
    const totalChunks = 5;
    const buf = Buffer.alloc(chunkSize * totalChunks, 0x77);
    const tempPath = await writeTempFirmware(buf);
    try {
      const bus = new FakeSerialBus();
      const streamer = new ChunkStreamer({ bus, config: { chunkSizeBytes: chunkSize } });

      const driver = (async (): Promise<void> => {
        await driveBeginAndAwaitInitialFill(bus, 5); // window=16 caps at totalChunks=5
        const sentBeforeNak = chunkSendCount(bus);
        expect(sentBeforeNak).toBe(5);

        // First-chunk NAK: master rejects seq 0 (CRC failure on the wire).
        // lastGoodSeq=0, nextExpectedSeq=0 — the disambiguating value.
        bus.deliver(TRANSFER_ID, chunkNak(0, 'CRC', /*nextExpectedSeq=*/ 0));

        // Streamer must refill the window starting at seq 0 — NOT seq 1.
        // After the Go-Back-N: 5 (initial) + 5 (refill from seq 0) = 10.
        await waitFor(() => chunkSendCount(bus) >= 10, 'Go-Back-N refill from seq 0');
        expect(chunkSendCount(bus)).toBe(10);

        bus.deliver(TRANSFER_ID, chunkAck(totalChunks - 1, totalChunks));
        await waitFor(
          () => bus.sent.some((s) => s.payload.includes('FW_TRANSFER_END')),
          'END sent',
        );
        bus.deliver(TRANSFER_ID, endAck('OK'));
      })();

      const result = await streamer.run(specFor(tempPath, buf.length), {});
      await driver;

      expect(result.totalChunks).toBe(totalChunks);
      expect(result.endAck.status).toBe('OK');
      // 5 initial + 5 refill starting at seq 0 = 10. If the bug regressed
      // (nextToSend=1), the refill would only resend seq 1..4 = 4 chunks
      // and seq 0 would be missing → END would fail with a NAK that
      // would never get satisfied.
      expect(chunkSendCount(bus)).toBe(10);
    } finally {
      await fsp.rm(path.dirname(tempPath), { recursive: true, force: true });
    }
  });

  it('silently drops a duplicate first-chunk NAK after seq 0 has been ACKed', async () => {
    // Regression for the `isStale` guard in handleChunkNak. After a first-chunk
    // NAK recovery completes (seq 0 NAK → resend → ACK), a late-arriving
    // duplicate of the original NAK0 must be classified as stale and not
    // trigger a second Go-Back-N. Pre-fix, the guard was
    //   isStale = nak.lastGoodSeq < highestAcked
    // which on the duplicate evaluates `0 < 0 = false` and the streamer
    // re-rewound the transfer despite seq 0 already being committed.
    // Post-fix, the guard uses nextExpectedSeq:
    //   isStale = nak.nextExpectedSeq <= highestAcked
    // which on the duplicate evaluates `0 <= 0 = true` and the stale NAK
    // is correctly skipped.
    const chunkSize = 100;
    const totalChunks = 5;
    const buf = Buffer.alloc(chunkSize * totalChunks, 0x88);
    const tempPath = await writeTempFirmware(buf);
    try {
      const bus = new FakeSerialBus();
      const streamer = new ChunkStreamer({ bus, config: { chunkSizeBytes: chunkSize } });
      const onChunkNak = vi.fn();

      const driver = (async (): Promise<void> => {
        await driveBeginAndAwaitInitialFill(bus, 5);
        expect(chunkSendCount(bus)).toBe(5);

        // First-chunk NAK and recovery: send-count goes 5 → 10.
        bus.deliver(TRANSFER_ID, chunkNak(0, 'CRC', /*nextExpectedSeq=*/ 0));
        await waitFor(() => chunkSendCount(bus) >= 10, 'Go-Back-N refill from seq 0');
        expect(chunkSendCount(bus)).toBe(10);

        // Cumulative ACK retiring seq 0 → highestAcked advances to 0.
        bus.deliver(TRANSFER_ID, chunkAck(0, 1));

        // Snapshot before stale NAK.
        const sendsBeforeStale = chunkSendCount(bus);
        const nakCallsBeforeStale = onChunkNak.mock.calls.length;

        // Stale duplicate of the original first-chunk NAK. Pre-fix, this
        // would re-rewind: bump send-count by 4 (refill seq 1..4) and
        // fire onChunkNak a second time. Post-fix, both should be no-ops.
        bus.deliver(TRANSFER_ID, chunkNak(0, 'CRC', /*nextExpectedSeq=*/ 0));

        // Synchronous assertion: the dispatcher path is synchronous through
        // the stale-NAK guard, so any state mutation would have happened
        // by now.
        expect(chunkSendCount(bus)).toBe(sendsBeforeStale);
        expect(onChunkNak.mock.calls.length).toBe(nakCallsBeforeStale);

        // Drain the rest with a cumulative ACK and resolve the transfer.
        bus.deliver(TRANSFER_ID, chunkAck(totalChunks - 1, totalChunks));
        await waitFor(
          () => bus.sent.some((s) => s.payload.includes('FW_TRANSFER_END')),
          'END sent',
        );
        bus.deliver(TRANSFER_ID, endAck('OK'));
      })();

      const result = await streamer.run(specFor(tempPath, buf.length), { onChunkNak });
      await driver;

      expect(result.endAck.status).toBe('OK');
      // onChunkNak fired exactly once (the original NAK), not twice.
      expect(onChunkNak).toHaveBeenCalledTimes(1);
      expect(onChunkNak).toHaveBeenCalledWith(0, 0, 'CRC');
    } finally {
      await fsp.rm(path.dirname(tempPath), { recursive: true, force: true });
    }
  });

  it('rejects FW_CHUNK_NAK with nextExpectedSeq > totalChunks as master_io_error', async () => {
    // A malformed master that sends nextExpectedSeq beyond the transfer
    // bounds would otherwise stall the streamer (topUpWindow's loop bound
    // is nextToSend <= lastSeq) until the whole-transfer watchdog fires
    // with the opaque "transfer_timeout" error. The bounds guard at the
    // top of handleChunkNak surfaces the bug immediately with a clear
    // master_io_error reason.
    const chunkSize = 100;
    const totalChunks = 5;
    const buf = Buffer.alloc(chunkSize * totalChunks, 0x99);
    const tempPath = await writeTempFirmware(buf);
    try {
      const bus = new FakeSerialBus();
      const streamer = new ChunkStreamer({ bus, config: { chunkSizeBytes: chunkSize } });

      const driver = (async (): Promise<void> => {
        await driveBeginAndAwaitInitialFill(bus, 5);
        // nextExpectedSeq=99 is way past totalChunks=5. Master is misbehaving.
        bus.deliver(TRANSFER_ID, chunkNak(4, 'CRC', /*nextExpectedSeq=*/ 99));
      })();

      await expect(streamer.run(specFor(tempPath, buf.length), {})).rejects.toMatchObject({
        code: 'master_io_error',
      });
      await driver;
      // Subscriber cleanup runs in the streamer's finally block; verify
      // the bounds-guard early-return path does not leak.
      expect(bus.subscribers.size).toBe(0);
    } finally {
      await fsp.rm(path.dirname(tempPath), { recursive: true, force: true });
    }
  });

  it('rejects FW_CHUNK_NAK with nextExpectedSeq == totalChunks as master_io_error', async () => {
    // Boundary case: nextExpectedSeq == totalChunks asks the sender to
    // retransmit a chunk that doesn't exist (valid seqs are 0..lastSeq,
    // where lastSeq = totalChunks - 1). The bounds guard must reject this
    // equality value too — a previous form used `> totalChunks` which let
    // this through, then silently stalled topUpWindow because
    // `nextToSend (= totalChunks) <= lastSeq (= totalChunks - 1)` is false,
    // and the transfer would die with the opaque whole-transfer watchdog.
    const chunkSize = 100;
    const totalChunks = 5;
    const buf = Buffer.alloc(chunkSize * totalChunks, 0xaa);
    const tempPath = await writeTempFirmware(buf);
    try {
      const bus = new FakeSerialBus();
      const streamer = new ChunkStreamer({ bus, config: { chunkSizeBytes: chunkSize } });

      const driver = (async (): Promise<void> => {
        await driveBeginAndAwaitInitialFill(bus, 5);
        // nextExpectedSeq=5 (= totalChunks) is one past the last valid seq.
        bus.deliver(TRANSFER_ID, chunkNak(4, 'CRC', /*nextExpectedSeq=*/ 5));
      })();

      await expect(streamer.run(specFor(tempPath, buf.length), {})).rejects.toMatchObject({
        code: 'master_io_error',
      });
      await driver;
      expect(bus.subscribers.size).toBe(0);
    } finally {
      await fsp.rm(path.dirname(tempPath), { recursive: true, force: true });
    }
  });

  it('consecutive NAKs converge: second NAK acknowledges progress made by first refill', async () => {
    // 30 chunks at 100 bytes. Initial fill: seq 0..15. First NAK at
    // lastGoodSeq=3 (master accepted 0..3, rejected 4): refill from seq 4.
    //   - inFlight cleared, nextToSend=4, highestAcked=3
    //   - top-up sends seq 4..19 (16 chunks fill the window)
    // Master then accepts seq 4..7 from the refill but NAKs at seq 8 with
    // lastGoodSeq=7. Second Go-Back-N: nextToSend=8, highestAcked=7,
    // refill from seq 8 (16 chunks: 8..23).
    // Final ack drains the rest.
    const chunkSize = 100;
    const totalChunks = 30;
    const buf = Buffer.alloc(chunkSize * totalChunks, 0x55);
    const tempPath = await writeTempFirmware(buf);
    try {
      const bus = new FakeSerialBus();
      const streamer = new ChunkStreamer({ bus, config: { chunkSizeBytes: chunkSize } });
      const onChunkNak = vi.fn();

      const driver = (async (): Promise<void> => {
        await driveBeginAndAwaitInitialFill(bus, 16);
        expect(chunkSendCount(bus)).toBe(16);

        // First NAK: lastGoodSeq=3, reason=CRC. Refill from seq 4.
        bus.deliver(TRANSFER_ID, chunkNak(3, 'CRC'));
        // After Go-Back-N from seq 4: total sent climbs to 16 (initial) + 16
        // (refill of seq 4..19) = 32.
        await waitFor(() => chunkSendCount(bus) >= 32, 'first Go-Back-N refill from seq 4');
        expect(chunkSendCount(bus)).toBe(32);

        // Second NAK: master accepted seq 4..7 from the refill, then rejected
        // seq 8. lastGoodSeq=7. Refill from seq 8.
        bus.deliver(TRANSFER_ID, chunkNak(7, 'OUT_OF_ORDER'));
        // After second Go-Back-N: total sent climbs by 16 more (refill of
        // seq 8..23) = 48.
        await waitFor(() => chunkSendCount(bus) >= 48, 'second Go-Back-N refill from seq 8');
        expect(chunkSendCount(bus)).toBe(48);

        // Drain the rest: cumulative ACK for seq 23, then seq 29.
        bus.deliver(TRANSFER_ID, chunkAck(23, 24));
        // After this ack, the window tops up by 6 to send seq 24..29.
        await waitFor(() => chunkSendCount(bus) >= 54, 'top-up after seq 23 ack');
        bus.deliver(TRANSFER_ID, chunkAck(totalChunks - 1, totalChunks));
        await waitFor(
          () => bus.sent.some((s) => s.payload.includes('FW_TRANSFER_END')),
          'END sent',
        );
        bus.deliver(TRANSFER_ID, endAck('OK'));
      })();

      const result = await streamer.run(specFor(tempPath, buf.length), { onChunkNak });
      await driver;

      expect(result.totalChunks).toBe(totalChunks);
      expect(result.endAck.status).toBe('OK');
      expect(onChunkNak).toHaveBeenCalledTimes(2);
      expect(onChunkNak.mock.calls[0]).toEqual([3, 4, 'CRC']);
      expect(onChunkNak.mock.calls[1]).toEqual([7, 8, 'OUT_OF_ORDER']);
      expect(bus.subscribers.size).toBe(0);
    } finally {
      await fsp.rm(path.dirname(tempPath), { recursive: true, force: true });
    }
  });

  it('NAK with FLASH_FULL rejects with code flash_full and cleans up', async () => {
    // 5 chunks at 100 bytes. Initial fill sends all 5. Master responds with
    // FLASH_FULL (lastGoodSeq=2). The streamer must:
    //   - fire observer.onChunkNak(2, 'FLASH_FULL')
    //   - reject run() with TransferError code 'flash_full'
    //   - clean up the subscriber (finally block)
    const chunkSize = 100;
    const totalChunks = 5;
    const buf = Buffer.alloc(chunkSize * totalChunks, 0xff);
    const tempPath = await writeTempFirmware(buf);
    try {
      const bus = new FakeSerialBus();
      const streamer = new ChunkStreamer({ bus, config: { chunkSizeBytes: chunkSize } });
      const onChunkNak = vi.fn();

      const driver = (async (): Promise<void> => {
        await driveBeginAndAwaitInitialFill(bus, totalChunks);
        bus.deliver(TRANSFER_ID, chunkNak(2, 'FLASH_FULL'));
      })();

      await expect(
        streamer.run(specFor(tempPath, buf.length), { onChunkNak }),
      ).rejects.toMatchObject({
        code: 'flash_full',
        transferId: TRANSFER_ID,
      });
      await driver;

      // Observer was notified before rejection.
      expect(onChunkNak).toHaveBeenCalledTimes(1);
      expect(onChunkNak).toHaveBeenCalledWith(2, 3, 'FLASH_FULL');
      // Cleanup must have run on the reject path.
      expect(bus.subscribers.size).toBe(0);
    } finally {
      await fsp.rm(path.dirname(tempPath), { recursive: true, force: true });
    }
  });

  it('silently drops a stale NAK whose lastGoodSeq is below current highestAcked', async () => {
    // Real-world hazard: master retransmits a NAK (its own NIC retry, or two
    // NAKs in flight at once), and the duplicate arrives AFTER the streamer
    // already restarted from the first NAK and made forward progress. Without
    // a stale-NAK guard, the second NAK would:
    //   - phantom-fire observer.onChunkNak (UI sees a NAK we already recovered from)
    //   - rewind nextToSend / highestAcked below their current values
    //     (non-monotonic rollback of the cumulative-progress cursor)
    // handleChunkAck has the symmetric monotonic guard already; this test
    // pins the parallel guard on the NAK path.
    //
    // Setup: 20 chunks. Initial fill seq 0..15. First NAK at lastGoodSeq=5
    // triggers Go-Back-N → refill seq 6..19 (14 chunks). Then deliver a
    // chunkAck at seq=10 to advance highestAcked past the stale NAK's claim.
    // Then deliver a STALE NAK at lastGoodSeq=3. Streamer must:
    //   - NOT fire observer.onChunkNak again (still 1 total — the first NAK)
    //   - NOT rewind nextToSend / highestAcked
    //   - NOT emit any extra FW_CHUNK sends
    const chunkSize = 100;
    const totalChunks = 20;
    const buf = Buffer.alloc(chunkSize * totalChunks, 0xcd);
    const tempPath = await writeTempFirmware(buf);
    try {
      const bus = new FakeSerialBus();
      const streamer = new ChunkStreamer({ bus, config: { chunkSizeBytes: chunkSize } });
      const onChunkNak = vi.fn();
      const onChunkAck = vi.fn();

      const driver = (async (): Promise<void> => {
        await driveBeginAndAwaitInitialFill(bus, 16);
        expect(chunkSendCount(bus)).toBe(16);

        // First (real) NAK at lastGoodSeq=5. Refill seq 6..19 (14 chunks).
        // Total FW_CHUNK sends: 16 + 14 = 30.
        bus.deliver(TRANSFER_ID, chunkNak(5, 'CRC'));
        await waitFor(() => chunkSendCount(bus) >= 30, 'Go-Back-N refill from seq 6');
        expect(chunkSendCount(bus)).toBe(30);
        expect(onChunkNak).toHaveBeenCalledTimes(1);

        // Forward progress: cumulative ACK at seq=10. Now highestAcked=10.
        bus.deliver(TRANSFER_ID, chunkAck(10, 11));
        // No further sends triggered (window still has 9 unacked: seq 11..19).
        const sentAfterAck = chunkSendCount(bus);
        expect(sentAfterAck).toBe(30);

        // STALE NAK: lastGoodSeq=3 is below current highestAcked=10. The
        // master clearly retransmitted from before we recovered. The
        // streamer must drop this entirely — no observer call, no rewind,
        // no extra sends.
        bus.deliver(TRANSFER_ID, chunkNak(3, 'CRC'));

        // No new FW_CHUNK sends should have fired in response to the stale NAK.
        // We assert this synchronously; if the guard is missing, the streamer
        // would re-clear inFlight and refill from seq 4..19, bumping the count
        // by 16. Synchronous check is sufficient because the dispatcher path is
        // synchronous — no awaits between delivery and any state mutations.
        expect(chunkSendCount(bus)).toBe(sentAfterAck);
        // Observer still fired only once (for the original NAK).
        expect(onChunkNak).toHaveBeenCalledTimes(1);
        expect(onChunkNak).toHaveBeenCalledWith(5, 6, 'CRC');

        // Drain the rest with one cumulative ack covering seq 0..19.
        bus.deliver(TRANSFER_ID, chunkAck(totalChunks - 1, totalChunks));
        await waitFor(
          () => bus.sent.some((s) => s.payload.includes('FW_TRANSFER_END')),
          'END sent',
        );
        bus.deliver(TRANSFER_ID, endAck('OK'));
      })();

      const result = await streamer.run(specFor(tempPath, buf.length), {
        onChunkNak,
        onChunkAck,
      });
      await driver;

      expect(result.totalChunks).toBe(totalChunks);
      expect(result.endAck.status).toBe('OK');
      // Final assertion: still only one onChunkNak call across the full run.
      expect(onChunkNak).toHaveBeenCalledTimes(1);
      expect(onChunkNak).toHaveBeenCalledWith(5, 6, 'CRC');
      // Total FW_CHUNK sends: 16 initial + 14 refill = 30. Stale NAK added 0.
      expect(chunkSendCount(bus)).toBe(30);
      expect(bus.subscribers.size).toBe(0);
    } finally {
      await fsp.rm(path.dirname(tempPath), { recursive: true, force: true });
    }
  });

  it.each<FwChunkNakReason>(['CRC', 'SIZE', 'OUT_OF_ORDER'])(
    'NAK with reason=%s triggers Go-Back-N (not rejection)',
    async (reason) => {
      // Smoke check that all three non-FLASH_FULL reasons route through the
      // Go-Back-N branch. 10 chunks; NAK at lastGoodSeq=2; expect refill
      // from seq 3 and successful completion after final ack.
      const chunkSize = 100;
      const totalChunks = 10;
      const buf = Buffer.alloc(chunkSize * totalChunks, 0x66);
      const tempPath = await writeTempFirmware(buf);
      try {
        const bus = new FakeSerialBus();
        const streamer = new ChunkStreamer({ bus, config: { chunkSizeBytes: chunkSize } });
        const onChunkNak = vi.fn();

        const driver = (async (): Promise<void> => {
          await driveBeginAndAwaitInitialFill(bus, totalChunks);
          expect(chunkSendCount(bus)).toBe(10);

          bus.deliver(TRANSFER_ID, chunkNak(2, reason));
          // Refill from seq 3..9 = 7 more chunks. Total = 10 + 7 = 17.
          await waitFor(() => chunkSendCount(bus) >= 17, `Go-Back-N refill after NAK ${reason}`);

          bus.deliver(TRANSFER_ID, chunkAck(totalChunks - 1, totalChunks));
          await waitFor(
            () => bus.sent.some((s) => s.payload.includes('FW_TRANSFER_END')),
            'END sent',
          );
          bus.deliver(TRANSFER_ID, endAck('OK'));
        })();

        const result = await streamer.run(specFor(tempPath, buf.length), { onChunkNak });
        await driver;

        expect(result.endAck.status).toBe('OK');
        expect(onChunkNak).toHaveBeenCalledWith(2, 3, reason);
      } finally {
        await fsp.rm(path.dirname(tempPath), { recursive: true, force: true });
      }
    },
  );
});

describe('ChunkStreamer — END_ACK non-OK rejects with cleanup', () => {
  let tempPath: string;

  beforeEach(async () => {
    tempPath = await writeTempFirmware(Buffer.from('B'.repeat(50)));
  });

  afterEach(async () => {
    await fsp.rm(path.dirname(tempPath), { recursive: true, force: true });
  });

  function driveWithEndStatus(
    bus: FakeSerialBus,
    status: 'HASH_MISMATCH' | 'IO_ERROR',
  ): Promise<void> {
    return (async (): Promise<void> => {
      await waitFor(() => bus.sent.length >= 1, 'BEGIN sent');
      bus.deliver(TRANSFER_ID, beginAck());
      await waitFor(() => bus.sent.length >= 2, 'CHUNK sent');
      bus.deliver(TRANSFER_ID, chunkAck(0, 1));
      await waitFor(() => bus.sent.length >= 3, 'END sent');
      bus.deliver(TRANSFER_ID, endAck(status));
    })();
  }

  it('END_ACK status=HASH_MISMATCH rejects with hash_mismatch and cleans up', async () => {
    const bus = new FakeSerialBus();
    const streamer = new ChunkStreamer({ bus });

    const driver = driveWithEndStatus(bus, 'HASH_MISMATCH');
    await expect(streamer.run(specFor(tempPath, 50), {})).rejects.toMatchObject({
      code: 'hash_mismatch',
      transferId: TRANSFER_ID,
    });
    await driver;
    // Cleanup must run on the reject path too.
    expect(bus.subscribers.size).toBe(0);
  });

  it('END_ACK status=IO_ERROR rejects with master_io_error and cleans up', async () => {
    const bus = new FakeSerialBus();
    const streamer = new ChunkStreamer({ bus });

    const driver = driveWithEndStatus(bus, 'IO_ERROR');
    await expect(streamer.run(specFor(tempPath, 50), {})).rejects.toMatchObject({
      code: 'master_io_error',
      transferId: TRANSFER_ID,
    });
    await driver;
    expect(bus.subscribers.size).toBe(0);
  });
});

describe('ChunkStreamer — per-chunk timeout + retry', () => {
  // Test-local timer budget. Pinned via per-construction `config: { ackTimeoutMs }`
  // so the tests don't drift when TRANSPORT_DEFAULTS moves (the production
  // default is sized for full-window wire time; the suite runs orders of
  // magnitude faster with a small value under fake timers).
  const ACK_TIMEOUT_MS = 1500;

  // Date and setImmediate stay un-faked (only setTimeout/clearTimeout are
  // intercepted), so the top-of-file wall-clock `waitFor` works as-is here
  // for predicate polling. `advanceTimersByTimeAsync(ACK_TIMEOUT_MS)` is
  // what we actually need fake timers for — fast-forwarding the streamer's
  // ack-timeout setTimeout without sitting through 1.5 real-time seconds.

  function chunkSendCount(bus: FakeSerialBus): number {
    return bus.sent.filter((s) => s.payload.includes('FW_CHUNK')).length;
  }

  beforeEach(() => {
    // Fake ONLY setTimeout/clearTimeout — the two timer APIs the streamer
    // uses for the per-chunk ack timeout. Three deliberate
    // exclusions that keep this surgical:
    //   * setImmediate stays real, because under parallel test load
    //     vitest's fs plumbing for `fsp.readFile` (the streamer's first
    //     await) can stall when setImmediate is faked, deadlocking the
    //     test before BEGIN ever hits the wire.
    //   * Date stays real, because the top-of-file `waitFor` helper bounds
    //     its polling on `Date.now()` deadlines and a faked Date makes
    //     that infinite-spin under load.
    //   * setInterval stays real (not used by the streamer; faking it
    //     would only invite cross-suite surprise).
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('single chunk timeout → resend → ACK: observer.onRetry fires once, retry attempt resends, transfer completes', async () => {
    // Single-chunk transfer keeps the timer-fire ordering deterministic:
    // exactly one timer is armed, advancing fake time by ACK_TIMEOUT_MS
    // fires only that one. Anything larger risks all-timers-fire-at-once
    // (since they're armed in the same synchronous topUpWindow loop) which
    // makes the assertion order tricky.
    const chunkSize = 100;
    const buf = Buffer.alloc(chunkSize, 0x11);
    const tempPath = await writeTempFirmware(buf);
    try {
      const bus = new FakeSerialBus();
      const streamer = new ChunkStreamer({
        bus,
        config: { chunkSizeBytes: chunkSize, ackTimeoutMs: ACK_TIMEOUT_MS },
      });
      const onRetry = vi.fn();
      const onChunkAck = vi.fn();

      // Drive the BEGIN handshake without delivering chunkAck yet — we want
      // to time out the chunk first.
      const driver = (async (): Promise<void> => {
        await waitFor(() => bus.sent.length >= 1, 'BEGIN sent');
        bus.deliver(TRANSFER_ID, beginAck());
        await waitFor(() => chunkSendCount(bus) >= 1, 'first FW_CHUNK sent');
        // Sanity: BEGIN + 1 chunk on the wire, no ACK yet.
        expect(chunkSendCount(bus)).toBe(1);

        // Advance past the per-chunk timeout. Timer fires, retries++ to 1,
        // observer.onRetry called, resend issued, timer re-armed.
        await vi.advanceTimersByTimeAsync(ACK_TIMEOUT_MS);
        await waitFor(() => chunkSendCount(bus) >= 2, 'resend after timeout');
        expect(chunkSendCount(bus)).toBe(2);
        expect(onRetry).toHaveBeenCalledTimes(1);
        expect(onRetry).toHaveBeenCalledWith(0, 1);

        // Now deliver the cumulative ACK. The retire path clears the
        // (re-armed) timer so no further onRetry fires even if we advance
        // time past the next ACK_TIMEOUT_MS.
        bus.deliver(TRANSFER_ID, chunkAck(0, 1));
        await waitFor(
          () => bus.sent.some((s) => s.payload.includes('FW_TRANSFER_END')),
          'END sent',
        );
        bus.deliver(TRANSFER_ID, endAck('OK'));
      })();

      const result = await streamer.run(specFor(tempPath, buf.length), { onRetry, onChunkAck });
      await driver;

      expect(result.endAck.status).toBe('OK');
      expect(result.totalChunks).toBe(1);
      // Exactly one retry across the full run.
      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(0, 1);
      // Subscriber disposed on the resolve path.
      expect(bus.subscribers.size).toBe(0);
    } finally {
      await fsp.rm(path.dirname(tempPath), { recursive: true, force: true });
    }
  });

  it('three timeouts on the same chunk reject with chunk_retry_exhausted', async () => {
    // 1-chunk transfer. Initial send arms timer.
    //   advance ACK_TIMEOUT_MS → retries=1, observer.onRetry(0, 1), resend.
    //   advance ACK_TIMEOUT_MS → retries=2, observer.onRetry(0, 2), resend.
    //   advance ACK_TIMEOUT_MS → retries=3 == maxRetriesPerChunk, reject
    //                            with TransferError('chunk_retry_exhausted').
    // observer.onRetry is called exactly twice (for retries=1 and 2).
    const chunkSize = 100;
    const buf = Buffer.alloc(chunkSize, 0x22);
    const tempPath = await writeTempFirmware(buf);
    try {
      const bus = new FakeSerialBus();
      // Pin `maxRetriesPerChunk: 3` here — this test counts on exactly three
      // timeouts exhausting the budget. The production default may move; the
      // test's contract is the count, not the default.
      const streamer = new ChunkStreamer({
        bus,
        config: { chunkSizeBytes: chunkSize, ackTimeoutMs: ACK_TIMEOUT_MS, maxRetriesPerChunk: 3 },
      });
      const onRetry = vi.fn();

      const driver = (async (): Promise<void> => {
        await waitFor(() => bus.sent.length >= 1, 'BEGIN sent');
        bus.deliver(TRANSFER_ID, beginAck());
        await waitFor(() => chunkSendCount(bus) >= 1, 'first FW_CHUNK sent');

        // Three consecutive timeouts. Note we await microtask drains between
        // each so the resend and re-arm happen before we advance fake time
        // again (otherwise the second advance might fire BOTH the original
        // re-armed timer AND any timer armed during the resend handler).
        await vi.advanceTimersByTimeAsync(ACK_TIMEOUT_MS); // retries=1, resend
        await waitFor(() => chunkSendCount(bus) >= 2, 'first resend');
        expect(onRetry).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(ACK_TIMEOUT_MS); // retries=2, resend
        await waitFor(() => chunkSendCount(bus) >= 3, 'second resend');
        expect(onRetry).toHaveBeenCalledTimes(2);

        // Third advance: retries hits maxRetriesPerChunk (3) and the chunk
        // phase rejects. No third resend, no third onRetry.
        await vi.advanceTimersByTimeAsync(ACK_TIMEOUT_MS);
      })();

      await expect(streamer.run(specFor(tempPath, buf.length), { onRetry })).rejects.toMatchObject({
        code: 'chunk_retry_exhausted',
        transferId: TRANSFER_ID,
      });
      await driver;

      // Two retries observed (for attempts 1 and 2). The third firing
      // rejected before observer.onRetry would have been called.
      expect(onRetry).toHaveBeenCalledTimes(2);
      expect(onRetry.mock.calls[0]).toEqual([0, 1]);
      expect(onRetry.mock.calls[1]).toEqual([0, 2]);
      // bus.sent: BEGIN + initial CHUNK + 2 resends = 3 FW_CHUNK entries
      // (no third resend — the third timeout rejected instead).
      expect(chunkSendCount(bus)).toBe(3);
      // Cleanup verified: subscriber disposed on the reject path.
      expect(bus.subscribers.size).toBe(0);
    } finally {
      await fsp.rm(path.dirname(tempPath), { recursive: true, force: true });
    }
  });

  it('concurrent in-flight chunks time out independently and each fires its own retry', async () => {
    // 2-chunk transfer. Initial top-up sends seq 0 and 1 in lockstep, both
    // armed within the same synchronous topUpWindow call so their timers
    // fire on the same fake-time boundary. After advancing ACK_TIMEOUT_MS,
    // observer.onRetry fires twice (once per seq) and bus.sent gets 2
    // resends. Delivering the cumulative ACK then drains both.
    const chunkSize = 100;
    const totalChunks = 2;
    const buf = Buffer.alloc(chunkSize * totalChunks, 0x33);
    const tempPath = await writeTempFirmware(buf);
    try {
      const bus = new FakeSerialBus();
      const streamer = new ChunkStreamer({
        bus,
        config: { chunkSizeBytes: chunkSize, ackTimeoutMs: ACK_TIMEOUT_MS },
      });
      const onRetry = vi.fn();

      const driver = (async (): Promise<void> => {
        await waitFor(() => bus.sent.length >= 1, 'BEGIN sent');
        bus.deliver(TRANSFER_ID, beginAck());
        await waitFor(() => chunkSendCount(bus) >= 2, 'initial fill 2 chunks');
        expect(chunkSendCount(bus)).toBe(2);

        // Both per-chunk timers fire on this advance.
        await vi.advanceTimersByTimeAsync(ACK_TIMEOUT_MS);
        // After the resends settle, total FW_CHUNK count is 2 + 2 = 4.
        await waitFor(() => chunkSendCount(bus) >= 4, 'both resends');
        expect(chunkSendCount(bus)).toBe(4);

        // Both seqs got an onRetry call with attempt=1.
        expect(onRetry).toHaveBeenCalledTimes(2);
        const calls = onRetry.mock.calls.map((c) => c[0]).sort((a, b) => a - b);
        expect(calls).toEqual([0, 1]);
        for (const c of onRetry.mock.calls) {
          expect(c[1]).toBe(1);
        }

        // Drain with one cumulative ACK.
        bus.deliver(TRANSFER_ID, chunkAck(totalChunks - 1, totalChunks));
        await waitFor(
          () => bus.sent.some((s) => s.payload.includes('FW_TRANSFER_END')),
          'END sent',
        );
        bus.deliver(TRANSFER_ID, endAck('OK'));
      })();

      const result = await streamer.run(specFor(tempPath, buf.length), { onRetry });
      await driver;

      expect(result.endAck.status).toBe('OK');
      expect(result.totalChunks).toBe(totalChunks);
      expect(bus.subscribers.size).toBe(0);
    } finally {
      await fsp.rm(path.dirname(tempPath), { recursive: true, force: true });
    }
  });

  it('clearTimeout on ACK: ACK-retired chunks have their timers disarmed (vi.getTimerCount goes to 0)', async () => {
    // Mutation-friendly. Two layers of protection in the impl make a missing
    // `clearChunkTimer` in the ACK-retire loop hard to observe via side
    // effects alone:
    //   * the `if (!entry) return` early-return in onChunkTimeout swallows
    //     the late timer fire, so observer.onRetry would still NOT be called,
    //   * and no resend happens for the same reason — bus.sent is unaffected.
    // What IS observable is the active fake-timer count: an unrcleared
    // setTimeout stays armed until it fires (consuming a fake-timer slot
    // until advanceTimersByTime runs it). We assert the count is 0 right
    // after the ACK retires the only in-flight chunk — if clearChunkTimer
    // were dropped, getTimerCount() would be 1 here.
    const chunkSize = 100;
    const buf = Buffer.alloc(chunkSize, 0x44);
    const tempPath = await writeTempFirmware(buf);
    try {
      const bus = new FakeSerialBus();
      const streamer = new ChunkStreamer({
        bus,
        config: { chunkSizeBytes: chunkSize, ackTimeoutMs: ACK_TIMEOUT_MS },
      });
      const onRetry = vi.fn();

      let timerCountAfterAck = -1;
      const driver = (async (): Promise<void> => {
        await waitFor(() => bus.sent.length >= 1, 'BEGIN sent');
        bus.deliver(TRANSFER_ID, beginAck());
        await waitFor(() => chunkSendCount(bus) >= 1, 'first FW_CHUNK sent');
        // Sanity: two fake-timer slots are occupied — the per-chunk ack
        // timer for seq=0 AND the whole-transfer watchdog (armed
        // post-BEGIN_ACK). If this fails the test pre-condition is wrong,
        // not the invariant we're testing.
        expect(vi.getTimerCount()).toBe(2);

        // Deliver the ACK BEFORE the timer fires. clearChunkTimer should
        // disarm the per-chunk timer in lockstep with inFlight.delete —
        // this is what we want to verify.
        bus.deliver(TRANSFER_ID, chunkAck(0, 1));
        // Snapshot the count synchronously after the deliver returns. The
        // ACK retire path runs synchronously in the bus subscriber callback,
        // so by this point clearChunkTimer should have run. We expect 1
        // remaining (the whole-transfer watchdog); the per-chunk timer has
        // been disarmed.
        timerCountAfterAck = vi.getTimerCount();

        // Drain the END phase BEFORE advancing past the timeout, so the
        // end-timeout race (also armed at ackTimeoutMs) cannot fire and
        // reject the run before our belt-and-suspenders advance.
        await waitFor(
          () => bus.sent.some((s) => s.payload.includes('FW_TRANSFER_END')),
          'END sent',
        );
        bus.deliver(TRANSFER_ID, endAck('OK'));

        // Belt-and-suspenders: advance past the per-chunk timeout to
        // confirm onRetry is not somehow triggered through a side-channel
        // by an un-cleared per-chunk timer. Run is already resolved at
        // this point so no other timer can fire.
        await vi.advanceTimersByTimeAsync(ACK_TIMEOUT_MS * 2);
      })();

      const result = await streamer.run(specFor(tempPath, buf.length), { onRetry });
      await driver;

      expect(result.endAck.status).toBe('OK');
      // Primary mutation-friendly assertion: per-chunk timer was actively
      // cleared. The whole-transfer watchdog is still armed at this
      // snapshot (count == 1), so a missing clearChunkTimer would push
      // it to 2.
      expect(timerCountAfterAck).toBe(1);
      // Side-channel checks — both held even with the defensive guard,
      // but worth pinning so a future refactor that drops the guard
      // would still surface a regression here.
      expect(onRetry).not.toHaveBeenCalled();
      expect(chunkSendCount(bus)).toBe(1);
      expect(bus.subscribers.size).toBe(0);
    } finally {
      await fsp.rm(path.dirname(tempPath), { recursive: true, force: true });
    }
  });
});

describe('ChunkStreamer — backpressure pause/resume', () => {
  // Same FW_CHUNK counter as the NAK and per-chunk-timeout suites.
  function chunkSendCount(bus: FakeSerialBus): number {
    return bus.sent.filter((s) => s.payload.includes('FW_CHUNK')).length;
  }

  // Test 1, 2, 3 use real timers (no per-chunk timeout interaction needed).
  // Test 4 explicitly opts in with vi.useFakeTimers in its body.

  it('PAUSE mid-window halts new sends; cumulative ACK retires entries during PAUSE; RESUME refills', async () => {
    // 20 chunks at 100 bytes. Initial fill: seq 0..15 (window size 16).
    // PAUSE arrives → observer.onBackpressure(true).
    // chunkAck(3) arrives during PAUSE → in-flight retires 0..3, but
    //   topUpWindow no-ops (paused), so chunkSendCount stays at 16.
    // RESUME arrives → observer.onBackpressure(false), topUpWindow refills:
    //   inFlight is now {4..15} (12 entries), nextToSend=16. Refill sends
    //   seq 16..19 (4 chunks; remaining seqs are <16 so window can't fully
    //   refill to 16 entries — caps out at 12 + 4 = 16 in flight).
    //   chunkSendCount climbs to 16 + 4 = 20.
    // Final cumulative ack drains the rest, then END.
    const chunkSize = 100;
    const totalChunks = 20;
    const buf = Buffer.alloc(chunkSize * totalChunks, 0x77);
    const tempPath = await writeTempFirmware(buf);
    try {
      const bus = new FakeSerialBus();
      const streamer = new ChunkStreamer({ bus, config: { chunkSizeBytes: chunkSize } });
      const onBackpressure = vi.fn();
      const onChunkAck = vi.fn();

      const driver = (async (): Promise<void> => {
        await waitFor(() => bus.sent.length >= 1, 'BEGIN sent');
        bus.deliver(TRANSFER_ID, beginAck());
        await waitFor(() => chunkSendCount(bus) >= 16, 'initial window fill');
        expect(chunkSendCount(bus)).toBe(16);

        // PAUSE.
        bus.deliver(TRANSFER_ID, backpressure('PAUSE'));
        // Observer fired with `true` once.
        expect(onBackpressure).toHaveBeenCalledTimes(1);
        expect(onBackpressure).toHaveBeenCalledWith(true);

        // ACK retiring seq 0..3 during PAUSE: drains in-flight from 16→12,
        // observer.onChunkAck still fires, but no new wire sends.
        bus.deliver(TRANSFER_ID, chunkAck(3, 4));
        // Wait long enough that any (incorrectly) un-gated topUpWindow would
        // have run and grown bus.sent. setImmediate cycle is enough — the
        // ack handler runs synchronously.
        await new Promise<void>((r) => setImmediate(r));
        expect(chunkSendCount(bus)).toBe(16);
        expect(onChunkAck).toHaveBeenCalledTimes(1);
        expect(onChunkAck).toHaveBeenCalledWith(3, 4 * chunkSize);

        // RESUME. Observer fires with `false`. topUpWindow refills from
        // nextToSend=16: sends seq 16..19 (4 new chunks).
        bus.deliver(TRANSFER_ID, backpressure('RESUME'));
        expect(onBackpressure).toHaveBeenCalledTimes(2);
        expect(onBackpressure.mock.calls[1]).toEqual([false]);
        await waitFor(() => chunkSendCount(bus) >= 20, 'refill after RESUME');
        expect(chunkSendCount(bus)).toBe(20);

        // Final cumulative ACK drains seq 4..19, then END.
        bus.deliver(TRANSFER_ID, chunkAck(totalChunks - 1, totalChunks));
        await waitFor(
          () => bus.sent.some((s) => s.payload.includes('FW_TRANSFER_END')),
          'END sent',
        );
        bus.deliver(TRANSFER_ID, endAck('OK'));
      })();

      const result = await streamer.run(specFor(tempPath, buf.length), {
        onBackpressure,
        onChunkAck,
      });
      await driver;

      expect(result.endAck.status).toBe('OK');
      expect(result.totalChunks).toBe(totalChunks);
      // Two transitions only: PAUSE→RESUME.
      expect(onBackpressure).toHaveBeenCalledTimes(2);
      expect(onBackpressure.mock.calls[0]).toEqual([true]);
      expect(onBackpressure.mock.calls[1]).toEqual([false]);
      expect(bus.subscribers.size).toBe(0);
    } finally {
      await fsp.rm(path.dirname(tempPath), { recursive: true, force: true });
    }
  });

  it('PAUSE during full window: in-flight ACKs still drain (inFlight.size shrinks to 0)', async () => {
    // 16 chunks at 100 bytes — exactly fills the window. PAUSE arrives.
    // A single cumulative ACK for seq 15 retires ALL 16 in-flight entries.
    // Observable proxy for inFlight.size == 0: lastSeq is acked, the chunk
    // phase resolves, the streamer sends END. If PAUSE incorrectly blocked
    // the ACK retire path, we'd hang here until the test timeout.
    const chunkSize = 100;
    const totalChunks = 16;
    const buf = Buffer.alloc(chunkSize * totalChunks, 0x88);
    const tempPath = await writeTempFirmware(buf);
    try {
      const bus = new FakeSerialBus();
      const streamer = new ChunkStreamer({ bus, config: { chunkSizeBytes: chunkSize } });
      const onBackpressure = vi.fn();
      const onChunkAck = vi.fn();

      const driver = (async (): Promise<void> => {
        await waitFor(() => bus.sent.length >= 1, 'BEGIN sent');
        bus.deliver(TRANSFER_ID, beginAck());
        await waitFor(() => chunkSendCount(bus) >= 16, 'full window fill');
        expect(chunkSendCount(bus)).toBe(16);

        // PAUSE while window is full.
        bus.deliver(TRANSFER_ID, backpressure('PAUSE'));
        expect(onBackpressure).toHaveBeenCalledWith(true);

        // Cumulative ACK retires every in-flight entry. After this, the
        // chunk phase should resolve and the streamer proceeds to END
        // even though we're still PAUSEd — there are no MORE chunks to
        // send, so nothing is gated. chunkPhaseDone fires on
        // `highestAcked >= lastSeq`, independent of pause state.
        bus.deliver(TRANSFER_ID, chunkAck(totalChunks - 1, totalChunks));
        await waitFor(
          () => bus.sent.some((s) => s.payload.includes('FW_TRANSFER_END')),
          'END sent during PAUSE (no more chunks pending)',
        );

        // We never RESUME — the transfer completes from PAUSE because the
        // ACK drained everything. observer.onChunkAck saw the cumulative
        // retirement, confirming the in-flight Map shrank.
        expect(onChunkAck).toHaveBeenCalledTimes(1);
        expect(onChunkAck).toHaveBeenCalledWith(totalChunks - 1, totalChunks * chunkSize);

        bus.deliver(TRANSFER_ID, endAck('OK'));
      })();

      const result = await streamer.run(specFor(tempPath, buf.length), {
        onBackpressure,
        onChunkAck,
      });
      await driver;

      expect(result.endAck.status).toBe('OK');
      // No new chunks sent during PAUSE — initial fill is the only sends.
      expect(chunkSendCount(bus)).toBe(16);
      // Only PAUSE fired (we never RESUMEd).
      expect(onBackpressure).toHaveBeenCalledTimes(1);
      expect(onBackpressure).toHaveBeenCalledWith(true);
      expect(bus.subscribers.size).toBe(0);
    } finally {
      await fsp.rm(path.dirname(tempPath), { recursive: true, force: true });
    }
  });

  it('idempotent: duplicate PAUSE / duplicate RESUME do not refire observer.onBackpressure', async () => {
    // Drives PAUSE, PAUSE, RESUME, RESUME. observer.onBackpressure should
    // be called exactly twice — once per state transition. Without the
    // idempotent guard, it would be called four times.
    const chunkSize = 100;
    const totalChunks = 4;
    const buf = Buffer.alloc(chunkSize * totalChunks, 0x99);
    const tempPath = await writeTempFirmware(buf);
    try {
      const bus = new FakeSerialBus();
      const streamer = new ChunkStreamer({ bus, config: { chunkSizeBytes: chunkSize } });
      const onBackpressure = vi.fn();

      const driver = (async (): Promise<void> => {
        await waitFor(() => bus.sent.length >= 1, 'BEGIN sent');
        bus.deliver(TRANSFER_ID, beginAck());
        await waitFor(() => chunkSendCount(bus) >= totalChunks, 'initial fill');

        bus.deliver(TRANSFER_ID, backpressure('PAUSE'));
        bus.deliver(TRANSFER_ID, backpressure('PAUSE')); // duplicate — no-op
        expect(onBackpressure).toHaveBeenCalledTimes(1);
        expect(onBackpressure).toHaveBeenCalledWith(true);

        bus.deliver(TRANSFER_ID, backpressure('RESUME'));
        bus.deliver(TRANSFER_ID, backpressure('RESUME')); // duplicate — no-op
        expect(onBackpressure).toHaveBeenCalledTimes(2);
        expect(onBackpressure.mock.calls[1]).toEqual([false]);

        bus.deliver(TRANSFER_ID, chunkAck(totalChunks - 1, totalChunks));
        await waitFor(
          () => bus.sent.some((s) => s.payload.includes('FW_TRANSFER_END')),
          'END sent',
        );
        bus.deliver(TRANSFER_ID, endAck('OK'));
      })();

      const result = await streamer.run(specFor(tempPath, buf.length), { onBackpressure });
      await driver;

      expect(result.endAck.status).toBe('OK');
      // Exactly two transitions despite four backpressure messages.
      expect(onBackpressure).toHaveBeenCalledTimes(2);
      expect(onBackpressure.mock.calls[0]).toEqual([true]);
      expect(onBackpressure.mock.calls[1]).toEqual([false]);
      expect(bus.subscribers.size).toBe(0);
    } finally {
      await fsp.rm(path.dirname(tempPath), { recursive: true, force: true });
    }
  });

  it('PAUSEd-throughout retry budget exhausts to chunk_retry_exhausted without ever resending', async () => {
    // The "retries still count under PAUSE" branch in onChunkTimeout is
    // a load-bearing budget on a master that PAUSEs and then never
    // RESUMEs — without it, the streamer would hang forever waiting for
    // the master to come back. This test pins that contract: every
    // per-chunk timer fire while PAUSEd increments the retry counter
    // and re-arms but DOES NOT resend; once the budget hits
    // maxRetriesPerChunk, the chunk phase rejects with
    // `chunk_retry_exhausted` even though the wire never saw a single
    // resend.
    //
    // 1-chunk transfer keeps the timer-fire ordering deterministic —
    // exactly one timer at a time. With maxRetriesPerChunk=3 and the
    // initial send at retries=0:
    //   advance ACK_TIMEOUT_MS → retries=1, observer.onRetry(0,1), re-arm (no resend)
    //   advance ACK_TIMEOUT_MS → retries=2, observer.onRetry(0,2), re-arm (no resend)
    //   advance ACK_TIMEOUT_MS → retries=3 == max, REJECT chunk_retry_exhausted
    //                            (no observer.onRetry, no re-arm, no resend)
    // Final assertions: bus.sent contains BEGIN + 1 initial CHUNK only
    // (NO resends), onRetry called exactly twice.
    const ACK_TIMEOUT_MS = 1500;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const chunkSize = 100;
      const buf = Buffer.alloc(chunkSize, 0xbb);
      const tempPath = await writeTempFirmware(buf);
      try {
        const bus = new FakeSerialBus();
        // Pin `maxRetriesPerChunk: 3` and `ackTimeoutMs: ACK_TIMEOUT_MS`: the test
        // counts exactly three timer-fires under PAUSE exhausting the budget, and
        // advances fake time by ACK_TIMEOUT_MS each round. Both must match what
        // the streamer is using, regardless of TRANSPORT_DEFAULTS.
        const streamer = new ChunkStreamer({
          bus,
          config: {
            chunkSizeBytes: chunkSize,
            ackTimeoutMs: ACK_TIMEOUT_MS,
            maxRetriesPerChunk: 3,
          },
        });
        const onBackpressure = vi.fn();
        const onRetry = vi.fn();

        const driver = (async (): Promise<void> => {
          await waitFor(() => bus.sent.length >= 1, 'BEGIN sent');
          bus.deliver(TRANSFER_ID, beginAck());
          await waitFor(() => chunkSendCount(bus) >= 1, 'first FW_CHUNK sent');
          expect(chunkSendCount(bus)).toBe(1);

          // Enter PAUSE and stay there. No RESUME will be delivered —
          // the retry budget is the only thing that ends this run.
          bus.deliver(TRANSFER_ID, backpressure('PAUSE'));
          expect(onBackpressure).toHaveBeenCalledWith(true);

          // First timeout: retries=1, no resend.
          await vi.advanceTimersByTimeAsync(ACK_TIMEOUT_MS);
          await new Promise<void>((r) => setImmediate(r));
          expect(onRetry).toHaveBeenCalledTimes(1);
          expect(onRetry).toHaveBeenCalledWith(0, 1);
          expect(chunkSendCount(bus)).toBe(1);

          // Second timeout: retries=2, no resend.
          await vi.advanceTimersByTimeAsync(ACK_TIMEOUT_MS);
          await new Promise<void>((r) => setImmediate(r));
          expect(onRetry).toHaveBeenCalledTimes(2);
          expect(onRetry.mock.calls[1]).toEqual([0, 2]);
          expect(chunkSendCount(bus)).toBe(1);

          // Third timeout: retries=3 hits max → chunk-phase rejects.
          // No observer.onRetry call (the budget check happens before
          // the observer notification). No re-arm. No resend.
          await vi.advanceTimersByTimeAsync(ACK_TIMEOUT_MS);
        })();

        await expect(
          streamer.run(specFor(tempPath, buf.length), { onBackpressure, onRetry }),
        ).rejects.toMatchObject({
          code: 'chunk_retry_exhausted',
          transferId: TRANSFER_ID,
        });
        await driver;

        // The wire only ever saw the initial CHUNK send. Every fire
        // during PAUSE incremented the budget without resending.
        expect(chunkSendCount(bus)).toBe(1);
        // Two retries observed (attempts 1 and 2). The third firing
        // rejected before observer.onRetry would fire.
        expect(onRetry).toHaveBeenCalledTimes(2);
        expect(onRetry.mock.calls[0]).toEqual([0, 1]);
        expect(onRetry.mock.calls[1]).toEqual([0, 2]);
        // Only PAUSE fired (no RESUME ever delivered).
        expect(onBackpressure).toHaveBeenCalledTimes(1);
        expect(onBackpressure).toHaveBeenCalledWith(true);
        // Cleanup verified: subscriber disposed on the reject path.
        expect(bus.subscribers.size).toBe(0);
      } finally {
        await fsp.rm(path.dirname(tempPath), { recursive: true, force: true });
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it('per-chunk timeout during PAUSE re-arms but does not resend; resend resumes after RESUME', async () => {
    // Fake timers gated to setTimeout/clearTimeout. 1-chunk transfer keeps
    // the timer-fire ordering deterministic.
    //
    // Sequence:
    //   1. BEGIN_ACK delivered, initial chunk armed (FW_CHUNK count = 1).
    //   2. PAUSE delivered.
    //   3. Advance fake time by ACK_TIMEOUT_MS — per-chunk timer fires.
    //      During PAUSE: observer.onRetry fires (retries=1), timer is
    //      re-armed, but NO resend goes out (FW_CHUNK count still 1).
    //   4. RESUME delivered. (Top-up no-ops because the only seq=0 is
    //      still in flight.)
    //   5. Advance fake time by ACK_TIMEOUT_MS again — per-chunk timer
    //      fires AGAIN. Now PAUSE is clear, so the resend happens
    //      (retries=2, FW_CHUNK count = 2).
    //   6. Deliver chunkAck, then END to finish cleanly.
    const ACK_TIMEOUT_MS = 1500;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const chunkSize = 100;
      const buf = Buffer.alloc(chunkSize, 0xaa);
      const tempPath = await writeTempFirmware(buf);
      try {
        const bus = new FakeSerialBus();
        const streamer = new ChunkStreamer({
          bus,
          config: { chunkSizeBytes: chunkSize, ackTimeoutMs: ACK_TIMEOUT_MS },
        });
        const onBackpressure = vi.fn();
        const onRetry = vi.fn();

        const driver = (async (): Promise<void> => {
          await waitFor(() => bus.sent.length >= 1, 'BEGIN sent');
          bus.deliver(TRANSFER_ID, beginAck());
          await waitFor(() => chunkSendCount(bus) >= 1, 'first FW_CHUNK sent');
          expect(chunkSendCount(bus)).toBe(1);

          // PAUSE.
          bus.deliver(TRANSFER_ID, backpressure('PAUSE'));
          expect(onBackpressure).toHaveBeenCalledWith(true);

          // First timeout during PAUSE: observer.onRetry fires, but no
          // resend.
          await vi.advanceTimersByTimeAsync(ACK_TIMEOUT_MS);
          // Drain any setImmediate-deferred work just in case.
          await new Promise<void>((r) => setImmediate(r));
          expect(onRetry).toHaveBeenCalledTimes(1);
          expect(onRetry).toHaveBeenCalledWith(0, 1);
          // Critical assertion: NO resend during PAUSE.
          expect(chunkSendCount(bus)).toBe(1);
          // Timer was re-armed: still 2 active fake timers (the per-chunk
          // ack timer + the whole-transfer watchdog). If the
          // re-arm path during PAUSE were broken, the per-chunk timer
          // would be missing and the count would drop to 1 (just the
          // watchdog).
          expect(vi.getTimerCount()).toBe(2);

          // RESUME. Top-up no-ops because seq 0 is still inFlight and
          // there are no more seqs (1-chunk transfer).
          bus.deliver(TRANSFER_ID, backpressure('RESUME'));
          expect(onBackpressure).toHaveBeenCalledWith(false);
          // No new sends from RESUME (the in-flight chunk is the only
          // seq we have).
          expect(chunkSendCount(bus)).toBe(1);

          // Second timeout — now NOT paused, resend happens.
          await vi.advanceTimersByTimeAsync(ACK_TIMEOUT_MS);
          await waitFor(() => chunkSendCount(bus) >= 2, 'resend after RESUME');
          expect(chunkSendCount(bus)).toBe(2);
          expect(onRetry).toHaveBeenCalledTimes(2);
          expect(onRetry.mock.calls[1]).toEqual([0, 2]);

          // ACK the chunk to finish.
          bus.deliver(TRANSFER_ID, chunkAck(0, 1));
          await waitFor(
            () => bus.sent.some((s) => s.payload.includes('FW_TRANSFER_END')),
            'END sent',
          );
          bus.deliver(TRANSFER_ID, endAck('OK'));
        })();

        const result = await streamer.run(specFor(tempPath, buf.length), {
          onBackpressure,
          onRetry,
        });
        await driver;

        expect(result.endAck.status).toBe('OK');
        // The retry budget DID count the PAUSE-time fire (retries=1) plus
        // the post-RESUME fire (retries=2).
        expect(onRetry).toHaveBeenCalledTimes(2);
        expect(onRetry.mock.calls[0]).toEqual([0, 1]);
        expect(onRetry.mock.calls[1]).toEqual([0, 2]);
        // PAUSE then RESUME — exactly two backpressure transitions.
        expect(onBackpressure).toHaveBeenCalledTimes(2);
        expect(bus.subscribers.size).toBe(0);
      } finally {
        await fsp.rm(path.dirname(tempPath), { recursive: true, force: true });
      }
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('ChunkStreamer — whole-transfer watchdog', () => {
  // Each test in this suite uses fake timers scoped to setTimeout/clearTimeout
  // (same scoping as the per-chunk-timeout / backpressure suites). Date and setImmediate
  // stay real so the wall-clock `waitFor` helper at the top of the file keeps
  // working for predicate polling.

  function chunkSendCount(bus: FakeSerialBus): number {
    return bus.sent.filter((s) => s.payload.includes('FW_CHUNK')).length;
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('hung transfer past transferTimeoutMs rejects with transfer_timeout and cleans up', async () => {
    // Setup the watchdog deadline (500ms) shorter than the per-chunk
    // ackTimeoutMs (TRANSPORT_DEFAULTS = 15 000 ms) so the watchdog wins the
    // race against `chunk_retry_exhausted`. Without this gating, a 1-chunk
    // transfer that never receives a chunkAck would burn through
    // maxRetriesPerChunk (5) × ackTimeoutMs (15 000 ms) = 75 s and surface
    // as `chunk_retry_exhausted` long before the production-default 5-min
    // watchdog could fire — making the test untestable in fake-time without
    // contortions. The gating mirrors how production deployments would
    // actually configure the two budgets if the watchdog were ever shorter
    // than the chunk-retry budget.
    const transferTimeoutMs = 500;
    const chunkSize = 100;
    const buf = Buffer.alloc(chunkSize, 0x10);
    const tempPath = await writeTempFirmware(buf);
    try {
      const bus = new FakeSerialBus();
      const streamer = new ChunkStreamer({
        bus,
        config: { chunkSizeBytes: chunkSize, transferTimeoutMs },
      });

      const driver = (async (): Promise<void> => {
        await waitFor(() => bus.sent.length >= 1, 'BEGIN sent');
        // Deliver BEGIN_ACK so the chunk phase starts and the watchdog arms.
        bus.deliver(TRANSFER_ID, beginAck());
        await waitFor(() => chunkSendCount(bus) >= 1, 'first FW_CHUNK sent');
        // Sanity: watchdog timer + per-chunk timer are both armed.
        expect(vi.getTimerCount()).toBe(2);

        // Advance JUST past the watchdog deadline. The watchdog is shorter
        // than ackTimeoutMs, so it fires FIRST and the run rejects with
        // transfer_timeout — not chunk_retry_exhausted.
        await vi.advanceTimersByTimeAsync(transferTimeoutMs);
      })();

      await expect(streamer.run(specFor(tempPath, buf.length), {})).rejects.toMatchObject({
        code: 'transfer_timeout',
        transferId: TRANSFER_ID,
        detail: expect.stringContaining('watchdog'),
      });
      await driver;

      // Cleanup verified on the reject path. Subscriber disposed; no leftover
      // pending fake timers (per-chunk timer drained in finally cleanup AND
      // the watchdog timer self-cleared when it fired then was re-cleared in
      // finally — idempotent).
      expect(bus.subscribers.size).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      await fsp.rm(path.dirname(tempPath), { recursive: true, force: true });
    }
  });

  it('successful transfer leaves no pending watchdog after resolution', async () => {
    // Drive a full happy-path 1-chunk run with fake timers active. After
    // resolve, advance fake time past what would have been the watchdog
    // deadline and assert no pending timers remain — the watchdog must have
    // been cleared on the success path (and the finally cleanup is a no-op
    // on the now-null timer). If the success-path clear were dropped, the
    // watchdog would still be armed here and getTimerCount() would be 1.
    const transferTimeoutMs = 500;
    const chunkSize = 100;
    const buf = Buffer.alloc(chunkSize, 0x20);
    const tempPath = await writeTempFirmware(buf);
    try {
      const bus = new FakeSerialBus();
      const streamer = new ChunkStreamer({
        bus,
        config: { chunkSizeBytes: chunkSize, transferTimeoutMs },
      });

      const driver = (async (): Promise<void> => {
        await waitFor(() => bus.sent.length >= 1, 'BEGIN sent');
        bus.deliver(TRANSFER_ID, beginAck());
        await waitFor(() => chunkSendCount(bus) >= 1, 'first FW_CHUNK sent');
        // Both watchdog and per-chunk timers armed.
        expect(vi.getTimerCount()).toBe(2);

        // Drive the happy path. ACK retires the chunk (clears its timer);
        // END_ACK status=OK then resolves the run.
        bus.deliver(TRANSFER_ID, chunkAck(0, 1));
        await waitFor(
          () => bus.sent.some((s) => s.payload.includes('FW_TRANSFER_END')),
          'END sent',
        );
        bus.deliver(TRANSFER_ID, endAck('OK'));
      })();

      const result = await streamer.run(specFor(tempPath, buf.length), {});
      await driver;

      expect(result.endAck.status).toBe('OK');

      // Primary mutation-friendly assertion: NO pending timers after
      // resolution. The watchdog was cleared on the success path; the
      // per-chunk timer was cleared by the cumulative ACK earlier. If the
      // success-path `clearTransferWatchdog()` were dropped, this would be 1.
      expect(vi.getTimerCount()).toBe(0);

      // Belt-and-suspenders: even if we advance fake time WELL past the
      // watchdog deadline, no callback fires (no late warn, no late
      // observer). A pending watchdog would have rejected at this point —
      // but the run is already resolved, so the rejection would be silently
      // dropped by the underlying Promise. The getTimerCount() assertion
      // above is the actual mutation-detector; this advance is just a
      // smoke check that nothing weird happens.
      await vi.advanceTimersByTimeAsync(transferTimeoutMs * 2);
      expect(vi.getTimerCount()).toBe(0);
      expect(bus.subscribers.size).toBe(0);
    } finally {
      await fsp.rm(path.dirname(tempPath), { recursive: true, force: true });
    }
  });

  it('rejected run leaves no pending watchdog (finally cleanup)', async () => {
    // Mutation guard for the `clearTransferWatchdog()` call in the `finally`
    // block. Drives a HASH_MISMATCH rejection (END_ACK status non-OK). The
    // success-path clear is NOT reached on this path — only the finally
    // clear runs. If the finally-block clear were dropped, the watchdog
    // would still be armed and getTimerCount() would be 1 after the
    // rejection.
    //
    // Crucially we use a transferTimeoutMs LARGE enough that the watchdog
    // does NOT fire during the test (otherwise the rejection code would be
    // 'transfer_timeout' instead of 'hash_mismatch' and the path under test
    // wouldn't be exercised). Default 300_000 is fine; we never advance
    // fake time at all in this test.
    const chunkSize = 100;
    const buf = Buffer.alloc(chunkSize, 0x30);
    const tempPath = await writeTempFirmware(buf);
    try {
      const bus = new FakeSerialBus();
      const streamer = new ChunkStreamer({ bus, config: { chunkSizeBytes: chunkSize } });

      const driver = (async (): Promise<void> => {
        await waitFor(() => bus.sent.length >= 1, 'BEGIN sent');
        bus.deliver(TRANSFER_ID, beginAck());
        await waitFor(() => chunkSendCount(bus) >= 1, 'first FW_CHUNK sent');
        bus.deliver(TRANSFER_ID, chunkAck(0, 1));
        await waitFor(
          () => bus.sent.some((s) => s.payload.includes('FW_TRANSFER_END')),
          'END sent',
        );
        // END_ACK with HASH_MISMATCH — run() rejects, success-path
        // `clearTransferWatchdog()` is NOT reached, only the finally clear.
        bus.deliver(TRANSFER_ID, endAck('HASH_MISMATCH'));
      })();

      await expect(streamer.run(specFor(tempPath, buf.length), {})).rejects.toMatchObject({
        code: 'hash_mismatch',
        transferId: TRANSFER_ID,
      });
      await driver;

      // Primary assertion: finally cleanup cleared the watchdog. If the
      // finally `clearTransferWatchdog()` call were dropped, this would be
      // 1 (the watchdog timer would still be pending until its 300_000 ms
      // deadline expired in fake-time, which we never advance to here).
      expect(vi.getTimerCount()).toBe(0);
      expect(bus.subscribers.size).toBe(0);
    } finally {
      await fsp.rm(path.dirname(tempPath), { recursive: true, force: true });
    }
  });
});

describe('ChunkStreamer — AbortSignal cancellation', () => {
  // Real timers throughout this suite. Abort is event-driven, not timer-
  // driven, so faking timers would only complicate setup. The chunk-loop
  // test below intentionally short-circuits the per-chunk timer race by
  // firing abort BEFORE ackTimeoutMs elapses (the streamer rejects on
  // abort long before any chunk timer would fire).

  function chunkSendCount(bus: FakeSerialBus): number {
    return bus.sent.filter((s) => s.payload.includes('FW_CHUNK')).length;
  }

  it('abort during BEGIN-wait rejects with aborted and cleans up', async () => {
    const buf = Buffer.from('A'.repeat(50));
    const tempPath = await writeTempFirmware(buf);
    try {
      const bus = new FakeSerialBus();
      const streamer = new ChunkStreamer({ bus });
      const ac = new AbortController();

      const driver = (async (): Promise<void> => {
        await waitFor(() => bus.sent.length >= 1, 'BEGIN sent');
        // Do NOT deliver BEGIN_ACK. Trigger abort instead — run() must
        // reject via the abort listener even though no ack ever arrived.
        ac.abort('panic-stop');
      })();

      await expect(
        streamer.run(specFor(tempPath, buf.length), {}, { signal: ac.signal }),
      ).rejects.toMatchObject({
        code: 'aborted',
        transferId: TRANSFER_ID,
        detail: expect.stringContaining('panic-stop'),
      });
      await driver;

      // Cleanup must run on the abort path.
      expect(bus.subscribers.size).toBe(0);
    } finally {
      await fsp.rm(path.dirname(tempPath), { recursive: true, force: true });
    }
  });

  it('abort during chunk-loop rejects with aborted and cleans up', async () => {
    // Multi-chunk transfer; deliver BEGIN_ACK so the chunk phase starts,
    // then fire abort without delivering any chunkAck. The streamer is
    // mid-`await chunkPhaseDone` and the abort listener routes through
    // rejectRun → rejectChunkPhase to release it.
    const chunkSize = 100;
    const buf = Buffer.alloc(chunkSize * 4, 0x10); // 4 chunks
    const tempPath = await writeTempFirmware(buf);
    try {
      const bus = new FakeSerialBus();
      const streamer = new ChunkStreamer({ bus, config: { chunkSizeBytes: chunkSize } });
      const ac = new AbortController();

      const driver = (async (): Promise<void> => {
        await waitFor(() => bus.sent.length >= 1, 'BEGIN sent');
        bus.deliver(TRANSFER_ID, beginAck());
        await waitFor(() => chunkSendCount(bus) >= 1, 'first FW_CHUNK sent');
        // Abort while chunks are in-flight, before any chunkAck.
        ac.abort('job-cancel');
      })();

      await expect(
        streamer.run(specFor(tempPath, buf.length), {}, { signal: ac.signal }),
      ).rejects.toMatchObject({
        code: 'aborted',
        transferId: TRANSFER_ID,
        detail: expect.stringContaining('job-cancel'),
      });
      await driver;

      expect(bus.subscribers.size).toBe(0);
    } finally {
      await fsp.rm(path.dirname(tempPath), { recursive: true, force: true });
    }
  });

  it('abort during END-wait rejects with aborted and cleans up', async () => {
    const buf = Buffer.from('B'.repeat(50));
    const tempPath = await writeTempFirmware(buf);
    try {
      const bus = new FakeSerialBus();
      const streamer = new ChunkStreamer({ bus });
      const ac = new AbortController();

      const driver = (async (): Promise<void> => {
        await waitFor(() => bus.sent.length >= 1, 'BEGIN sent');
        bus.deliver(TRANSFER_ID, beginAck());
        await waitFor(() => bus.sent.length >= 2, 'CHUNK sent');
        bus.deliver(TRANSFER_ID, chunkAck(0, 1));
        await waitFor(
          () => bus.sent.some((s) => s.payload.includes('FW_TRANSFER_END')),
          'END sent',
        );
        // END is on the wire; the streamer is mid-`await waitFor('transferEndAck')`.
        // Abort before delivering END_ACK — the abort listener routes through
        // rejectRun → currentWaiter.reject (single-slot waiter is set for
        // 'transferEndAck' at this point).
        ac.abort('user-cancelled');
      })();

      await expect(
        streamer.run(specFor(tempPath, buf.length), {}, { signal: ac.signal }),
      ).rejects.toMatchObject({
        code: 'aborted',
        transferId: TRANSFER_ID,
        detail: expect.stringContaining('user-cancelled'),
      });
      await driver;

      expect(bus.subscribers.size).toBe(0);
    } finally {
      await fsp.rm(path.dirname(tempPath), { recursive: true, force: true });
    }
  });

  it('successful run removes the abort listener (no leak)', async () => {
    // Spy on addEventListener / removeEventListener so we can assert the
    // listener was added once and removed once. Aborting AFTER run()
    // resolves must NOT trigger the listener (it has already been
    // removed); we verify by checking that the addEventListener call
    // count stays at 1 and the same listener function reference passed
    // to add was passed to remove.
    const buf = Buffer.from('C'.repeat(50));
    const tempPath = await writeTempFirmware(buf);
    try {
      const bus = new FakeSerialBus();
      const streamer = new ChunkStreamer({ bus });
      const ac = new AbortController();
      const addSpy = vi.spyOn(ac.signal, 'addEventListener');
      const removeSpy = vi.spyOn(ac.signal, 'removeEventListener');

      const driver = scheduleHappyPath(bus);
      const result = await streamer.run(specFor(tempPath, buf.length), {}, { signal: ac.signal });
      await driver;

      expect(result.endAck.status).toBe('OK');

      // The streamer must have wired an abort listener on entry...
      const abortAdds = addSpy.mock.calls.filter((c) => c[0] === 'abort');
      expect(abortAdds).toHaveLength(1);
      // ...and removed it in the finally block. Same function reference
      // — otherwise removeEventListener is a no-op and the listener
      // would still be wired after run().
      const abortRemoves = removeSpy.mock.calls.filter((c) => c[0] === 'abort');
      expect(abortRemoves).toHaveLength(1);
      expect(abortRemoves[0][1]).toBe(abortAdds[0][1]);

      // Belt-and-suspenders: aborting now should fire into a void —
      // no rejection thrown back through the already-resolved run(),
      // no UnhandledPromiseRejection. We can't directly assert
      // "listener didn't run" but we CAN assert the abort doesn't
      // raise any error here.
      expect(() => ac.abort('post-resolve')).not.toThrow();

      addSpy.mockRestore();
      removeSpy.mockRestore();
    } finally {
      await fsp.rm(path.dirname(tempPath), { recursive: true, force: true });
    }
  });

  it('pre-aborted signal at run() entry rejects immediately without sending BEGIN', async () => {
    // The signal is already aborted before run() is called. The streamer
    // must short-circuit at the top of try{} and reject — it must NOT
    // send FW_TRANSFER_BEGIN to a master that the orchestrator has
    // already cancelled on.
    const buf = Buffer.from('D'.repeat(50));
    const tempPath = await writeTempFirmware(buf);
    try {
      const bus = new FakeSerialBus();
      const streamer = new ChunkStreamer({ bus });
      const ac = new AbortController();
      ac.abort('pre-cancelled');

      await expect(
        streamer.run(specFor(tempPath, buf.length), {}, { signal: ac.signal }),
      ).rejects.toMatchObject({
        code: 'aborted',
        transferId: TRANSFER_ID,
        detail: expect.stringContaining('pre-cancelled'),
      });

      // Critical: nothing was put on the wire. If the pre-abort check
      // were dropped, the streamer would send FW_TRANSFER_BEGIN and then
      // hang waiting for BEGIN_ACK — the test would time out instead of
      // reject promptly.
      expect(bus.sent).toHaveLength(0);
      // Subscriber was set up then torn down in finally.
      expect(bus.subscribers.size).toBe(0);
    } finally {
      await fsp.rm(path.dirname(tempPath), { recursive: true, force: true });
    }
  });

  it('abort after a NAK Go-Back-N has rebuilt the in-flight window cleans up the new state', async () => {
    // A NAK runs `inFlight.clear()` + `chunkTimers.clear()` and then
    // refills both via topUpWindow. The new in-flight set has armed
    // per-chunk timers that are unrelated to anything the streamer had
    // before the NAK. We then fire abort while that fresh window is
    // mid-flight (no acks delivered yet). The chunk-phase reject path
    // must cleanly tear down the post-Go-Back-N state — subscriber
    // disposed, no timer leaks past `finally`. This is distinct from the
    // "abort during chunk-loop" test above, which aborts before any NAK
    // mutates state; this one specifically pins the rejection landing
    // cleanly when the chunk maps were just rebuilt.
    const chunkSize = 100;
    const totalChunks = 20;
    const buf = Buffer.alloc(chunkSize * totalChunks, 0xab);
    const tempPath = await writeTempFirmware(buf);
    try {
      const bus = new FakeSerialBus();
      const streamer = new ChunkStreamer({ bus, config: { chunkSizeBytes: chunkSize } });
      const ac = new AbortController();
      const onChunkNak = vi.fn();

      // Counts FW_CHUNK sends — same helper shape as the NAK suite uses.
      const chunkSendCount = (): number =>
        bus.sent.filter((s) => s.payload.includes('FW_CHUNK')).length;

      const driver = (async (): Promise<void> => {
        await waitFor(() => bus.sent.length >= 1, 'BEGIN sent');
        bus.deliver(TRANSFER_ID, beginAck());
        await waitFor(() => chunkSendCount() >= 16, 'initial window fill');
        expect(chunkSendCount()).toBe(16);

        // NAK at lastGoodSeq=5 → Go-Back-N: clears inFlight + chunkTimers,
        // refills with seq 6..19 (14 chunks; 14 < windowSize so the entire
        // remainder fits in the rebuilt window).
        bus.deliver(TRANSFER_ID, chunkNak(5, 'CRC'));
        await waitFor(() => chunkSendCount() >= 30, 'Go-Back-N refill from seq 6');
        expect(chunkSendCount()).toBe(30);
        expect(onChunkNak).toHaveBeenCalledTimes(1);

        // Abort while the rebuilt window is still in-flight (no chunkAck
        // has retired any of the refill). The chunk-phase reject path
        // routes through rejectRun → rejectChunkPhase, and the outer
        // `finally` block is responsible for draining the 14 freshly-
        // armed per-chunk timers + clearing the rebuilt inFlight Map.
        ac.abort('panic-stop-after-nak');
      })();

      await expect(
        streamer.run(specFor(tempPath, buf.length), { onChunkNak }, { signal: ac.signal }),
      ).rejects.toMatchObject({
        code: 'aborted',
        transferId: TRANSFER_ID,
        detail: expect.stringContaining('panic-stop-after-nak'),
      });
      await driver;

      // Subscriber disposed — proves the `finally` ran end-to-end.
      // Combined with the resolved promise above (no hang, no
      // unhandled rejection), this confirms the chunk-phase reject
      // landed cleanly through the post-Go-Back-N state.
      expect(bus.subscribers.size).toBe(0);
      // Sanity: total wire sends include both fills, confirming the
      // NAK path executed before abort fired.
      expect(chunkSendCount()).toBe(30);
    } finally {
      await fsp.rm(path.dirname(tempPath), { recursive: true, force: true });
    }
  });
});

describe('ChunkStreamer — pre-transfer error codes', () => {
  // Four failure modes that all surface BEFORE the chunk-streaming phase
  // begins, each with its own TransferErrorCode:
  //   - source_read_failed: fs.readFile throws (ENOENT, EACCES, …)
  //   - source_size_mismatch: on-disk size diverges from spec metadata
  //   - begin_timeout: master never replies to FW_TRANSFER_BEGIN
  //   - begin_rejected: master replies but with a non-OK status
  // Each test verifies the rejection code, the detail content, and that
  // cleanup (subscriber dispose) ran where applicable.

  it('source_read_failed: fsp.readFile ENOENT rejects with code source_read_failed and surfaces errno code', async () => {
    // Spy on fsp.readFile and force it to throw a synthetic
    // NodeJS.ErrnoException. We intentionally do NOT actually create the
    // source file — the spy short-circuits before any real fs touch. The
    // streamer must:
    //   - catch the throw inside run()
    //   - rethrow as TransferError with code 'source_read_failed'
    //   - include both the path and the errno code in `detail`
    //   - NOT subscribe the FwAcks handler (the throw happens before
    //     subscribe; verify by checking bus.subscribers stays empty)
    //   - NOT send anything on the wire (no BEGIN attempted)
    const bus = new FakeSerialBus();
    const streamer = new ChunkStreamer({ bus });

    const enoent = Object.assign(new Error('ENOENT: no such file or directory'), {
      code: 'ENOENT',
    }) as NodeJS.ErrnoException;
    const readSpy = vi.spyOn(fsp, 'readFile').mockRejectedValueOnce(enoent);

    try {
      // Capture the rejection once and assert all detail facets against
      // the same Error instance. `toMatchObject` with a single
      // `stringContaining` would only pin one substring; capturing the
      // error lets us assert both the path and the errno code fragment
      // are present in `detail`.
      const err = (await streamer
        .run(specFor('/nonexistent/firmware.bin', 0), {})
        .catch((e) => e)) as Error & { code?: string; transferId?: string; detail?: string };

      expect(err.code).toBe('source_read_failed');
      expect(err.transferId).toBe(TRANSFER_ID);
      // Both the path and the errno code surface in detail so the
      // orchestrator can present a precise message to the operator.
      expect(err.detail).toContain('/nonexistent/firmware.bin');
      expect(err.detail).toContain('ENOENT');

      // No subscribe attempted, no wire activity.
      expect(bus.subscribers.size).toBe(0);
      expect(bus.sent).toHaveLength(0);
    } finally {
      readSpy.mockRestore();
    }
  });

  it('source_size_mismatch: on-disk size diverges from spec metadata, fails fast before BEGIN is sent', async () => {
    // Real failure mode: c.4's CachedAsset manifest says the cached
    // firmware is N bytes, but the file on disk is N-1 (truncated by
    // a partial download or a race with cache eviction). The streamer
    // reads the file, sees the mismatch, and rejects BEFORE putting
    // FW_TRANSFER_BEGIN on the wire — much cheaper than letting the
    // master discover it via HASH_MISMATCH at END_ACK time.
    //
    // Setup: write a 100-byte file but pass a TransferSpec claiming
    // 200 bytes. Verify rejection with code 'source_size_mismatch',
    // detail includes both the expected and actual sizes, no
    // subscribe, no wire activity.
    const actualSize = 100;
    const claimedSize = 200;
    const buf = Buffer.alloc(actualSize, 0xcd);
    const tempPath = await writeTempFirmware(buf);
    try {
      const bus = new FakeSerialBus();
      const streamer = new ChunkStreamer({ bus });

      // specFor() takes the size as the second arg; pass the LIE.
      const err = (await streamer
        .run(specFor(tempPath, claimedSize), {})
        .catch((e) => e)) as Error & { code?: string; transferId?: string; detail?: string };

      expect(err.code).toBe('source_size_mismatch');
      expect(err.transferId).toBe(TRANSFER_ID);
      // Both numbers in detail so the orchestrator can present a precise
      // diagnosis ("manifest claimed 200, disk has 100 — re-cache").
      expect(err.detail).toContain(String(claimedSize));
      expect(err.detail).toContain(String(actualSize));
      expect(err.detail).toContain(tempPath);

      // Critical: validation runs BEFORE subscribeFwAcks and BEFORE
      // FW_TRANSFER_BEGIN is generated. The streamer must not have
      // touched the bus at all.
      expect(bus.subscribers.size).toBe(0);
      expect(bus.sent).toHaveLength(0);
    } finally {
      await fsp.rm(path.dirname(tempPath), { recursive: true, force: true });
    }
  });

  describe('begin_timeout', () => {
    // Fake timers scoped to setTimeout/clearTimeout so we can fast-forward
    // past the ackTimeoutMs without sitting through real wall-clock.
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('no FW_TRANSFER_BEGIN_ACK within ackTimeoutMs rejects with begin_timeout and cleans up', async () => {
      // Drive run() to the BEGIN-wait phase (BEGIN on the wire) but never
      // deliver BEGIN_ACK. Advance fake time past ackTimeoutMs; the
      // begin-timeout race must fire and reject. Cleanup runs in finally.
      const ackTimeoutMs = 500;
      const buf = Buffer.from('A'.repeat(50));
      const tempPath = await writeTempFirmware(buf);
      try {
        const bus = new FakeSerialBus();
        const streamer = new ChunkStreamer({ bus, config: { ackTimeoutMs } });

        const driver = (async (): Promise<void> => {
          await waitFor(() => bus.sent.length >= 1, 'BEGIN sent');
          // Sanity: BEGIN-wait timer is the only fake timer armed.
          expect(vi.getTimerCount()).toBe(1);
          // Advance just past the deadline. The begin-timeout fires.
          await vi.advanceTimersByTimeAsync(ackTimeoutMs);
        })();

        await expect(streamer.run(specFor(tempPath, buf.length), {})).rejects.toMatchObject({
          code: 'begin_timeout',
          transferId: TRANSFER_ID,
          detail: expect.stringContaining(`${ackTimeoutMs}ms`),
        });
        await driver;

        // Cleanup verified on the reject path. Subscriber disposed; no
        // leftover pending fake timers (the begin-timeout self-cleared
        // when it fired then was re-cleared by the BEGIN-scope finally).
        expect(bus.subscribers.size).toBe(0);
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        await fsp.rm(path.dirname(tempPath), { recursive: true, force: true });
      }
    });

    it('successful BEGIN_ACK clears the begin-timeout timer (no leak)', async () => {
      // Mutation guard for the `clearTimeout(beginAckTimer)` in the
      // BEGIN-scope finally. Drive a happy-path 1-chunk run with fake
      // timers active. After BEGIN_ACK arrives but before any chunk-phase
      // timer arms, the begin-timeout timer must already be cleared. We
      // assert by checking that getTimerCount() never exceeds 1 across
      // the BEGIN→chunk-phase transition: the begin-timeout (1) clears
      // BEFORE the per-chunk timer (1) and watchdog (1) arm, but the
      // observable steady state once the chunk phase is running is
      // 2 timers (per-chunk + watchdog) — NOT 3.
      const chunkSize = 100;
      const buf = Buffer.alloc(chunkSize, 0x40);
      const tempPath = await writeTempFirmware(buf);
      try {
        const bus = new FakeSerialBus();
        const streamer = new ChunkStreamer({ bus, config: { chunkSizeBytes: chunkSize } });

        const driver = (async (): Promise<void> => {
          await waitFor(() => bus.sent.length >= 1, 'BEGIN sent');
          // BEGIN-wait: only the begin-timeout timer should be armed.
          expect(vi.getTimerCount()).toBe(1);
          bus.deliver(TRANSFER_ID, beginAck());
          await waitFor(
            () => bus.sent.filter((s) => s.payload.includes('FW_CHUNK')).length >= 1,
            'first FW_CHUNK sent',
          );
          // Chunk phase running: per-chunk timer + watchdog = 2. The
          // begin-timeout timer must have been cleared in the BEGIN-scope
          // finally — if it were leaked, this would be 3.
          expect(vi.getTimerCount()).toBe(2);

          bus.deliver(TRANSFER_ID, chunkAck(0, 1));
          await waitFor(
            () => bus.sent.some((s) => s.payload.includes('FW_TRANSFER_END')),
            'END sent',
          );
          bus.deliver(TRANSFER_ID, endAck('OK'));
        })();

        const result = await streamer.run(specFor(tempPath, buf.length), {});
        await driver;

        expect(result.endAck.status).toBe('OK');
        // No pending timers at the end — begin-timeout, per-chunk, and
        // watchdog all cleared.
        expect(vi.getTimerCount()).toBe(0);
        expect(bus.subscribers.size).toBe(0);
      } finally {
        await fsp.rm(path.dirname(tempPath), { recursive: true, force: true });
      }
    });
  });

  it('begin_rejected: BEGIN_ACK with non-OK status rejects with code begin_rejected and surfaces the status', async () => {
    // Master replied to BEGIN but with a rejection reason (e.g. SD card
    // full, master busy mid-other-transfer, version mismatch). Per
    // protocol.md the field is open-ended; the streamer must surface the
    // rejected status string in `detail` and reject with code
    // 'begin_rejected' rather than proceeding to the chunk phase.
    const buf = Buffer.from('R'.repeat(50));
    const tempPath = await writeTempFirmware(buf);
    try {
      const bus = new FakeSerialBus();
      const streamer = new ChunkStreamer({ bus });

      const rejectedStatus = 'sd_full';

      const driver = (async (): Promise<void> => {
        await waitFor(() => bus.sent.length >= 1, 'BEGIN sent');
        // Deliver BEGIN_ACK with a non-OK status — master is rejecting.
        bus.deliver(TRANSFER_ID, {
          kind: 'beginAck',
          transferId: TRANSFER_ID,
          status: rejectedStatus,
        });
      })();

      await expect(streamer.run(specFor(tempPath, buf.length), {})).rejects.toMatchObject({
        code: 'begin_rejected',
        transferId: TRANSFER_ID,
        detail: expect.stringContaining(rejectedStatus),
      });
      await driver;

      // Critical: NO chunk activity. The streamer must not proceed past
      // BEGIN if the status is non-OK — only the BEGIN frame was sent.
      expect(bus.sent.filter((s) => s.payload.includes('FW_CHUNK'))).toHaveLength(0);
      expect(bus.sent.filter((s) => s.payload.includes('FW_TRANSFER_END'))).toHaveLength(0);
      // Cleanup runs on the reject path.
      expect(bus.subscribers.size).toBe(0);
    } finally {
      await fsp.rm(path.dirname(tempPath), { recursive: true, force: true });
    }
  });
});

describe('ChunkStreamer — post-transfer error codes', () => {
  // Failure modes that surface AFTER the chunk-streaming phase completes,
  // each with its own TransferErrorCode:
  //   - end_timeout: master never replies to FW_TRANSFER_END
  //   - hash_mismatch: END_ACK status === 'HASH_MISMATCH' — verified in the
  //     "END_ACK non-OK rejects with cleanup" suite above; not reasserted here
  //   - master_io_error: END_ACK status === 'IO_ERROR' — same
  // FwTransferEndAck.status is a closed enum ('OK' | 'HASH_MISMATCH' |
  // 'IO_ERROR'; see firmware_messages.ts), so the two-arm dispatch in the
  // streamer is exhaustive and no fallback test is needed.

  describe('end_timeout', () => {
    // Fake timers scoped to setTimeout/clearTimeout. Date and setImmediate
    // stay real so the wall-clock `waitFor` helper keeps working.
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('no FW_TRANSFER_END_ACK within ackTimeoutMs rejects with end_timeout and cleans up', async () => {
      // Drive run() through BEGIN_ACK and chunkAck so END is sent on the
      // wire, but never deliver END_ACK. Advance fake time past
      // ackTimeoutMs; the end-timeout race must fire and reject. Cleanup
      // runs in finally.
      //
      // Note: transferTimeoutMs (the whole-transfer watchdog) is left at
      // its 300_000 ms default. We never advance fake time anywhere near
      // that, so the watchdog cannot win the race against the
      // end-timeout setTimeout(ackTimeoutMs=500). If the end-timeout
      // race were dropped (mutation), the run would hang — fake time
      // would still need to be advanced, and even at the 300_000 ms
      // mark the rejection code would be 'transfer_timeout' rather
      // than 'end_timeout', so the assertion still catches the
      // mutation but with a different (slower) failure mode.
      const ackTimeoutMs = 500;
      const chunkSize = 100;
      const buf = Buffer.alloc(chunkSize, 0x50);
      const tempPath = await writeTempFirmware(buf);
      try {
        const bus = new FakeSerialBus();
        const streamer = new ChunkStreamer({
          bus,
          config: { ackTimeoutMs, chunkSizeBytes: chunkSize },
        });

        const driver = (async (): Promise<void> => {
          await waitFor(() => bus.sent.length >= 1, 'BEGIN sent');
          bus.deliver(TRANSFER_ID, beginAck());
          await waitFor(() => bus.sent.some((s) => s.payload.includes('FW_CHUNK')), 'CHUNK sent');
          bus.deliver(TRANSFER_ID, chunkAck(0, 1));
          await waitFor(
            () => bus.sent.some((s) => s.payload.includes('FW_TRANSFER_END')),
            'END sent',
          );
          // Sanity: end-timeout + watchdog are armed (per-chunk timer
          // was cleared by the cumulative ACK above).
          expect(vi.getTimerCount()).toBe(2);
          // Advance just past the end-timeout deadline — the watchdog
          // is at the 300_000 ms default so it doesn't fire here.
          await vi.advanceTimersByTimeAsync(ackTimeoutMs);
        })();

        await expect(streamer.run(specFor(tempPath, buf.length), {})).rejects.toMatchObject({
          code: 'end_timeout',
          transferId: TRANSFER_ID,
          detail: expect.stringContaining(`${ackTimeoutMs}ms`),
        });
        await driver;

        // Cleanup verified on the reject path. Subscriber disposed; no
        // leftover pending fake timers (the end-timeout self-cleared
        // when it fired then was re-cleared by the END-scope finally;
        // the watchdog was cleared by the outer-block finally).
        expect(bus.subscribers.size).toBe(0);
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        await fsp.rm(path.dirname(tempPath), { recursive: true, force: true });
      }
    });

    it('successful END_ACK clears the end-timeout timer (no leak)', async () => {
      // Mutation guard for the `clearTimeout(endAckTimer)` in the END-scope
      // finally. Drive a happy-path 1-chunk run with fake timers active.
      // After END_ACK arrives and the run resolves, no fake timers must
      // remain pending — the end-timeout timer must have been cleared
      // before resolve. If the END-scope finally clear were dropped,
      // getTimerCount() would be 1 (the still-pending end-timeout).
      const ackTimeoutMs = 500;
      const chunkSize = 100;
      const buf = Buffer.alloc(chunkSize, 0x60);
      const tempPath = await writeTempFirmware(buf);
      try {
        const bus = new FakeSerialBus();
        const streamer = new ChunkStreamer({
          bus,
          config: { ackTimeoutMs, chunkSizeBytes: chunkSize },
        });

        const driver = (async (): Promise<void> => {
          await waitFor(() => bus.sent.length >= 1, 'BEGIN sent');
          bus.deliver(TRANSFER_ID, beginAck());
          await waitFor(() => bus.sent.some((s) => s.payload.includes('FW_CHUNK')), 'CHUNK sent');
          bus.deliver(TRANSFER_ID, chunkAck(0, 1));
          await waitFor(
            () => bus.sent.some((s) => s.payload.includes('FW_TRANSFER_END')),
            'END sent',
          );
          // END_ACK happy path — run() resolves; end-timeout must clear.
          bus.deliver(TRANSFER_ID, endAck('OK'));
        })();

        const result = await streamer.run(specFor(tempPath, buf.length), {});
        await driver;

        expect(result.endAck.status).toBe('OK');
        // No pending timers after resolution — end-timeout, watchdog,
        // and per-chunk timer all cleared. If the end-timeout finally
        // clear were dropped, this would be 1.
        expect(vi.getTimerCount()).toBe(0);
        expect(bus.subscribers.size).toBe(0);
      } finally {
        await fsp.rm(path.dirname(tempPath), { recursive: true, force: true });
      }
    });
  });
});

describe('ChunkStreamer — bus_send_failed', () => {
  // `bus.send()` may throw — in production the WorkerSerialBus's underlying
  // Worker channel can die, the postMessage IPC pipe can close, or a
  // serialization fault can surface synchronously. Without explicit
  // handling, such throws either escape uncaught (BEGIN/END sites in
  // run()) or — worse — escape from a setTimeout callback (the resend
  // path inside onChunkTimeout) where Node surfaces them as
  // `uncaughtException`. The streamer wraps every bus.send call site so the
  // throw becomes TransferError('bus_send_failed', ...).
  //
  // FakeSerialBusThatThrows is a per-test-built variant: replaces `send`
  // with a vi.fn() configured to throw on the Nth call (or always).
  // Constructed inline rather than as a class hierarchy so each test owns
  // its throw policy explicitly.

  it('bus.send throws on FW_TRANSFER_BEGIN: rejects with bus_send_failed and cleans up', async () => {
    const buf = Buffer.from('A'.repeat(50));
    const tempPath = await writeTempFirmware(buf);
    try {
      const bus = new FakeSerialBus();
      // Replace send with a thrower. The first (and only) call attempts to
      // put FW_TRANSFER_BEGIN on the wire; the throw surfaces as
      // TransferError('bus_send_failed') via the run() try/catch wrap.
      bus.send = vi.fn(() => {
        throw new Error('worker channel died');
      });

      const streamer = new ChunkStreamer({ bus });

      await expect(streamer.run(specFor(tempPath, buf.length), {})).rejects.toMatchObject({
        code: 'bus_send_failed',
        transferId: TRANSFER_ID,
        detail: expect.stringContaining('FW_TRANSFER_BEGIN'),
      });
      await expect(streamer.run(specFor(tempPath, buf.length), {})).rejects.toMatchObject({
        detail: expect.stringContaining('worker channel died'),
      });

      // Cleanup must run even though the throw happened inside the BEGIN
      // send — the subscriber was set up immediately before, so the
      // finally must dispose it.
      expect(bus.subscribers.size).toBe(0);
    } finally {
      await fsp.rm(path.dirname(tempPath), { recursive: true, force: true });
    }
  });

  it('bus.send throws mid-chunk-stream: rejects with bus_send_failed and cleans up', async () => {
    // Multi-chunk transfer. The first 2 calls (BEGIN + first FW_CHUNK)
    // succeed; the 3rd call (second FW_CHUNK during top-up) throws. The
    // throw flows through sendChunk → topUpWindow → rejectChunkPhase
    // (since topUpWindow runs inside the subscriber callback driving the
    // post-BEGIN_ACK initial fill).
    const chunkSize = 100;
    const buf = Buffer.alloc(chunkSize * 4, 0x33); // 4 chunks
    const tempPath = await writeTempFirmware(buf);
    try {
      const bus = new FakeSerialBus();
      // Track calls: 1=BEGIN, 2=first chunk, 3=second chunk (throws here).
      let callCount = 0;
      const realSend = bus.send.bind(bus);
      bus.send = vi.fn((payload: string, opts: { kind: 'firmware' }) => {
        callCount += 1;
        if (callCount >= 3) {
          throw new Error('IPC pipe closed');
        }
        realSend(payload, opts);
      });

      const streamer = new ChunkStreamer({
        bus,
        // windowSize=4 so the initial top-up tries to send all 4 chunks
        // synchronously after BEGIN_ACK; the 3rd call throws.
        config: { chunkSizeBytes: chunkSize, windowSize: 4 },
      });

      const driver = (async (): Promise<void> => {
        await waitFor(() => bus.sent.length >= 1, 'BEGIN sent');
        bus.deliver(TRANSFER_ID, beginAck());
      })();

      await expect(streamer.run(specFor(tempPath, buf.length), {})).rejects.toMatchObject({
        code: 'bus_send_failed',
        transferId: TRANSFER_ID,
        detail: expect.stringContaining('FW_CHUNK'),
      });
      await driver;

      expect(bus.subscribers.size).toBe(0);
    } finally {
      await fsp.rm(path.dirname(tempPath), { recursive: true, force: true });
    }
  });

  it('bus.send throws on FW_TRANSFER_END: rejects with bus_send_failed and cleans up', async () => {
    // Drive the full chunk phase so the streamer reaches the END send,
    // then make that call throw. Verifies the END-site try/catch and
    // that the finally still drains the watchdog (armed during chunk
    // phase) and disposes the subscriber.
    const chunkSize = 100;
    const buf = Buffer.alloc(chunkSize, 0x44);
    const tempPath = await writeTempFirmware(buf);
    try {
      const bus = new FakeSerialBus();
      let callCount = 0;
      const realSend = bus.send.bind(bus);
      // BEGIN (1) + FW_CHUNK (2) succeed; FW_TRANSFER_END (3) throws.
      bus.send = vi.fn((payload: string, opts: { kind: 'firmware' }) => {
        callCount += 1;
        if (callCount === 3) {
          throw new Error('serial port closed unexpectedly');
        }
        realSend(payload, opts);
      });

      const streamer = new ChunkStreamer({ bus, config: { chunkSizeBytes: chunkSize } });

      const driver = (async (): Promise<void> => {
        await waitFor(() => bus.sent.length >= 1, 'BEGIN sent');
        bus.deliver(TRANSFER_ID, beginAck());
        await waitFor(() => bus.sent.length >= 2, 'CHUNK sent');
        bus.deliver(TRANSFER_ID, chunkAck(0, 1));
      })();

      await expect(streamer.run(specFor(tempPath, buf.length), {})).rejects.toMatchObject({
        code: 'bus_send_failed',
        transferId: TRANSFER_ID,
        detail: expect.stringContaining('FW_TRANSFER_END'),
      });
      await driver;

      expect(bus.subscribers.size).toBe(0);
    } finally {
      await fsp.rm(path.dirname(tempPath), { recursive: true, force: true });
    }
  });

  it('bus.send throws on resend path (per-chunk timeout): rejects with bus_send_failed without uncaughtException', async () => {
    // The trickiest call site: the resend inside `onChunkTimeout` is a
    // setTimeout callback. A throw there cannot propagate via return —
    // it would become an uncaughtException at the runtime level. The
    // wrap in onChunkTimeout catches and routes through
    // rejectChunkPhase. We verify by:
    //   1. Driving a 1-chunk transfer through BEGIN_ACK
    //   2. Letting the per-chunk timer fire (no chunkAck delivered)
    //   3. The resend invokes bus.send, which throws
    //   4. run() rejects with bus_send_failed (NOT
    //      chunk_retry_exhausted, NOT transfer_timeout)
    //
    // We attach a `process` listener for `uncaughtException` to catch the
    // mutation case (if the wrap were removed). Vitest by default would
    // also surface the uncaught throw as a test failure, but the explicit
    // listener gives us a precise assertion.
    const ackTimeoutMs = 500;
    const chunkSize = 100;
    const buf = Buffer.alloc(chunkSize, 0x55);
    const tempPath = await writeTempFirmware(buf);

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const uncaught: Error[] = [];
    const onUncaught = (err: Error): void => {
      uncaught.push(err);
    };
    process.on('uncaughtException', onUncaught);
    try {
      const bus = new FakeSerialBus();
      let callCount = 0;
      const realSend = bus.send.bind(bus);
      // Calls: 1=BEGIN (succeeds), 2=initial chunk send (succeeds),
      // 3=resend on timeout (throws).
      bus.send = vi.fn((payload: string, opts: { kind: 'firmware' }) => {
        callCount += 1;
        if (callCount === 3) {
          throw new Error('worker terminated mid-resend');
        }
        realSend(payload, opts);
      });

      const streamer = new ChunkStreamer({
        bus,
        config: { chunkSizeBytes: chunkSize, ackTimeoutMs },
      });

      const driver = (async (): Promise<void> => {
        await waitFor(() => bus.sent.length >= 1, 'BEGIN sent');
        bus.deliver(TRANSFER_ID, beginAck());
        await waitFor(
          () => bus.sent.some((s) => s.payload.includes('FW_CHUNK')),
          'first chunk sent',
        );
        // No chunkAck delivered. Advance past ackTimeoutMs so the
        // per-chunk timer fires; the resend inside onChunkTimeout
        // calls bus.send, which throws.
        await vi.advanceTimersByTimeAsync(ackTimeoutMs);
      })();

      await expect(streamer.run(specFor(tempPath, buf.length), {})).rejects.toMatchObject({
        code: 'bus_send_failed',
        transferId: TRANSFER_ID,
        detail: expect.stringContaining('worker terminated mid-resend'),
      });
      await driver;

      // No uncaughtException — the timer-callback wrap caught the throw.
      expect(uncaught).toHaveLength(0);
      // Cleanup: subscriber disposed, all timers drained.
      expect(bus.subscribers.size).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      process.off('uncaughtException', onUncaught);
      vi.useRealTimers();
      await fsp.rm(path.dirname(tempPath), { recursive: true, force: true });
    }
  });
});

describe('ChunkStreamer — cleanup invariants verification', () => {
  // Cross-cutting cleanup tests: for each major rejection path, assert
  // the post-rejection invariants hold:
  //   (a) the FwAcks subscriber was disposed (bus.subscribers.size === 0)
  //   (b) all per-chunk setTimeout IDs cleared (vi.getTimerCount() === 0)
  //   (c) the transfer watchdog cleared (subsumed by (b) under fake timers)
  //   (d) AbortSignal listener removed (verified via spy where applicable)
  // The Buffer reference dropping (sourceBuffer) is implicit — the local
  // goes out of scope when run() returns — and is not directly asserted
  // because there's no leak-tracking hook in JS without resorting to
  // FinalizationRegistry, which is too flaky for a deterministic test.
  //
  // Per-error-code cleanup is already asserted in the individual Task
  // 4–11 suites where each error code lives. This block focuses on the
  // CROSS-CUTTING shape: every error path runs the SAME finally, so
  // covering 3 representative paths (early, mid-chunk, post-chunk) is
  // sufficient confidence that the finally is reached uniformly. If a
  // future task adds a 12th error code that doesn't share the run()
  // try/finally (e.g. a synchronous throw before subscribe()), THAT
  // task would add its own cleanup test.

  it('post-rejection invariants hold for source_read_failed (pre-subscribe path)', async () => {
    // source_read_failed throws before subscribeFwAcks runs. The finally
    // never gets a chance to call unsubscribe() — but that's fine,
    // because no subscriber was ever installed. Invariant: bus.subscribers
    // remains empty throughout. No timers were ever armed.
    const bus = new FakeSerialBus();
    const streamer = new ChunkStreamer({ bus });

    await expect(
      streamer.run(specFor('/nonexistent/path/firmware.bin', 100), {}),
    ).rejects.toMatchObject({
      code: 'source_read_failed',
    });

    expect(bus.subscribers.size).toBe(0);
  });

  it('post-rejection invariants hold for chunk_retry_exhausted (mid-chunk path)', async () => {
    // chunk_retry_exhausted is a chunk-phase rejection: subscriber was
    // installed, watchdog armed, per-chunk timer armed. Finally must
    // drain ALL of them.
    const ackTimeoutMs = 500;
    const chunkSize = 100;
    const buf = Buffer.alloc(chunkSize, 0x77);
    const tempPath = await writeTempFirmware(buf);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const bus = new FakeSerialBus();
      const streamer = new ChunkStreamer({
        bus,
        config: { chunkSizeBytes: chunkSize, ackTimeoutMs, maxRetriesPerChunk: 2 },
      });

      const driver = (async (): Promise<void> => {
        await waitFor(() => bus.sent.length >= 1, 'BEGIN sent');
        bus.deliver(TRANSFER_ID, beginAck());
        await waitFor(
          () => bus.sent.some((s) => s.payload.includes('FW_CHUNK')),
          'first chunk sent',
        );
        // Burn through retries: maxRetriesPerChunk=2 means
        // retries=1 (resend) → retries=2 (reject).
        await vi.advanceTimersByTimeAsync(ackTimeoutMs);
        await vi.advanceTimersByTimeAsync(ackTimeoutMs);
      })();

      await expect(streamer.run(specFor(tempPath, buf.length), {})).rejects.toMatchObject({
        code: 'chunk_retry_exhausted',
      });
      await driver;

      // (a) subscriber disposed
      expect(bus.subscribers.size).toBe(0);
      // (b) + (c) all timers cleared (per-chunk timers + watchdog)
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
      await fsp.rm(path.dirname(tempPath), { recursive: true, force: true });
    }
  });

  it('post-rejection invariants hold for aborted (chunk-phase, with abort listener removal)', async () => {
    // aborted exercises the most cleanup paths: subscriber, watchdog,
    // per-chunk timers, AND the AbortSignal listener. Verify ALL of them
    // are released — adds the spy-based listener-removal assertion that
    // chunk_retry_exhausted's path doesn't have.
    const chunkSize = 100;
    const buf = Buffer.alloc(chunkSize * 2, 0x88); // 2 chunks so a timer is armed
    const tempPath = await writeTempFirmware(buf);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const bus = new FakeSerialBus();
      const streamer = new ChunkStreamer({ bus, config: { chunkSizeBytes: chunkSize } });
      const ac = new AbortController();
      const addSpy = vi.spyOn(ac.signal, 'addEventListener');
      const removeSpy = vi.spyOn(ac.signal, 'removeEventListener');

      const driver = (async (): Promise<void> => {
        await waitFor(() => bus.sent.length >= 1, 'BEGIN sent');
        bus.deliver(TRANSFER_ID, beginAck());
        await waitFor(
          () => bus.sent.some((s) => s.payload.includes('FW_CHUNK')),
          'first chunk sent',
        );
        // At this point: subscriber set, watchdog armed, per-chunk
        // timers armed, abort listener wired. Abort triggers cleanup.
        ac.abort('test-cleanup');
      })();

      await expect(
        streamer.run(specFor(tempPath, buf.length), {}, { signal: ac.signal }),
      ).rejects.toMatchObject({
        code: 'aborted',
      });
      await driver;

      // (a) subscriber disposed
      expect(bus.subscribers.size).toBe(0);
      // (b) + (c) all timers cleared (per-chunk timers + watchdog)
      expect(vi.getTimerCount()).toBe(0);
      // (d) abort listener removed — same fn ref added once and
      // removed once.
      const abortAdds = addSpy.mock.calls.filter((c) => c[0] === 'abort');
      const abortRemoves = removeSpy.mock.calls.filter((c) => c[0] === 'abort');
      expect(abortAdds).toHaveLength(1);
      expect(abortRemoves).toHaveLength(1);
      expect(abortRemoves[0][1]).toBe(abortAdds[0][1]);

      addSpy.mockRestore();
      removeSpy.mockRestore();
    } finally {
      vi.useRealTimers();
      await fsp.rm(path.dirname(tempPath), { recursive: true, force: true });
    }
  });

  it('post-rejection invariants hold for bus_send_failed at BEGIN (subscriber installed, no timers armed yet)', async () => {
    // bus_send_failed at BEGIN exercises a narrow but important case:
    // subscriber WAS installed (subscribe runs before the BEGIN send),
    // but no timers were ever armed (the BEGIN throw happens before
    // beginAckTimer/watchdog/chunk timers come into play). Finally must
    // dispose the subscriber even though no timer drain is needed.
    const buf = Buffer.from('Z'.repeat(50));
    const tempPath = await writeTempFirmware(buf);
    try {
      const bus = new FakeSerialBus();
      bus.send = vi.fn(() => {
        throw new Error('test-bus-send-failed');
      });
      const streamer = new ChunkStreamer({ bus });

      await expect(streamer.run(specFor(tempPath, buf.length), {})).rejects.toMatchObject({
        code: 'bus_send_failed',
      });

      expect(bus.subscribers.size).toBe(0);
    } finally {
      await fsp.rm(path.dirname(tempPath), { recursive: true, force: true });
    }
  });
});

describe('ChunkStreamer — out-of-phase chunk-ack gate', () => {
  // The phase-aware dispatcher gates chunkAck/chunkNak/backpressure on an
  // explicit `chunkPhaseActive` flag, NOT on `currentWaiter === null`.
  // Three windows where currentWaiter is null but we are NOT in the chunk
  // phase: (1) between subscribeFwAcks and the BEGIN-wait Promise being
  // constructed; (2) after BEGIN_ACK resolves and before topUpWindow
  // begins; (3) after `await chunkPhaseDone` resolves and before the
  // END-wait Promise is constructed. A stale chunkAck arriving in any of
  // those windows would mutate `highestAcked` / `inFlight` and could fire
  // `resolveChunkPhaseDone()` if its claimed `highestContiguousSeq >=
  // lastSeq` — the streamer would skip the chunk phase entirely and send
  // END after BEGIN with no chunks on the wire.
  //
  // To exercise window (1), we subclass FakeSerialBus and have `send`
  // synchronously deliver a stale chunkAck on the BEGIN send. At that
  // moment, the streamer has subscribed but has not yet constructed the
  // BEGIN-wait Promise — currentWaiter is null and chunkPhaseActive is
  // false. With the gate, the dispatcher must drop the stale ack; the
  // streamer then proceeds normally and sends real chunks. Without the
  // gate (mutation: change `if (!chunkPhaseActive)` back to
  // `if (currentWaiter !== null)`) the stale ack would route to
  // `handleChunkAck`, fire `resolveChunkPhaseDone`, and the streamer
  // would emit zero FW_CHUNK before sending FW_TRANSFER_END.

  it('drops a stale chunkAck delivered during the BEGIN send (window 1)', async () => {
    const chunkSize = 100;
    const totalChunks = 5;
    const buf = Buffer.alloc(chunkSize * totalChunks, 0xa1);
    const tempPath = await writeTempFirmware(buf);
    try {
      class EarlyAckBus extends FakeSerialBus {
        deliverEarlyAckOnBegin = false;
        override send(payload: string, opts: { kind: SendKind }): void {
          super.send(payload, opts);
          // Synchronously deliver a stale chunkAck the moment BEGIN lands
          // on the wire. The streamer is in the synchronous setup window
          // between subscribeFwAcks and the BEGIN-wait Promise being
          // constructed: currentWaiter is null, chunkPhaseActive is
          // false. Only fire on the FIRST send (the BEGIN) — we don't
          // want to recurse into END-send.
          //
          // Partial-progress ack (highestContiguousSeq=2, lastSeq=4) is
          // critical for mutation discrimination. A "complete" ack here
          // would coincidentally collapse under the bug — the streamer
          // would still send all 5 chunks via topUpWindow because
          // highestAcked >= lastSeq fires resolveChunkPhaseDone but
          // doesn't suppress the post-BEGIN_ACK topUpWindow call. With
          // a partial ack, the bug forces TWO observer.onChunkAck fires
          // (one for the stale (2, 300), one for the real (4, 500))
          // versus exactly one under the gate.
          if (
            this.deliverEarlyAckOnBegin &&
            payload.includes('FW_TRANSFER_BEGIN') &&
            !payload.includes('FW_TRANSFER_BEGIN_ACK')
          ) {
            this.deliverEarlyAckOnBegin = false;
            this.deliver(TRANSFER_ID, chunkAck(2, 3));
          }
        }
      }

      const bus = new EarlyAckBus();
      bus.deliverEarlyAckOnBegin = true;
      const streamer = new ChunkStreamer({ bus, config: { chunkSizeBytes: chunkSize } });
      const onChunkAck = vi.fn();

      const driver = (async (): Promise<void> => {
        await waitFor(() => bus.sent.length >= 1, 'BEGIN sent');
        // The stale ack has already been delivered synchronously inside
        // bus.send. With the gate active, it should have been dropped
        // and the streamer is awaiting BEGIN_ACK.
        bus.deliver(TRANSFER_ID, beginAck());
        // After BEGIN_ACK, the chunk phase opens and chunks should fire.
        await waitFor(
          () =>
            bus.sent.filter(
              (s) => s.payload.includes('FW_CHUNK') && !s.payload.includes('FW_CHUNK_'),
            ).length >= totalChunks,
          'all chunks sent',
        );
        bus.deliver(TRANSFER_ID, chunkAck(totalChunks - 1, totalChunks));
        await waitFor(
          () => bus.sent.some((s) => s.payload.includes('FW_TRANSFER_END')),
          'END sent',
        );
        bus.deliver(TRANSFER_ID, endAck('OK'));
      })();

      const result = await streamer.run(specFor(tempPath, buf.length), { onChunkAck });
      await driver;

      expect(result.endAck.status).toBe('OK');
      expect(result.totalChunks).toBe(totalChunks);
      // Critical assertion: real chunks were sent. Without the gate, the
      // stale ack would have fired resolveChunkPhaseDone and the streamer
      // would have skipped from BEGIN_ACK directly to END with zero
      // FW_CHUNK on the wire.
      const chunkCount = bus.sent.filter(
        (s) => s.payload.includes('FW_CHUNK') && !s.payload.includes('FW_CHUNK_'),
      ).length;
      expect(chunkCount).toBe(totalChunks);
      // Observer fired exactly once — for the LEGITIMATE final ack from
      // the driver, not for the stale early ack. Without the gate, this
      // would be 2 (or 1 with stale data — depending on which the
      // assertion catches first).
      expect(onChunkAck).toHaveBeenCalledTimes(1);
      expect(onChunkAck).toHaveBeenCalledWith(totalChunks - 1, buf.length);
      expect(bus.subscribers.size).toBe(0);
    } finally {
      await fsp.rm(path.dirname(tempPath), { recursive: true, force: true });
    }
  });
});
