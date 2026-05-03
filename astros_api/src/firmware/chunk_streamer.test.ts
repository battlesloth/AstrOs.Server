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
// Task 3 has no time-dependent logic, so real timers are fine.
async function waitFor(predicate: () => boolean, label: string): Promise<void> {
  // 200 macrotask iterations is plenty for the streamer to reach the next
  // send(); any more and something is wrong (avoids an infinite hang).
  for (let i = 0; i < 200; i++) {
    if (predicate()) return;
    await new Promise<void>((r) => setImmediate(r));
  }
  throw new Error(`waitFor(${label}) timed out after 200 iterations`);
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
