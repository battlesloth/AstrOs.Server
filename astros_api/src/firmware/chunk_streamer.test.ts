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

// Inline FakeSerialBus — Task 3 only. If a future task in c.6b or c.6c needs to
// share this, lift to chunk_streamer_testing.ts. Keeping it co-located with the
// happy-path test for now keeps the surface area small and discourages
// accidental coupling between streamer tests and other suites.
type SendKind = Parameters<SerialBus['send']>[1]['kind'];

class FakeSerialBus implements SerialBus {
  readonly sent: Array<{ payload: string; kind: SendKind }> = [];
  // Map keyed by transferId. Task 3's streamer subscribes once at the start of
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

function chunkNak(lastGoodSeq: number, reasonCode: FwChunkNakReason): FwInboundAck {
  return {
    kind: 'chunkNak',
    transferId: TRANSFER_ID,
    lastGoodSeq,
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
// Tasks 3-5 have no time-dependent logic, so real timers are fine. The Task 6
// describe block uses `vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })`,
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

describe('ChunkStreamer — single-chunk happy path (Task 3 skeleton)', () => {
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

describe('ChunkStreamer — sliding window (Task 4)', () => {
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

describe('ChunkStreamer — NAK + Go-Back-N (Task 5)', () => {
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
      // Observer fired with (lastGoodSeq, reason).
      expect(onChunkNak).toHaveBeenCalledTimes(1);
      expect(onChunkNak).toHaveBeenCalledWith(5, 'CRC');
      // Total sends: 16 initial + 14 Go-Back-N refill = 30 FW_CHUNK entries.
      expect(chunkSendCount(bus)).toBe(30);
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
      expect(onChunkNak.mock.calls[0]).toEqual([3, 'CRC']);
      expect(onChunkNak.mock.calls[1]).toEqual([7, 'OUT_OF_ORDER']);
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
      expect(onChunkNak).toHaveBeenCalledWith(2, 'FLASH_FULL');
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
        expect(onChunkNak).toHaveBeenCalledWith(5, 'CRC');

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
      expect(onChunkNak).toHaveBeenCalledWith(5, 'CRC');
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
        expect(onChunkNak).toHaveBeenCalledWith(2, reason);
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

describe('ChunkStreamer — per-chunk timeout + retry (Task 6)', () => {
  // Default ackTimeoutMs from TRANSPORT_DEFAULTS. Hard-coded here rather than
  // imported so the test stays self-contained and a future config tweak that
  // changes the default would force these tests to be reviewed deliberately.
  const ACK_TIMEOUT_MS = 1500;

  // Task 6 keeps Date and setImmediate un-faked (only setTimeout/clearTimeout
  // are intercepted), so the top-of-file wall-clock `waitFor` works as-is
  // here for predicate polling. `advanceTimersByTimeAsync(ACK_TIMEOUT_MS)` is
  // what we actually need fake timers for — fast-forwarding the streamer's
  // ack-timeout setTimeout without sitting through 1.5 real-time seconds.

  function chunkSendCount(bus: FakeSerialBus): number {
    return bus.sent.filter((s) => s.payload.includes('FW_CHUNK')).length;
  }

  beforeEach(() => {
    // Fake ONLY setTimeout/clearTimeout — the two timer APIs the streamer
    // uses for the per-chunk ack timeout in Task 6. Three deliberate
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
      const streamer = new ChunkStreamer({ bus, config: { chunkSizeBytes: chunkSize } });
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
      const streamer = new ChunkStreamer({ bus, config: { chunkSizeBytes: chunkSize } });
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
      const streamer = new ChunkStreamer({ bus, config: { chunkSizeBytes: chunkSize } });
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
      const streamer = new ChunkStreamer({ bus, config: { chunkSizeBytes: chunkSize } });
      const onRetry = vi.fn();

      let timerCountAfterAck = -1;
      const driver = (async (): Promise<void> => {
        await waitFor(() => bus.sent.length >= 1, 'BEGIN sent');
        bus.deliver(TRANSFER_ID, beginAck());
        await waitFor(() => chunkSendCount(bus) >= 1, 'first FW_CHUNK sent');
        // Sanity: two fake-timer slots are occupied — the per-chunk ack
        // timer for seq=0 (Task 6) AND the whole-transfer watchdog (Task 8,
        // armed post-BEGIN_ACK). If this fails the test pre-condition is
        // wrong, not the invariant we're testing.
        expect(vi.getTimerCount()).toBe(2);

        // Deliver the ACK BEFORE the timer fires. clearChunkTimer should
        // disarm the per-chunk timer in lockstep with inFlight.delete —
        // this is what we want to verify.
        bus.deliver(TRANSFER_ID, chunkAck(0, 1));
        // Snapshot the count synchronously after the deliver returns. The
        // ACK retire path runs synchronously in the bus subscriber callback,
        // so by this point clearChunkTimer should have run. We expect 1
        // remaining (the Task 8 watchdog); the per-chunk timer has been
        // disarmed.
        timerCountAfterAck = vi.getTimerCount();

        // Belt-and-suspenders: advance past the timeout to confirm onRetry
        // is not somehow triggered through a side-channel. Bounded by less
        // than the watchdog's 300_000 ms default so the watchdog itself
        // doesn't fire mid-test.
        await vi.advanceTimersByTimeAsync(ACK_TIMEOUT_MS * 2);

        await waitFor(
          () => bus.sent.some((s) => s.payload.includes('FW_TRANSFER_END')),
          'END sent',
        );
        bus.deliver(TRANSFER_ID, endAck('OK'));
      })();

      const result = await streamer.run(specFor(tempPath, buf.length), { onRetry });
      await driver;

      expect(result.endAck.status).toBe('OK');
      // Primary mutation-friendly assertion: per-chunk timer was actively
      // cleared. The Task 8 watchdog is still armed at this snapshot
      // (count == 1), so a missing clearChunkTimer would push it to 2.
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

describe('ChunkStreamer — backpressure pause/resume (Task 7)', () => {
  // Same FW_CHUNK counter as the Task 5/6 suites.
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

  it('per-chunk timeout during PAUSE re-arms but does not resend; resend resumes after RESUME', async () => {
    // Fake timers gated to setTimeout/clearTimeout (same scoping as the
    // Task 6 suite). 1-chunk transfer keeps the timer-fire ordering
    // deterministic.
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
        const streamer = new ChunkStreamer({ bus, config: { chunkSizeBytes: chunkSize } });
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
          // ack timer + the Task 8 whole-transfer watchdog). If the
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

describe('ChunkStreamer — whole-transfer watchdog (Task 8)', () => {
  // Each test in this suite uses fake timers scoped to setTimeout/clearTimeout
  // (same scoping as the Task 6/7 fake-timer tests). Date and setImmediate
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
    // ackTimeoutMs (1500ms) so the watchdog wins the race against
    // `chunk_retry_exhausted`. Without this gating, a 1-chunk transfer that
    // never receives a chunkAck would burn through 3 retries (~4.5s) and
    // surface as `chunk_retry_exhausted` long before the production-default
    // 5-min watchdog could fire — making the test untestable in fake-time
    // without contortions. The gating mirrors how production deployments
    // would actually configure the two budgets if the watchdog were ever
    // shorter than the chunk-retry budget.
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

describe('ChunkStreamer — AbortSignal cancellation (Task 9)', () => {
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
});
