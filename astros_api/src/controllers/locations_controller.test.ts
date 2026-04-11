import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import SQLite from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import { Database } from '../dal/types.js';
import { migrateToLatest } from '../dal/database.js';
import { getLocations } from './locations_controller.js';

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('Locations Controller', () => {
  let db: Kysely<Database>;

  beforeEach(async () => {
    db = new Kysely<Database>({
      dialect: new SqliteDialect({ database: new SQLite(':memory:') }),
    });
    await migrateToLatest(db);
  });

  afterEach(async () => {
    await db.destroy();
  });

  describe('getLocations', () => {
    it('should classify seed locations into LocationCollection', async () => {
      const req: any = {};
      const res = mockRes();

      await getLocations(db, req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledTimes(1);

      const response = res.json.mock.calls[0][0];
      expect(response.bodyModule).toBeDefined();
      expect(response.bodyModule.locationName).toBe('body');
      expect(response.coreModule).toBeDefined();
      expect(response.coreModule.locationName).toBe('core');
      expect(response.domeModule).toBeDefined();
      expect(response.domeModule.locationName).toBe('dome');
    });

    it('should include controller data for mapped locations', async () => {
      const req: any = {};
      const res = mockRes();

      await getLocations(db, req, res, vi.fn());

      const response = res.json.mock.calls[0][0];
      // Body has master controller from seed data
      expect(response.bodyModule.controller.name).toBe('master');
      // Core has no controller — defaults
      expect(response.coreModule.controller.name).toBe('');
    });
  });
});
