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
import { WebSocket } from 'ws';
import { ApiServer } from './api_server.js';
import { closeDatabaseForTest, initializeDatabase } from './dal/database.js';
import { logger } from './logger.js';
import { SystemStatus } from './system_status.js';

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
        jwtKey: 'integration-test-key',
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
      ([msg]) => msg === 'Skipping serial port setup: database is from a newer server version',
    );
    expect(skipLines).toHaveLength(1);
    expect(info).not.toHaveBeenCalledWith('Starting up serial port services');
  });

  it('answers only GET /api/system/status and pushes the reason code over WS', async () => {
    server = await boot();
    const base = `http://127.0.0.1:${server.getBoundApiPort()}/api`;

    const statusRes = await fetch(`${base}/system/status`);
    expect(statusRes.status).toBe(200);
    expect(await statusRes.json()).toMatchObject({
      readOnly: true,
      reasonCode: 'DB_NEWER_THAN_SERVER',
    });

    for (const [method, route] of [
      ['GET', '/scripts'],
      ['POST', '/login'],
    ]) {
      const res = await fetch(`${base}${route}`, { method });
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({
        message: 'Database is from a newer server version',
        reasonCode: 'DB_NEWER_THAN_SERVER',
      });
    }

    const client = new WebSocket(`ws://127.0.0.1:${server.getBoundWebsocketPort()}`);
    try {
      const first = await new Promise<string>((resolve, reject) => {
        client.once('message', (data) => resolve(data.toString()));
        client.once('error', reject);
      });
      expect(JSON.parse(first).data).toMatchObject({
        readOnly: true,
        reasonCode: 'DB_NEWER_THAN_SERVER',
      });
    } finally {
      client.close();
    }
  });

  it('drops WS client messages without answering', async () => {
    server = await boot();
    const warn = vi.spyOn(logger, 'warn');
    const conn = { send: vi.fn() };

    server.handleWebsocketMessage(
      JSON.stringify({ msgType: 'SERVO_TEST', data: {} }),
      conn as unknown as WebSocket,
    );

    expect(warn).toHaveBeenCalledWith(
      'Dropping websocket message: database is from a newer server version',
    );
    // Reaching the SERVO_TEST handler would log this (no serial worker).
    expect(warn).not.toHaveBeenCalledWith(
      'Serial services unavailable; serial port setup was skipped or failed',
    );
    expect(conn.send).not.toHaveBeenCalled();
  });

  it('leaves the database file byte-identical through boot and shutdown', async () => {
    const hashBefore = sha256(dbPath);
    const filesBefore = fs.readdirSync(tmpDir).sort();

    server = await boot();
    await server.shutdown();
    server = undefined;

    expect(sha256(dbPath)).toBe(hashBefore);
    expect(fs.readdirSync(tmpDir).sort()).toEqual(filesBefore);
  });
});
