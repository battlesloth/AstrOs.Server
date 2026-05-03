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
  FwChunkAck,
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

function endAck(status: 'OK' | 'HASH_MISMATCH' | 'IO_ERROR' = 'OK'): FwInboundAck {
  return {
    kind: 'transferEndAck',
    transferId: TRANSFER_ID,
    status,
    computedSha256Hex: SHA256_PLACEHOLDER,
  } satisfies { kind: 'transferEndAck' } & FwTransferEndAck;
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
// Task 3/4 has no time-dependent logic, so real timers are fine.
//
// TODO(c.6b Task 6): migrate to vi.useFakeTimers() once timer-driven
// retry/watchdog logic lands; this wall-clock bound is a temporary
// measure for Tasks 3-5 which use real timers only for the readFile.
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
