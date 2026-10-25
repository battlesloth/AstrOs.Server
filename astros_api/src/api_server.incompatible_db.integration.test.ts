// Pins the incompatible-database boot end to end. database.integration.test.ts
// covers initializeDatabase alone; only a real ApiServer boot shows that the
// rest of Init() and shutdown() also leave a newer server's database file
// byte-identical, start no serial services, and drop WS client messages.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import SQLite from 'better-sqlite3';
import jsonwebtoken from 'jsonwebtoken';
import { WebSocket } from 'ws';
import { ApiServer } from './api_server.js';
import { closeDatabaseForTest, initializeDatabase } from './dal/database.js';
import { JobLock } from './job_lock/job_lock.js';
import { logger } from './logger.js';
import { TransmissionType } from './models/index.js';
import { SystemStatus } from './system_status.js';

const JWT_KEY = 'integration-test-key';
const WS_DROP_LINE =
  'Dropping websocket messages: database version is newer than this server supports';

function sha256(file: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

describe('ApiServer on a database written by a newer server', { timeout: 15_000 }, () => {
  let tmpDir: string;
  let dbPath: string;
  let server: ApiServer | undefined;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astros-incompatible-db-'));
    dbPath = path.join(tmpDir, 'database.sqlite3');
    server = undefined;

    await initializeDatabase(new SystemStatus(), { dbPath });
    await closeDatabaseForTest();
    const sqlite = new SQLite(dbPath);
    sqlite
      .prepare('INSERT INTO kysely_migration (name, timestamp) VALUES (?, ?)')
      .run('99_future', '2026-10-22T00:00:00.000Z');
    sqlite.close();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (server) {
      await server.shutdown();
    }
    // Backstop: a boot that throws after initializeDatabase leaves no server
    // to shut down but still holds the module-level DB handle.
    await closeDatabaseForTest();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function boot(): Promise<ApiServer> {
    return ApiServer.bootstrap({
      configOverrides: {
        apiPort: 0,
        websocketPort: 0,
        jwtKey: JWT_KEY,
        databasePath: dbPath,
        // Serial setup is requested; only the incompatible database may skip
        // it. The port path does not exist, so a regression cannot open a
        // real tty on the dev machine.
        skipSerialSetup: false,
        serialPort: path.join(tmpDir, 'no-such-tty'),
      },
    });
  }

  it('skips serial setup with a single log line', async () => {
    const warn = vi.spyOn(logger, 'warn');
    const info = vi.spyOn(logger, 'info');

    server = await boot();

    const skipLines = warn.mock.calls.filter(
      ([msg]) =>
        msg === 'Skipping serial port setup: database version is newer than this server supports',
    );
    expect(skipLines).toHaveLength(1);
    expect(info).not.toHaveBeenCalledWith('Starting up serial port services');
    // src/background_tasks/serial_worker.js exists, so a regression would
    // really start a Worker.
    expect((server as unknown as { serialWorker?: unknown }).serialWorker).toBeUndefined();
  });

  it('answers GET /api/system/status, 503s other routes, and sends the code on WS connect', async () => {
    server = await boot();
    const base = `http://127.0.0.1:${server.getBoundApiPort()}/api`;

    // req.path excludes the query string, so a cache-buster still passes.
    for (const route of ['/system/status', '/system/status?t=1']) {
      const statusRes = await fetch(`${base}${route}`);
      expect(statusRes.status).toBe(200);
      expect(await statusRes.json()).toMatchObject({
        readOnly: true,
        reasonCode: 'DB_NEWER_THAN_SERVER',
      });
    }

    for (const [method, route] of [
      ['GET', '/scripts'],
      ['POST', '/login'],
    ]) {
      const res = await fetch(`${base}${route}`, { method });
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({
        message: 'Database version is newer than this server supports',
        reasonCode: 'DB_NEWER_THAN_SERVER',
      });
    }

    const client = new WebSocket(`ws://127.0.0.1:${server.getBoundWebsocketPort()}`);
    try {
      const first = await new Promise<string>((resolve, reject) => {
        client.once('message', (data) => resolve(data.toString()));
        client.once('error', reject);
      });
      const frame = JSON.parse(first);
      expect(frame.type).toBe(TransmissionType.systemStatus);
      expect(frame.data).toMatchObject({ readOnly: true, reasonCode: 'DB_NEWER_THAN_SERVER' });
    } finally {
      client.close();
    }
  });

  it('drops WS client messages without answering, warning once per connection', async () => {
    server = await boot();
    // Held lock: a SERVO_TEST that is NOT dropped gets two lock frames back.
    const jobLock = (server as unknown as { jobLock: JobLock }).jobLock;
    jobLock.acquire('test');
    const warn = vi.spyOn(logger, 'warn');
    const conn = { send: vi.fn() };
    const servoTest = JSON.stringify({ msgType: 'SERVO_TEST', data: {} });

    try {
      server.handleWebsocketMessage(servoTest, conn as unknown as WebSocket);
      server.handleWebsocketMessage(servoTest, conn as unknown as WebSocket);
    } finally {
      jobLock.release('test');
    }

    expect(conn.send).not.toHaveBeenCalled();
    const dropLines = warn.mock.calls.filter(([msg]) => msg === WS_DROP_LINE);
    expect(dropLines).toHaveLength(1);
  });

  it('routes a real WS client frame into the drop', async () => {
    server = await boot();
    const warn = vi.spyOn(logger, 'warn');
    const client = new WebSocket(`ws://127.0.0.1:${server.getBoundWebsocketPort()}`);
    try {
      await new Promise<void>((resolve, reject) => {
        client.once('open', () => resolve());
        client.once('error', reject);
      });
      client.send(JSON.stringify({ msgType: 'SERVO_TEST', data: {} }));

      await vi.waitFor(() => expect(warn).toHaveBeenCalledWith(WS_DROP_LINE));
    } finally {
      client.close();
    }
  });

  it('leaves the database file byte-identical through boot, a refused write, and shutdown', async () => {
    const hashBefore = sha256(dbPath);
    const filesBefore = fs.readdirSync(tmpDir).sort();

    server = await boot();
    // An authenticated write that changes the admin row if it gets through.
    const token = jsonwebtoken.sign(
      { name: 'integration-test', exp: Math.floor(Date.now() / 1000) + 3600 },
      JWT_KEY,
    );
    const res = await fetch(`http://127.0.0.1:${server.getBoundApiPort()}/api/changePassword`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPassword: 'password', newPassword: 'a-new-password' }),
    });
    expect(res.status).toBe(503);
    await res.json();

    await server.shutdown();
    server = undefined;

    expect(sha256(dbPath)).toBe(hashBefore);
    expect(fs.readdirSync(tmpDir).sort()).toEqual(filesBefore);
  });
});
