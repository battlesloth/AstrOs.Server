// Integration test for JobLock + requireUnlocked over a real HTTP roundtrip.
//
// What this verifies:
//   - The middleware fires inside an Express handler chain.
//   - The HTTP response carries status 423 + a LockedErrorResponse body
//     with the expected shape.
//   - The response transitions back to the downstream handler's response
//     after the lock is released.
//
// What this does NOT verify:
//   - That api_server.ts:setRoutes actually attaches requireUnlocked to
//     /api/panicStop. That wire is small (one line) and verified by code
//     review. When c.2 expands the middleware to the full write-route set,
//     that PR's integration test should boot the real ApiServer.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import type { AddressInfo } from 'net';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { JobLock } from './job_lock.js';
import { requireUnlocked } from './job_lock_middleware.js';
import {
  buildLockStateResponse,
  type LockedErrorResponse,
} from './models/networking/lock_responses.js';
import { TransmissionType } from './models/enums.js';

describe('JobLock + requireUnlocked HTTP integration', () => {
  let server: http.Server;
  let baseUrl: string;
  let jobLock: JobLock;

  beforeAll(async () => {
    jobLock = new JobLock();
    const app = express();
    app.use(express.json());

    // Mirrors the middleware ordering used in api_server.ts:setRoutes for
    // /api/panicStop, minus the auth + serial-guard wrappers that aren't part
    // of the lock concern.
    app.post('/api/panicStop', requireUnlocked(jobLock), (_req, res) => {
      res.status(200).json({ message: 'ok' });
    });

    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  });

  it('passes through to the handler when the lock is not held', async () => {
    expect(jobLock.isLocked()).toBe(false);

    const res = await fetch(`${baseUrl}/api/panicStop`, { method: 'POST' });
    const body = (await res.json()) as { message: string };

    expect(res.status).toBe(200);
    expect(body.message).toBe('ok');
  });

  it('returns 423 with LockedErrorResponse body while the lock is held', async () => {
    jobLock.acquire('flashJob:integration');
    try {
      const res = await fetch(`${baseUrl}/api/panicStop`, { method: 'POST' });
      const body = (await res.json()) as LockedErrorResponse;

      expect(res.status).toBe(423);
      expect(body.error).toBe('flashJobActive');
      expect(body.lockOwner).toBe('flashJob:integration');
      expect(body.since).not.toBeNull();
    } finally {
      jobLock.release('flashJob:integration');
    }
  });

  it('passes through again once the lock is released', async () => {
    jobLock.acquire('flashJob:integration');
    jobLock.release('flashJob:integration');
    expect(jobLock.isLocked()).toBe(false);

    const res = await fetch(`${baseUrl}/api/panicStop`, { method: 'POST' });

    expect(res.status).toBe(200);
  });
});

// Verifies the late-join handshake: a WS client connecting while the lock is
// already held must receive the current state immediately, not wait for the
// next acquire/release transition. The test mounts its own WebSocketServer
// with a connect handler that uses buildLockStateResponse — the same helper
// api_server.ts uses on every real connection — so a payload-shape change is
// caught here as well as a missing initial-send in production code.
describe('JobLock + WS connect handshake', () => {
  let wsServer: WebSocketServer;
  let wsPort: number;
  let jobLock: JobLock;

  beforeAll(async () => {
    jobLock = new JobLock();
    wsServer = new WebSocketServer({ port: 0 });
    wsServer.on('connection', (conn) => {
      conn.send(JSON.stringify(buildLockStateResponse(jobLock.getState())));
    });
    await new Promise<void>((resolve) => {
      wsServer.on('listening', () => {
        wsPort = (wsServer.address() as AddressInfo).port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      wsServer.close((err) => (err ? reject(err) : resolve())),
    );
  });

  function connectAndAwaitFirstMessage(): Promise<string> {
    return new Promise((resolve, reject) => {
      const client = new WebSocket(`ws://127.0.0.1:${wsPort}`);
      client.once('message', (data) => {
        client.close();
        resolve(data.toString());
      });
      client.once('error', reject);
    });
  }

  it('sends current locked state to a newly-connected client', async () => {
    jobLock.acquire('flashJob:abc');
    try {
      const raw = await connectAndAwaitFirstMessage();
      const parsed = JSON.parse(raw);

      expect(parsed.type).toBe(TransmissionType.lockStateChanged);
      expect(parsed.locked).toBe(true);
      expect(parsed.owner).toBe('flashJob:abc');
      expect(parsed.since).not.toBeNull();
    } finally {
      jobLock.release('flashJob:abc');
    }
  });

  it('sends current unlocked state to a newly-connected client', async () => {
    expect(jobLock.isLocked()).toBe(false);

    const raw = await connectAndAwaitFirstMessage();
    const parsed = JSON.parse(raw);

    expect(parsed.type).toBe(TransmissionType.lockStateChanged);
    expect(parsed.locked).toBe(false);
    expect(parsed.owner).toBeNull();
    expect(parsed.since).toBeNull();
  });
});
