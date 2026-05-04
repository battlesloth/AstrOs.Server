// Boots a real ApiServer connected to a StubMaster via a PTY pair, exposes
// HTTP + WebSocket clients for tests, and tears everything down cleanly on
// dispose(). Linux/macOS only (inherits PTY pair platform constraint).

import { createServer } from 'net';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { WebSocket } from 'ws';

import { ApiServer } from '../api_server.js';
import { createPtyPair, type PtyPair } from './pty_pair.js';
import { StubMaster } from './stub_master.js';

export interface BootIntegrationHarnessOpts {
  masterFirmwareVersion?: string; // default '1.0.0'
  masterVariant?: string; // default 'astros-master-test-variant'
  masterMac?: string; // default '00:00:00:00:00:00' (sentinel)
  masterFingerprint?: string; // default 'master-stub'
}

export interface IntegrationHarness {
  server: ApiServer;
  stub: StubMaster;
  pty: PtyPair;
  httpBaseUrl: string;
  wsClient: WebSocket;
  receivedWsMessages: readonly unknown[];
  waitForWsMessage<T = unknown>(
    predicate: (msg: unknown) => boolean,
    timeoutMs?: number,
  ): Promise<T>;
  dispose(): Promise<void>;
}

async function findFreePort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close((err) => {
        if (err) reject(err);
        else if (port === 0) reject(new Error('findFreePort: failed to allocate'));
        else resolve(port);
      });
    });
  });
}

export async function bootIntegrationHarness(
  opts: BootIntegrationHarnessOpts = {},
): Promise<IntegrationHarness> {
  // 1. PTY pair
  const pty = await createPtyPair();

  // 2. Random ports
  const apiPort = await findFreePort();
  const wsPort = await findFreePort();

  // 3. Temp DB directory (so tests don't pollute ~/.config/astrosserver)
  const dbDir = await mkdtemp(join(tmpdir(), 'astros-integration-'));

  // 4. Set env vars for the ApiServer's bootstrap.
  // NOTE: process.env is process-global, so concurrent harness boots in the
  // same process would race. vitest doesn't run tests within the same file
  // in parallel by default; each test sequentially boots+disposes.
  const prevEnv = {
    SERIAL_PORT: process.env.SERIAL_PORT,
    BAUD_RATE: process.env.BAUD_RATE,
    API_PORT: process.env.API_PORT,
    WEBSOCKET_PORT: process.env.WEBSOCKET_PORT,
    JWT_KEY: process.env.JWT_KEY,
    DATABASE_PATH: process.env.DATABASE_PATH,
    NODE_ENV: process.env.NODE_ENV,
  };
  process.env.SERIAL_PORT = pty.serverPath;
  process.env.BAUD_RATE = '9600';
  process.env.API_PORT = String(apiPort);
  process.env.WEBSOCKET_PORT = String(wsPort);
  process.env.JWT_KEY = process.env.JWT_KEY ?? 'test-jwt-key';
  process.env.DATABASE_PATH = dbDir;
  // Important: do NOT set NODE_ENV='test' — that would skip setupSerialPort,
  // which is the very thing we want to exercise. Override to undefined if it
  // was set by vitest globals.
  delete process.env.NODE_ENV;

  let server: ApiServer | undefined;
  let stub: StubMaster | undefined;
  let wsClient: WebSocket | undefined;

  try {
    // 5. Boot ApiServer.
    server = await ApiServer.bootstrap();

    // 6. Construct + start StubMaster on the master end.
    stub = new StubMaster({
      ptyPath: pty.masterPath,
      masterMac: opts.masterMac,
      masterFingerprint: opts.masterFingerprint,
      masterFirmwareVersion: opts.masterFirmwareVersion,
      masterVariant: opts.masterVariant,
    });
    await stub.start();

    // 7. Connect WS client + buffer messages. The message listener must be
    // attached BEFORE the connection completes, because the server sends its
    // initial `systemStatus` + `lockState` snapshot inside its 'connection'
    // handler (which fires on handshake completion). If we awaited 'open'
    // first and then registered the listener, those frames would emit before
    // any consumer was listening and would be lost.
    wsClient = new WebSocket(`ws://127.0.0.1:${wsPort}`);

    const receivedWsMessages: unknown[] = [];
    type Listener = (msg: unknown) => void;
    const listeners: Listener[] = [];
    wsClient.on('message', (data) => {
      try {
        const parsed: unknown = JSON.parse(data.toString());
        receivedWsMessages.push(parsed);
        for (const l of [...listeners]) l(parsed);
      } catch {
        // Ignore non-JSON frames (shouldn't happen — server emits JSON).
      }
    });

    const ws = wsClient;
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });

    const waitForWsMessage = <T = unknown>(
      predicate: (msg: unknown) => boolean,
      timeoutMs = 5000,
    ): Promise<T> => {
      const existing = receivedWsMessages.find(predicate);
      if (existing !== undefined) return Promise.resolve(existing as T);

      return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
          const idx = listeners.indexOf(handler);
          if (idx >= 0) listeners.splice(idx, 1);
          const recent = receivedWsMessages
            .slice(-10)
            .map((m) => (m as { type?: unknown })?.type ?? '<no type>');
          reject(
            new Error(
              `waitForWsMessage timed out after ${timeoutMs}ms. ` +
                `Recent message types: ${JSON.stringify(recent)}`,
            ),
          );
        }, timeoutMs);

        const handler: Listener = (msg) => {
          if (!predicate(msg)) return;
          clearTimeout(timer);
          const idx = listeners.indexOf(handler);
          if (idx >= 0) listeners.splice(idx, 1);
          resolve(msg as T);
        };
        listeners.push(handler);
      });
    };

    const dispose = async (): Promise<void> => {
      // Reverse-order teardown. Resilient: each step in its own try/catch so
      // a failure in one doesn't leak the others.
      try {
        wsClient?.close();
      } catch {
        /* ignore */
      }
      try {
        await stub?.dispose();
      } catch {
        /* ignore */
      }
      try {
        await server?.shutdown();
      } catch {
        /* ignore */
      }
      try {
        await pty.dispose();
      } catch {
        /* ignore */
      }
      try {
        await rm(dbDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }

      // Restore env vars to prevent leakage to other tests.
      for (const [key, value] of Object.entries(prevEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    };

    return {
      server,
      stub,
      pty,
      httpBaseUrl: `http://127.0.0.1:${apiPort}`,
      wsClient,
      receivedWsMessages,
      waitForWsMessage,
      dispose,
    };
  } catch (bootErr) {
    // If anything fails mid-boot, tear down what we did set up.
    try {
      wsClient?.close();
    } catch {
      /* ignore */
    }
    try {
      await stub?.dispose();
    } catch {
      /* ignore */
    }
    try {
      await server?.shutdown();
    } catch {
      /* ignore */
    }
    try {
      await pty.dispose();
    } catch {
      /* ignore */
    }
    try {
      await rm(dbDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    for (const [key, value] of Object.entries(prevEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    throw bootErr;
  }
}
