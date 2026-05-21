import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Kysely } from 'kysely';
import { Database } from '../dal/types.js';
import { createKyselyConnection, migrateToLatest } from '../dal/database.js';
import { RemoteConfigRepository } from '../dal/repositories/remote_config_repository.js';
import { syncRemoteConfig } from './remote_config_controller.js';
import { RemotePage, PageButton } from '../models/remotes/RemotePage.js';

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('remote_config_controller / syncRemoteConfig', () => {
  let db: Kysely<Database>;

  beforeEach(async () => {
    db = createKyselyConnection().db;
    await migrateToLatest(db);
  });

  afterEach(async () => {
    await db.destroy();
  });

  it('returns { pages: [] } for the fresh-install seed shape "{}"', async () => {
    // migration_0 seeds remote_config with value '{}' (an object, not an
    // array). Before the Array.isArray guard, JSON.parse('{}') flowed past
    // the `length === 0` check and val.forEach threw a TypeError → 500.
    // This pins the defensive guard: the seed shape must not 500.
    const req: any = {};
    const res = mockRes();

    await syncRemoteConfig(db, req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ pages: [] });
  });

  it('emits the M5Stack wire shape { pages: [[{name, command} x9]] } for a saved config', async () => {
    // Pins the wire-contract claim from the Phase 6 plan: the JSON shape on
    // /remotecontrolsync did not change despite the M5* → Remote* type
    // rename. The downstream consumer is the M5Stack firmware (sibling
    // repo); we cannot test it from here, so this is the load-bearing test
    // for the wire-format claim.
    const repo = new RemoteConfigRepository(db);
    const page = new RemotePage('page-uuid', 'Quick Actions');
    page.button1 = new PageButton('script-1', 'Beep');
    page.button5 = new PageButton('playlist-2', 'Songs');
    await repo.saveConfig('remoteConfig', JSON.stringify([page]));

    const req: any = {};
    const res = mockRes();

    await syncRemoteConfig(db, req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledTimes(1);
    const response = res.json.mock.calls[0][0];
    expect(response).toEqual({
      pages: [
        [
          { name: 'Beep', command: 'script-1' },
          { name: 'None', command: '0' },
          { name: 'None', command: '0' },
          { name: 'None', command: '0' },
          { name: 'Songs', command: 'playlist-2' },
          { name: 'None', command: '0' },
          { name: 'None', command: '0' },
          { name: 'None', command: '0' },
          { name: 'None', command: '0' },
        ],
      ],
    });
  });

  it('returns { pages: [] } when the stored value is the legacy "[]" empty-array shape', async () => {
    // Operators who manually clear the config (or saved empty in an earlier
    // version) end up with '[]'. JSON.parse('[]') is an empty array, so the
    // length === 0 short-circuit fires correctly.
    const repo = new RemoteConfigRepository(db);
    await repo.saveConfig('remoteConfig', '[]');

    const req: any = {};
    const res = mockRes();

    await syncRemoteConfig(db, req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ pages: [] });
  });

  it('queries the renamed remoteConfig key, not the legacy astrOsScreen key', async () => {
    // If the controller still queried 'astrOsScreen', a row stored under
    // 'remoteConfig' would never reach syncRemoteConfig and the response
    // would be the empty-pages fallback regardless of saved content.
    const repo = new RemoteConfigRepository(db);
    const page = new RemotePage('page-uuid', 'Test');
    page.button1 = new PageButton('script-xyz', 'Test Script');
    await repo.saveConfig('remoteConfig', JSON.stringify([page]));

    const req: any = {};
    const res = mockRes();

    await syncRemoteConfig(db, req, res, vi.fn());

    const response = res.json.mock.calls[0][0];
    expect(response.pages).toHaveLength(1);
    expect(response.pages[0][0]).toEqual({ name: 'Test Script', command: 'script-xyz' });
  });
});
