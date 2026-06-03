import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import { Kysely } from 'kysely';
import { Database } from '../dal/types.js';
import { createKyselyConnection, migrateToLatest } from '../dal/database.js';
import { RemoteConfigRepository } from '../dal/repositories/remote_config_repository.js';
import { syncRemoteConfig, getRemoteConfig } from './remote_config_controller.js';
import { RemotePage, PageButton } from '../models/remotes/RemotePage.js';
// Import via the same specifier the controller uses ('src/logger.js'), not the
// relative '../logger.js'. vitest dedupes modules by resolved specifier, so a
// mismatch would spy on a different logger instance than the controller calls.
import { logger } from 'src/logger.js';

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

  it('returns { pages: [] } for a stored "{}" object value', async () => {
    // Existing installs (and the pre-fix migration_0 seed) hold value '{}' — an
    // object, not an array. Before the Array.isArray guard, JSON.parse('{}')
    // flowed past the `length === 0` check and val.forEach threw a TypeError →
    // 500. Save '{}' explicitly so this pins the guard regardless of the seed.
    const repo = new RemoteConfigRepository(db);
    await repo.saveConfig('remoteConfig', '{}');

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

  it('returns { pages: [] } when the stored value is the "[]" empty-array shape', async () => {
    // The fresh-install seed (post-fix) and operators who clear the config both
    // produce '[]'. JSON.parse('[]') is an empty array, so the length === 0
    // short-circuit fires correctly.
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

describe('remote_config_controller / getRemoteConfig', () => {
  let db: Kysely<Database>;
  // Spy on the corruption breadcrumb so tests can assert it fires only on a
  // genuine parse failure (never on the benign non-array seed), and so the
  // real pino warn doesn't emit through the transport during the run.
  let warnSpy: MockInstance;

  beforeEach(async () => {
    db = createKyselyConnection().db;
    await migrateToLatest(db);
    warnSpy = vi.spyOn(logger, 'warn').mockImplementation((() => undefined) as never);
  });

  afterEach(async () => {
    warnSpy.mockRestore();
    await db.destroy();
  });

  it('normalizes a stored "{}" object value to an empty-array string', async () => {
    // Existing installs (and the pre-fix migration_0 seed) hold value '{}' — an
    // object. The editor store JSON.parses the response and hard-fails unless it
    // is an array, so the GET must hand back '[]', never the raw object. This is
    // the bug that took the whole /remote editor down to the load-error banner.
    // Save '{}' explicitly so this pins the guard regardless of the seed.
    const repo = new RemoteConfigRepository(db);
    await repo.saveConfig('remoteConfig', '{}');

    const req: any = {};
    const res = mockRes();

    await getRemoteConfig(db, req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith('[]');
    // The real contract the store enforces: the response must JSON.parse to an
    // array, not merely equal a particular string.
    expect(Array.isArray(JSON.parse(res.json.mock.calls[0][0]))).toBe(true);
    // A parsed-but-non-array value is a known-benign state — no corruption log.
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('returns "[]" for the fresh-install seed', async () => {
    // Post-fix, migration_0 seeds '[]' directly, so the untouched seed flows
    // through as a valid empty-array string with no normalization needed.
    const req: any = {};
    const res = mockRes();

    await getRemoteConfig(db, req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith('[]');
  });

  it('returns a saved array-config string unchanged', async () => {
    // The happy path: a real saved config (always JSON.stringify(array)) must
    // pass through verbatim so the store gets the user's actual pages.
    const repo = new RemoteConfigRepository(db);
    const page = new RemotePage('page-uuid', 'Quick Actions');
    page.button1 = new PageButton('script-1', 'Beep');
    const stored = JSON.stringify([page]);
    await repo.saveConfig('remoteConfig', stored);

    const req: any = {};
    const res = mockRes();

    await getRemoteConfig(db, req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(stored);
    // Pin the real contract: a saved config round-trips as a parseable array.
    expect(Array.isArray(JSON.parse(res.json.mock.calls[0][0]))).toBe(true);
  });

  it('falls back to "[]" when no remote_config row exists', async () => {
    // Pins the empty-row path. The prior `|| { value: '[]' }` fallback sent an
    // OBJECT, which the store's JSON.parse(response) cannot handle (it would
    // stringify-coerce to "[object Object]" and throw).
    await db.deleteFrom('remote_config').execute();

    const req: any = {};
    const res = mockRes();

    await getRemoteConfig(db, req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith('[]');
  });

  it('falls back to "[]" and logs a breadcrumb when the stored value is not valid JSON', async () => {
    // A non-JSON value is unreachable by any legitimate write, so it signals
    // real corruption — the GET must still serve '[]' (so the editor opens) AND
    // leave a server-side breadcrumb, since the user's first Save would
    // otherwise overwrite the bad row and erase the evidence.
    const repo = new RemoteConfigRepository(db);
    await repo.saveConfig('remoteConfig', 'not-json{');

    const req: any = {};
    const res = mockRes();

    await getRemoteConfig(db, req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith('[]');
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('falls back to "[]" when the stored value parses to a non-array object', async () => {
    // Belt-and-suspenders for any legacy object-shaped value beyond the seed.
    const repo = new RemoteConfigRepository(db);
    await repo.saveConfig('remoteConfig', '{"foo":"bar"}');

    const req: any = {};
    const res = mockRes();

    await getRemoteConfig(db, req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith('[]');
  });
});
