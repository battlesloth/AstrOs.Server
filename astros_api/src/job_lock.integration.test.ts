// Verifies the WS late-join handshake: a client connecting while the lock is
// already held must receive the current state immediately, not wait for the
// next acquire/release transition. The test mounts its own WebSocketServer
// with a connect handler that uses buildLockStateResponse — the same helper
// api_server.ts uses on every real connection — so a payload-shape change is
// caught here as well as a missing initial-send in production code.
//
// HTTP-side write-class gating is handled by writeGuard (see write_guard.test.ts);
// no per-route middleware is exercised here.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { AddressInfo } from 'net';
import { WebSocketServer, WebSocket } from 'ws';
import { JobLock } from './job_lock.js';
import { buildLockStateResponse } from './models/networking/lock_responses.js';
import { TransmissionType } from './models/enums.js';

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
