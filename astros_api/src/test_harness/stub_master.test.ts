import { describe, it, expect } from 'vitest';
import { SerialPort } from 'serialport';
import { DelimiterParser } from '@serialport/parser-delimiter';

import { createPtyPair } from './pty_pair.js';
import { StubMaster } from './stub_master.js';
import { MessageGenerator } from '../serial/message_generator.js';
import { MessageHandler } from '../serial/message_handler.js';
import { SerialMessageType } from '../serial/serial_message.js';
import { SerialWorkerResponseType } from '../serial/serial_worker_response.js';
import {
  FW_SERIAL_SLIDING_WINDOW,
  FwStage,
  type FwTransferBegin,
  type FwChunk,
  type FwTransferEnd,
  type FwDeployBegin,
} from '../models/firmware/firmware_messages.js';

const skipIfNotLinux = process.platform !== 'linux' ? it.skip : it;

// ---------------------------------------------------------------------------
// Shared setup helper — avoids 20+ lines of PTY/port/stub boilerplate per
// test. Returns all three live handles. Caller must tear down in `finally`.
// ---------------------------------------------------------------------------

interface TestEnds {
  stub: StubMaster;
  serverPort: SerialPort;
  dispose: () => Promise<void>;
}

async function setupBothEnds(): Promise<TestEnds> {
  const pty = await createPtyPair();
  const stub = new StubMaster({ ptyPath: pty.masterPath });
  const serverPort = new SerialPort({ path: pty.serverPath, baudRate: 9600, autoOpen: false });

  await stub.start();
  await new Promise<void>((resolve, reject) => {
    serverPort.open((err) => (err ? reject(err) : resolve()));
  });

  const dispose = async (): Promise<void> => {
    await stub.dispose();
    await new Promise<void>((resolve) => {
      if (serverPort.isOpen) {
        serverPort.close(() => resolve());
      } else {
        resolve();
      }
    });
    await pty.dispose();
  };

  return { stub, serverPort, dispose };
}

type ValidatedFrame = ReturnType<MessageHandler['validateMessage']>;

// Collect N frames from the server side of the PTY by parsing each line.
function collectFrames(
  serverPort: SerialPort,
  count: number,
  timeoutMs = 3000,
): Promise<ValidatedFrame[]> {
  return new Promise((resolve, reject) => {
    const handler = new MessageHandler();
    const frames: ValidatedFrame[] = [];
    const timer = setTimeout(
      () =>
        reject(
          new Error(`collectFrames: timed out waiting for ${count} frames, got ${frames.length}`),
        ),
      timeoutMs,
    );
    const parser = serverPort.pipe(new DelimiterParser({ delimiter: '\n' }));
    parser.on('data', (chunk: Buffer) => {
      const validation = handler.validateMessage(chunk.toString('utf8'));
      frames.push(validation);
      if (frames.length >= count) {
        clearTimeout(timer);
        resolve(frames);
      }
    });
  });
}

// Assert that a frame at a given index exists and return it, so callers
// don't need non-null assertions. Throws a descriptive error if the frame
// is missing (which should only happen if collectFrames resolves with fewer
// frames than expected — a test-setup bug, not a product bug).
function requireFrame(frames: ValidatedFrame[], index: number): ValidatedFrame {
  const f = frames[index];
  if (f === undefined) {
    throw new Error(`requireFrame: no frame at index ${index} (got ${frames.length} total)`);
  }
  return f;
}

describe('StubMaster (PTY-backed)', () => {
  // -------------------------------------------------------------------------
  // Raw I/O round-trips
  // -------------------------------------------------------------------------

  skipIfNotLinux(
    'inbound: server-side write of FW_TRANSFER_BEGIN is parsed by the stub master',
    async () => {
      const pty = await createPtyPair();
      const stub = new StubMaster({ ptyPath: pty.masterPath });

      // Server side opens the *server* PTY end and writes a real
      // FW_TRANSFER_BEGIN frame using the production MessageGenerator.
      const serverPort = new SerialPort({
        path: pty.serverPath,
        baudRate: 9600,
        autoOpen: false,
      });

      try {
        await stub.start();
        await new Promise<void>((resolve, reject) => {
          serverPort.open((err) => (err ? reject(err) : resolve()));
        });

        const generator = new MessageGenerator();
        const beginPayload: FwTransferBegin = {
          transferId: 'xfer-abc',
          totalSize: 1024,
          sha256Hex: 'a'.repeat(64),
          chunkSize: 256,
          targets: ['ctrl-1', 'ctrl-2'],
        };
        const header = generator.generateHeader(SerialMessageType.FW_TRANSFER_BEGIN, 'msg-1');
        const { msg } = generator.generateFwTransferBegin(header, beginPayload);
        serverPort.write(msg);

        const frame = await stub.waitForFrame(
          (f) => f.type === SerialMessageType.FW_TRANSFER_BEGIN,
          3000,
        );

        expect(frame.type).toBe(SerialMessageType.FW_TRANSFER_BEGIN);
        expect(frame.msgId).toBe('msg-1');
        expect(frame.payload).toContain('xfer-abc');
        expect(frame.payload).toContain('ctrl-1');

        // Snapshot view should include the same frame.
        const seen = stub.receivedFrames();
        expect(seen.length).toBeGreaterThanOrEqual(1);
        expect(seen[0]?.msgId).toBe('msg-1');
      } finally {
        await stub.dispose();
        await new Promise<void>((resolve) => {
          if (serverPort.isOpen) {
            serverPort.close(() => resolve());
          } else {
            resolve();
          }
        });
        await pty.dispose();
      }
    },
  );

  skipIfNotLinux(
    'outbound: stub master writes FW_TRANSFER_BEGIN_ACK that the server-side handler accepts',
    async () => {
      const pty = await createPtyPair();
      const stub = new StubMaster({ ptyPath: pty.masterPath });

      const serverPort = new SerialPort({
        path: pty.serverPath,
        baudRate: 9600,
        autoOpen: false,
      });

      try {
        await stub.start();
        await new Promise<void>((resolve, reject) => {
          serverPort.open((err) => (err ? reject(err) : resolve()));
        });

        // Wire up a parser on the server side and capture exactly one line.
        const handler = new MessageHandler();
        const linePromise = new Promise<string>((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error('Server did not receive a frame within 3000ms')),
            3000,
          );
          const parser = serverPort.pipe(new DelimiterParser({ delimiter: '\n' }));
          parser.once('data', (chunk: Buffer) => {
            clearTimeout(timer);
            resolve(chunk.toString('utf8'));
          });
        });

        stub.writeFwTransferBeginAck({
          transferId: 'xfer-1',
          status: 'OK',
          msgId: 'm1',
        });

        const line = await linePromise;
        const validation = handler.validateMessage(line);

        expect(validation.valid).toBe(true);
        expect(validation.type).toBe(SerialMessageType.FW_TRANSFER_BEGIN_ACK);
        expect(validation.id).toBe('m1');

        const response = handler.handleFwTransferBeginAck(validation.data);
        expect(response.type).toBe(SerialWorkerResponseType.FW_TRANSFER_BEGIN_ACK);
        if (response.type === SerialWorkerResponseType.FW_TRANSFER_BEGIN_ACK) {
          expect(response.payload.transferId).toBe('xfer-1');
          expect(response.payload.status).toBe('OK');
        }
      } finally {
        await stub.dispose();
        await new Promise<void>((resolve) => {
          if (serverPort.isOpen) {
            serverPort.close(() => resolve());
          } else {
            resolve();
          }
        });
        await pty.dispose();
      }
    },
  );

  // -------------------------------------------------------------------------
  // Scripted-response API
  // -------------------------------------------------------------------------

  skipIfNotLinux(
    'autoAckUpload: auto-ACKs FW_TRANSFER_BEGIN, three FW_CHUNKs, and FW_TRANSFER_END',
    async () => {
      const { stub, serverPort, dispose } = await setupBothEnds();
      try {
        stub.autoAckUpload();

        const generator = new MessageGenerator();
        const SHA = 'b'.repeat(64);
        const XFER = 'xfer-upload-1';

        // 5 frames expected back: 1 begin-ack + 3 chunk-acks + 1 end-ack.
        const framesPromise = collectFrames(serverPort, 5);

        // Write FW_TRANSFER_BEGIN
        const beginHeader = generator.generateHeader(SerialMessageType.FW_TRANSFER_BEGIN, 'b1');
        const { msg: beginMsg } = generator.generateFwTransferBegin(beginHeader, {
          transferId: XFER,
          totalSize: 300,
          sha256Hex: SHA,
          chunkSize: 100,
          targets: ['master'],
        });
        serverPort.write(beginMsg);

        // Write 3 FW_CHUNKs (seq 0, 1, 2)
        for (let seq = 0; seq < 3; seq++) {
          const chunkData: FwChunk = {
            transferId: XFER,
            seq,
            payloadLen: 4,
            base64Bytes: 'AAAA',
            crc16Hex: '00ff',
          };
          const chunkHeader = generator.generateHeader(SerialMessageType.FW_CHUNK, `c${seq}`);
          const { msg: chunkMsg } = generator.generateFwChunk(chunkHeader, chunkData);
          serverPort.write(chunkMsg);
        }

        // Write FW_TRANSFER_END
        const endData: FwTransferEnd = {
          transferId: XFER,
          totalChunks: 3,
          finalSha256Hex: SHA,
        };
        const endHeader = generator.generateHeader(SerialMessageType.FW_TRANSFER_END, 'e1');
        const { msg: endMsg } = generator.generateFwTransferEnd(endHeader, endData);
        serverPort.write(endMsg);

        const frames = await framesPromise;
        const handler = new MessageHandler();

        // Frame 0: FW_TRANSFER_BEGIN_ACK with status='OK'
        const f0 = requireFrame(frames, 0);
        expect(f0.valid).toBe(true);
        expect(f0.type).toBe(SerialMessageType.FW_TRANSFER_BEGIN_ACK);
        const beginAck = handler.handleFwTransferBeginAck(f0.data);
        expect(beginAck.type).toBe(SerialWorkerResponseType.FW_TRANSFER_BEGIN_ACK);
        if (beginAck.type === SerialWorkerResponseType.FW_TRANSFER_BEGIN_ACK) {
          expect(beginAck.payload.transferId).toBe(XFER);
          expect(beginAck.payload.status).toBe('OK');
        }

        // Frames 1-3: FW_CHUNK_ACK with advancing highestContiguousSeq / nextExpectedSeq
        for (let seq = 0; seq < 3; seq++) {
          const f = requireFrame(frames, seq + 1);
          expect(f.valid).toBe(true);
          expect(f.type).toBe(SerialMessageType.FW_CHUNK_ACK);
          const ack = handler.handleFwChunkAck(f.data);
          expect(ack.type).toBe(SerialWorkerResponseType.FW_CHUNK_ACK);
          if (ack.type === SerialWorkerResponseType.FW_CHUNK_ACK) {
            expect(ack.payload.transferId).toBe(XFER);
            expect(ack.payload.highestContiguousSeq).toBe(seq);
            expect(ack.payload.nextExpectedSeq).toBe(seq + 1);
          }
        }

        // Frame 4: FW_TRANSFER_END_ACK echoing the SHA
        const f4 = requireFrame(frames, 4);
        expect(f4.valid).toBe(true);
        expect(f4.type).toBe(SerialMessageType.FW_TRANSFER_END_ACK);
        const endAck = handler.handleFwTransferEndAck(f4.data);
        expect(endAck.type).toBe(SerialWorkerResponseType.FW_TRANSFER_END_ACK);
        if (endAck.type === SerialWorkerResponseType.FW_TRANSFER_END_ACK) {
          expect(endAck.payload.transferId).toBe(XFER);
          expect(endAck.payload.status).toBe('OK');
          expect(endAck.payload.computedSha256Hex).toBe(SHA);
        }
      } finally {
        await dispose();
      }
    },
  );

  skipIfNotLinux(
    'autoAckUpload with failAtSeq=2: NAKs once then resumes normal ACKing',
    async () => {
      const { stub, serverPort, dispose } = await setupBothEnds();
      try {
        stub.autoAckUpload({ failAtSeq: 2 });

        const generator = new MessageGenerator();
        const XFER = 'xfer-nak-test';

        // Sequence: seq 0 → ACK, seq 1 → ACK, seq 2 → NAK, seq 2 (retry) → ACK, seq 3 → ACK
        // 5 responses total.
        const framesPromise = collectFrames(serverPort, 5);

        const writeChunk = (seq: number): void => {
          const chunkData: FwChunk = {
            transferId: XFER,
            seq,
            payloadLen: 4,
            base64Bytes: 'AAAA',
            crc16Hex: '00ff',
          };
          const header = generator.generateHeader(SerialMessageType.FW_CHUNK, `c${seq}`);
          const { msg } = generator.generateFwChunk(header, chunkData);
          serverPort.write(msg);
        };

        // seq 0, 1, 2 (triggers NAK), 2 (retry → ACK), 3
        writeChunk(0);
        writeChunk(1);
        writeChunk(2);
        writeChunk(2); // retransmit after NAK
        writeChunk(3);

        const frames = await framesPromise;
        const handler = new MessageHandler();

        // seq 0 → ACK
        const fn0 = requireFrame(frames, 0);
        expect(fn0.type).toBe(SerialMessageType.FW_CHUNK_ACK);
        const ack0 = handler.handleFwChunkAck(fn0.data);
        if (ack0.type === SerialWorkerResponseType.FW_CHUNK_ACK) {
          expect(ack0.payload.highestContiguousSeq).toBe(0);
          expect(ack0.payload.nextExpectedSeq).toBe(1);
        }

        // seq 1 → ACK
        const fn1 = requireFrame(frames, 1);
        expect(fn1.type).toBe(SerialMessageType.FW_CHUNK_ACK);
        const ack1 = handler.handleFwChunkAck(fn1.data);
        if (ack1.type === SerialWorkerResponseType.FW_CHUNK_ACK) {
          expect(ack1.payload.highestContiguousSeq).toBe(1);
          expect(ack1.payload.nextExpectedSeq).toBe(2);
        }

        // seq 2 (first occurrence) → NAK with lastGoodSeq=1, reasonCode='CRC'
        const fn2 = requireFrame(frames, 2);
        expect(fn2.type).toBe(SerialMessageType.FW_CHUNK_NAK);
        const nak = handler.handleFwChunkNak(fn2.data);
        expect(nak.type).toBe(SerialWorkerResponseType.FW_CHUNK_NAK);
        if (nak.type === SerialWorkerResponseType.FW_CHUNK_NAK) {
          expect(nak.payload.transferId).toBe(XFER);
          expect(nak.payload.lastGoodSeq).toBe(1);
          expect(nak.payload.reasonCode).toBe('CRC');
        }

        // seq 2 (retransmit) → ACK
        const fn3 = requireFrame(frames, 3);
        expect(fn3.type).toBe(SerialMessageType.FW_CHUNK_ACK);
        const ack2retry = handler.handleFwChunkAck(fn3.data);
        if (ack2retry.type === SerialWorkerResponseType.FW_CHUNK_ACK) {
          expect(ack2retry.payload.highestContiguousSeq).toBe(2);
          expect(ack2retry.payload.nextExpectedSeq).toBe(3);
        }

        // seq 3 → ACK
        const fn4 = requireFrame(frames, 4);
        expect(fn4.type).toBe(SerialMessageType.FW_CHUNK_ACK);
        const ack3 = handler.handleFwChunkAck(fn4.data);
        if (ack3.type === SerialWorkerResponseType.FW_CHUNK_ACK) {
          expect(ack3.payload.highestContiguousSeq).toBe(3);
          expect(ack3.payload.nextExpectedSeq).toBe(4);
        }
      } finally {
        await dispose();
      }
    },
  );

  skipIfNotLinux(
    'scriptDeploy: walks FW_PROGRESS stages then emits FW_DEPLOY_DONE with per-controller outcomes',
    async () => {
      const { stub, serverPort, dispose } = await setupBothEnds();
      try {
        stub.scriptDeploy({
          controllers: [
            { id: 'ctrl-A', outcome: 'OK', finalVersion: '1.5.0' },
            { id: 'ctrl-B', outcome: 'FAILED', error: 'crc_mismatch' },
          ],
        });

        const generator = new MessageGenerator();
        const XFER = 'xfer-1';

        // 3 stages × 2 controllers + 1 FW_DEPLOY_DONE = 7 frames
        const framesPromise = collectFrames(serverPort, 7);

        const deployData: FwDeployBegin = {
          transferId: XFER,
          order: ['ctrl-A', 'ctrl-B'],
        };
        const header = generator.generateHeader(SerialMessageType.FW_DEPLOY_BEGIN, 'd1');
        const { msg } = generator.generateFwDeployBegin(header, deployData);
        serverPort.write(msg);

        const frames = await framesPromise;
        const handler = new MessageHandler();

        const defaultStages = [FwStage.Sending, FwStage.Verifying, FwStage.Rebooting];

        // Frames 0-2: FW_PROGRESS for ctrl-A (Sending, Verifying, Rebooting)
        for (let i = 0; i < 3; i++) {
          const f = requireFrame(frames, i);
          expect(f.type).toBe(SerialMessageType.FW_PROGRESS);
          const prog = handler.handleFwProgress(f.data);
          expect(prog.type).toBe(SerialWorkerResponseType.FW_PROGRESS);
          if (prog.type === SerialWorkerResponseType.FW_PROGRESS) {
            expect(prog.payload.transferId).toBe(XFER);
            expect(prog.payload.controllerId).toBe('ctrl-A');
            expect(prog.payload.stage).toBe(defaultStages[i]);
            expect(prog.payload.bytesSent).toBe(0);
            expect(prog.payload.totalBytes).toBe(0);
          }
        }

        // Frames 3-5: FW_PROGRESS for ctrl-B (Sending, Verifying, Rebooting)
        for (let i = 0; i < 3; i++) {
          const f = requireFrame(frames, i + 3);
          expect(f.type).toBe(SerialMessageType.FW_PROGRESS);
          const prog = handler.handleFwProgress(f.data);
          expect(prog.type).toBe(SerialWorkerResponseType.FW_PROGRESS);
          if (prog.type === SerialWorkerResponseType.FW_PROGRESS) {
            expect(prog.payload.transferId).toBe(XFER);
            expect(prog.payload.controllerId).toBe('ctrl-B');
            expect(prog.payload.stage).toBe(defaultStages[i]);
          }
        }

        // Frame 6: FW_DEPLOY_DONE with both controller outcomes
        const f6 = requireFrame(frames, 6);
        expect(f6.type).toBe(SerialMessageType.FW_DEPLOY_DONE);
        const done = handler.handleFwDeployDone(f6.data);
        expect(done.type).toBe(SerialWorkerResponseType.FW_DEPLOY_DONE);
        if (done.type === SerialWorkerResponseType.FW_DEPLOY_DONE) {
          expect(done.payload.transferId).toBe(XFER);
          expect(done.payload.results).toHaveLength(2);
          const [rA, rB] = done.payload.results;
          expect(rA?.controllerId).toBe('ctrl-A');
          expect(rA?.outcome).toBe('OK');
          expect(rA?.finalVersion).toBe('1.5.0');
          expect(rA?.error).toBe('');
          expect(rB?.controllerId).toBe('ctrl-B');
          expect(rB?.outcome).toBe('FAILED');
          expect(rB?.finalVersion).toBe('');
          expect(rB?.error).toBe('crc_mismatch');
        }
      } finally {
        await dispose();
      }
    },
  );

  skipIfNotLinux(
    'writePollAck: emits POLL_ACK parseable by MessageHandler.handlePollAck',
    async () => {
      const { stub, serverPort, dispose } = await setupBothEnds();
      try {
        const framesPromise = collectFrames(serverPort, 1);

        stub.writePollAck({
          mac: 'AA:BB:CC:DD:EE:FF',
          fingerprint: 'fp-test',
          firmwareVersion: '2.3.4',
          variant: 'astros-padawan-test',
          msgId: 'poll-m1',
        });

        const frames = await framesPromise;
        const handler = new MessageHandler();

        const fp0 = requireFrame(frames, 0);
        expect(fp0.valid).toBe(true);
        expect(fp0.type).toBe(SerialMessageType.POLL_ACK);
        expect(fp0.id).toBe('poll-m1');

        const resp = handler.handlePollAck(fp0.data);
        expect(resp.type).toBe(SerialWorkerResponseType.POLL);
        if (resp.type === SerialWorkerResponseType.POLL) {
          expect(resp.controller?.address).toBe('AA:BB:CC:DD:EE:FF');
          expect(resp.controller?.fingerprint).toBe('fp-test');
          expect(resp.controller?.firmwareVersion).toBe('2.3.4');
          expect(resp.controller?.variant).toBe('astros-padawan-test');
        }
      } finally {
        await dispose();
      }
    },
  );

  skipIfNotLinux(
    'disable("autoAckUpload"): no response is written after FW_TRANSFER_BEGIN',
    async () => {
      const { stub, serverPort, dispose } = await setupBothEnds();
      try {
        stub.autoAckUpload();
        stub.disable('autoAckUpload');

        const generator = new MessageGenerator();

        // Race: if any frame arrives within 200ms the test fails; timeout is a pass.
        const noResponsePromise = new Promise<'timeout' | 'got-frame'>((resolve) => {
          const timer = setTimeout(() => resolve('timeout'), 200);
          const parser = serverPort.pipe(new DelimiterParser({ delimiter: '\n' }));
          parser.once('data', () => {
            clearTimeout(timer);
            resolve('got-frame');
          });
        });

        const beginHeader = generator.generateHeader(SerialMessageType.FW_TRANSFER_BEGIN, 'b-dis');
        const { msg: beginMsg } = generator.generateFwTransferBegin(beginHeader, {
          transferId: 'xfer-disabled',
          totalSize: 100,
          sha256Hex: 'c'.repeat(64),
          chunkSize: 100,
          targets: ['master'],
        });
        serverPort.write(beginMsg);

        const result = await noResponsePromise;
        expect(result).toBe('timeout');
      } finally {
        await dispose();
      }
    },
  );

  // -------------------------------------------------------------------------
  // autoAckUpload input validation — protects against frames the server
  // would categorically parse as UNKNOWN. No PTY needed: the validation
  // runs synchronously inside autoAckUpload() before any wire I/O.
  // -------------------------------------------------------------------------

  it('autoAckUpload: rejects windowSize > FW_SERIAL_SLIDING_WINDOW', () => {
    const stub = new StubMaster({ ptyPath: '/dev/null' });
    expect(() => stub.autoAckUpload({ windowSize: FW_SERIAL_SLIDING_WINDOW + 1 })).toThrow(
      /windowSize must be in/,
    );
  });

  it('autoAckUpload: rejects windowSize <= 0', () => {
    const stub = new StubMaster({ ptyPath: '/dev/null' });
    expect(() => stub.autoAckUpload({ windowSize: 0 })).toThrow(/windowSize must be in/);
    expect(() => stub.autoAckUpload({ windowSize: -1 })).toThrow(/windowSize must be in/);
  });

  it('autoAckUpload: rejects failAtSeq <= 0 (would emit invalid lastGoodSeq)', () => {
    const stub = new StubMaster({ ptyPath: '/dev/null' });
    expect(() => stub.autoAckUpload({ failAtSeq: 0 })).toThrow(/failAtSeq must be > 0/);
    expect(() => stub.autoAckUpload({ failAtSeq: -5 })).toThrow(/failAtSeq must be > 0/);
  });

  it('autoAckUpload: accepts windowSize at the FW_SERIAL_SLIDING_WINDOW boundary', () => {
    const stub = new StubMaster({ ptyPath: '/dev/null' });
    expect(() => stub.autoAckUpload({ windowSize: FW_SERIAL_SLIDING_WINDOW })).not.toThrow();
  });
});
