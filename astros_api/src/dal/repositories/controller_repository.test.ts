import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import SQLite from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import { Database } from '../types.js';
import { migrateToLatest } from '../database.js';
import { ControllerRepository } from './controller_repository.js';

describe('ControllerRepository', () => {
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

  describe('insertController', () => {
    it('should insert a controller and return its id', async () => {
      const repo = new ControllerRepository(db);

      const controller = { id: '', name: 'dome', address: 'AA:BB:CC:DD:EE:01' };
      const id = await repo.insertController(controller);

      expect(id).toBeTruthy();
      expect(id).not.toBe('');

      const result = await repo.getControllerById(id);
      expect(result.name).toBe('dome');
      expect(result.address).toBe('AA:BB:CC:DD:EE:01');
    });
  });

  describe('getControllers', () => {
    it('should return all controllers including seed data', async () => {
      const repo = new ControllerRepository(db);

      // Migration seeds a 'master' controller
      const before = await repo.getControllers();
      const seedCount = before.length;

      await repo.insertController({ id: '', name: 'dome', address: 'AA:BB:CC:DD:EE:01' });
      await repo.insertController({ id: '', name: 'body', address: 'AA:BB:CC:DD:EE:02' });

      const controllers = await repo.getControllers();

      expect(controllers).toHaveLength(seedCount + 2);
      expect(controllers.map((c) => c.name)).toContain('dome');
      expect(controllers.map((c) => c.name)).toContain('body');
    });
  });

  describe('getControllerByAddress', () => {
    it('should find controller by MAC address', async () => {
      const repo = new ControllerRepository(db);

      await repo.insertController({ id: '', name: 'dome', address: 'AA:BB:CC:DD:EE:01' });

      const result = await repo.getControllerByAddress('AA:BB:CC:DD:EE:01');
      expect(result.name).toBe('dome');
    });

    it('should throw when address not found', async () => {
      const repo = new ControllerRepository(db);

      await expect(repo.getControllerByAddress('FF:FF:FF:FF:FF:FF')).rejects.toThrow();
    });
  });

  describe('updateController', () => {
    it('should update controller name and address', async () => {
      const repo = new ControllerRepository(db);

      const id = await repo.insertController({
        id: '',
        name: 'dome',
        address: 'AA:BB:CC:DD:EE:01',
      });

      const updated = await repo.updateController({
        id,
        name: 'dome-v2',
        address: 'AA:BB:CC:DD:EE:FF',
      });
      expect(updated).toBe(true);

      const result = await repo.getControllerById(id);
      expect(result.name).toBe('dome-v2');
      expect(result.address).toBe('AA:BB:CC:DD:EE:FF');
    });
  });

  describe('insertControllers (bulk with deduplication)', () => {
    it('should insert new controllers', async () => {
      const repo = new ControllerRepository(db);

      const before = await repo.getControllers();
      const seedCount = before.length;

      const controllers = [
        { id: '', name: 'dome', address: 'AA:BB:CC:DD:EE:01' },
        { id: '', name: 'body', address: 'AA:BB:CC:DD:EE:02' },
      ];

      const result = await repo.insertControllers(controllers);
      expect(result).toBe(true);

      const all = await repo.getControllers();
      expect(all).toHaveLength(seedCount + 2);
    });

    it('should preserve ID when re-inserting with same address', async () => {
      const repo = new ControllerRepository(db);

      // Insert initial controller
      const originalId = await repo.insertController({
        id: '',
        name: 'dome',
        address: 'AA:BB:CC:DD:EE:01',
      });

      // Bulk insert with same address but different name (simulating re-registration)
      await repo.insertControllers([
        { id: '', name: 'dome-renamed', address: 'AA:BB:CC:DD:EE:01' },
      ]);

      const result = await repo.getControllerByAddress('AA:BB:CC:DD:EE:01');
      expect(result.id).toBe(originalId);
      expect(result.name).toBe('dome-renamed');
    });

    it('should preserve ID when re-inserting with same name', async () => {
      const repo = new ControllerRepository(db);

      const originalId = await repo.insertController({
        id: '',
        name: 'dome',
        address: 'AA:BB:CC:DD:EE:01',
      });

      // Bulk insert with same name but different address (controller got new MAC)
      await repo.insertControllers([{ id: '', name: 'dome', address: 'FF:FF:FF:FF:FF:FF' }]);

      const result = await repo.getControllerByAddress('FF:FF:FF:FF:FF:FF');
      expect(result.id).toBe(originalId);
      expect(result.name).toBe('dome');
    });

    it('should remove stale controllers when address or name conflicts', async () => {
      const repo = new ControllerRepository(db);

      const before = await repo.getControllers();
      const seedCount = before.length;

      await repo.insertController({ id: '', name: 'dome', address: 'AA:BB:CC:DD:EE:01' });
      await repo.insertController({ id: '', name: 'body', address: 'AA:BB:CC:DD:EE:02' });

      // Insert new controller that takes dome's address — should replace dome
      await repo.insertControllers([{ id: '', name: 'new-dome', address: 'AA:BB:CC:DD:EE:01' }]);

      const all = await repo.getControllers();
      expect(all).toHaveLength(seedCount + 2);
      expect(all.map((c) => c.name)).toContain('new-dome');
      expect(all.map((c) => c.name)).toContain('body');
      expect(all.map((c) => c.name)).not.toContain('dome');
    });
  });

  describe('getControllerByLocationId', () => {
    it('should find controller via location join', async () => {
      const repo = new ControllerRepository(db);

      const controllerId = await repo.insertController({
        id: '',
        name: 'dome',
        address: 'AA:BB:CC:DD:EE:01',
      });

      // Seed location and controller_locations relationship
      await db
        .insertInto('locations')
        .values({ id: 'loc-1', name: 'Dome Location', description: '', config_fingerprint: '' })
        .execute();

      await db
        .insertInto('controller_locations')
        .values({ location_id: 'loc-1', controller_id: controllerId })
        .execute();

      const result = await repo.getControllerByLocationId('loc-1');
      expect(result.name).toBe('dome');
      expect(result.id).toBe(controllerId);
    });

    it('should throw when location has no controller', async () => {
      const repo = new ControllerRepository(db);

      await expect(repo.getControllerByLocationId('nonexistent')).rejects.toThrow();
    });
  });
});
