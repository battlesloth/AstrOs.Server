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
import { JobLock } from './job_lock.js';
import { requireUnlocked } from './job_lock_middleware.js';
import type { LockedErrorResponse } from './models/networking/lock_responses.js';

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
