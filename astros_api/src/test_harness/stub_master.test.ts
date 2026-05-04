import { describe, it, expect } from 'vitest';
import { SerialPort } from 'serialport';
import { DelimiterParser } from '@serialport/parser-delimiter';

import { createPtyPair } from './pty_pair.js';
import { StubMaster } from './stub_master.js';
import { MessageGenerator } from '../serial/message_generator.js';
import { MessageHandler } from '../serial/message_handler.js';
import { SerialMessageType } from '../serial/serial_message.js';
import { SerialWorkerResponseType } from '../serial/serial_worker_response.js';
import { type FwTransferBegin } from '../models/firmware/firmware_messages.js';

const skipIfNotPosix = process.platform === 'win32' ? it.skip : it;

describe('StubMaster (PTY-backed)', () => {
  skipIfNotPosix(
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

  skipIfNotPosix(
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
});
