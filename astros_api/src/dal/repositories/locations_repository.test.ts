import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import SQLite from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import { Database } from '../types.js';
import { migrateToLatest } from '../database.js';
import { LocationsRepository } from './locations_repository.js';
import { ControllerRepository } from './controller_repository.js';
import { ControlModule } from '../../models/control_module/control_module.js';
import { ControllerLocation } from '../../models/control_module/controller_location.js';
import { UartModule } from '../../models/control_module/uart/uart_module.js';
import { I2cModule } from '../../models/control_module/i2c/i2c_module.js';
import { ModuleSubType } from '../../models/enums.js';
import { v4 as uuid } from 'uuid';

describe('LocationsRepository', () => {
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

  // ── getLocations ─────────────────────────────────────────────

  describe('getLocations', () => {
    it('should return seed locations with controller data', async () => {
      const repo = new LocationsRepository(db);

      const locations = await repo.getLocations();

      // Migration seeds 3 locations: body, core, dome
      expect(locations).toHaveLength(3);

      const names = locations.map((l) => l.locationName);
      expect(names).toContain('body');
      expect(names).toContain('core');
      expect(names).toContain('dome');

      // Body has the master controller mapped
      const body = locations.find((l) => l.locationName === 'body')!;
      expect(body.controller.name).toBe('master');
      expect(body.controller.address).toBe('00:00:00:00:00:00');

      // Core and dome have no controller mapped — should get defaults
      const core = locations.find((l) => l.locationName === 'core')!;
      expect(core.controller.id).toBe('0');
      expect(core.controller.name).toBe('');
    });
  });

  // ── getLocationByController ──────────────────────────────────

  describe('getLocationByController', () => {
    it('should return location for a given controller', async () => {
      const repo = new LocationsRepository(db);
      const ctlRepo = new ControllerRepository(db);

      // Get the master controller that's mapped to body
      const controllers = await ctlRepo.getControllers();
      const master = controllers.find((c) => c.name === 'master')!;

      const location = await repo.getLocationByController(master.id);

      expect(location.locationName).toBe('body');
      expect(location.controller.name).toBe('master');
    });

    it('should throw when controller not found', async () => {
      const repo = new LocationsRepository(db);

      await expect(repo.getLocationByController('nonexistent')).rejects.toThrow();
    });
  });

  // ── MAC address lookups ──────────────────────────────────────

  describe('MAC address lookups', () => {
    it('should get location ID by controller MAC', async () => {
      const repo = new LocationsRepository(db);

      // Master controller (00:00:00:00:00:00) is mapped to body
      const locationId = await repo.getLocationIdByControllerByMac('00:00:00:00:00:00');

      // Verify it's the body location
      const locations = await repo.getLocations();
      const body = locations.find((l) => l.locationName === 'body')!;
      expect(locationId).toBe(body.id);
    });

    it('should get location name by controller MAC', async () => {
      const repo = new LocationsRepository(db);

      const name = await repo.getLocationNameByMac('00:00:00:00:00:00');

      expect(name).toBe('body');
    });

    it('should throw for unknown MAC address', async () => {
      const repo = new LocationsRepository(db);

      await expect(repo.getLocationIdByControllerByMac('FF:FF:FF:FF:FF:FF')).rejects.toThrow();
      await expect(repo.getLocationNameByMac('FF:FF:FF:FF:FF:FF')).rejects.toThrow();
    });
  });

  // ── loadLocations / loadLocationConfiguration ────────────────

  describe('loadLocations', () => {
    it('should load locations with GPIO modules from seed data', async () => {
      const repo = new LocationsRepository(db);

      const locations = await repo.loadLocations();

      expect(locations).toHaveLength(3);

      // Each location should have 10 GPIO channels from seed
      for (const loc of locations) {
        expect(loc.gpioModule).toBeDefined();
        const enabledChannels = loc.gpioModule.channels.filter((ch) => ch !== undefined);
        expect(enabledChannels.length).toBe(10);
      }

      // No UART or I2C modules seeded
      for (const loc of locations) {
        expect(loc.uartModules).toHaveLength(0);
        expect(loc.i2cModules).toHaveLength(0);
      }
    });
  });

  // ── updateLocation ───────────────────────────────────────────

  describe('updateLocation', () => {
    it('should mark fingerprint as outofdate', async () => {
      const repo = new LocationsRepository(db);

      const locations = await repo.getLocations();
      const body = locations.find((l) => l.locationName === 'body')!;

      // Set a fingerprint first
      await repo.updateLocationFingerprint(body.id, 'abc123');

      // Load full location for update
      const fullBody = (await repo.loadLocations()).find((l) => l.locationName === 'body')!;

      await repo.updateLocation(fullBody);

      // Fingerprint should be 'outofdate' after update
      const updated = (await repo.getLocations()).find((l) => l.locationName === 'body')!;
      expect(updated.configFingerprint).toBe('outofdate');
    });

    it('should swap the controller for a location', async () => {
      const repo = new LocationsRepository(db);
      const ctlRepo = new ControllerRepository(db);

      // Insert a new controller
      const newCtlId = await ctlRepo.insertController(
        new ControlModule('', 'dome-ctl', 'AA:BB:CC:DD:EE:01'),
      );

      // Get the core location (currently has no controller)
      const locations = await repo.loadLocations();
      const core = locations.find((l) => l.locationName === 'core')!;

      // Assign the new controller
      core.controller = new ControlModule(newCtlId, 'dome-ctl', 'AA:BB:CC:DD:EE:01');
      await repo.updateLocation(core);

      // Verify the controller is now mapped
      const updatedLocations = await repo.getLocations();
      const updatedCore = updatedLocations.find((l) => l.locationName === 'core')!;
      expect(updatedCore.controller.name).toBe('dome-ctl');
      expect(updatedCore.controller.id).toBe(newCtlId);
    });

    it('should upsert I2C modules', async () => {
      const repo = new LocationsRepository(db);

      const locations = await repo.loadLocations();
      const body = locations.find((l) => l.locationName === 'body')!;

      const moduleId = uuid();
      const i2cModule = new I2cModule(1, moduleId, 'PCA9685', body.id, 0x40, ModuleSubType.genericI2C);
      body.i2cModules = [i2cModule];

      await repo.updateLocation(body);

      // Reload and verify
      const updated = (await repo.loadLocations()).find((l) => l.locationName === 'body')!;
      expect(updated.i2cModules).toHaveLength(1);
      expect(updated.i2cModules[0].name).toBe('PCA9685');
      expect(updated.i2cModules[0].i2cAddress).toBe(0x40);
    });

    it('should remove stale I2C modules', async () => {
      const repo = new LocationsRepository(db);

      const locations = await repo.loadLocations();
      const body = locations.find((l) => l.locationName === 'body')!;

      // Add two modules
      const mod1Id = uuid();
      const mod2Id = uuid();
      body.i2cModules = [
        new I2cModule(1, mod1Id, 'Module1', body.id, 0x40, ModuleSubType.genericI2C),
        new I2cModule(2, mod2Id, 'Module2', body.id, 0x41, ModuleSubType.genericI2C),
      ];
      await repo.updateLocation(body);

      // Now update with only mod1 — mod2 should be removed
      const reloaded = (await repo.loadLocations()).find((l) => l.locationName === 'body')!;
      reloaded.i2cModules = reloaded.i2cModules.filter((m) => m.id === mod1Id);
      await repo.updateLocation(reloaded);

      const final = (await repo.loadLocations()).find((l) => l.locationName === 'body')!;
      expect(final.i2cModules).toHaveLength(1);
      expect(final.i2cModules[0].id).toBe(mod1Id);
    });

    it('should upsert UART modules', async () => {
      const repo = new LocationsRepository(db);

      const locations = await repo.loadLocations();
      const body = locations.find((l) => l.locationName === 'body')!;

      const moduleId = uuid();
      const uartModule = new UartModule(
        1,
        moduleId,
        'HCR Serial',
        body.id,
        ModuleSubType.humanCyborgRelationsSerial,
        0,
        9600,
      );
      body.uartModules = [uartModule];

      await repo.updateLocation(body);

      const updated = (await repo.loadLocations()).find((l) => l.locationName === 'body')!;
      expect(updated.uartModules).toHaveLength(1);
      expect(updated.uartModules[0].name).toBe('HCR Serial');
      expect(updated.uartModules[0].baudRate).toBe(9600);
    });
  });

  // ── updateLocationFingerprint ────────────────────────────────

  describe('updateLocationFingerprint', () => {
    it('should update the fingerprint', async () => {
      const repo = new LocationsRepository(db);

      const locations = await repo.getLocations();
      const body = locations.find((l) => l.locationName === 'body')!;

      const result = await repo.updateLocationFingerprint(body.id, 'new-fingerprint');
      expect(result).toBe(true);

      const updated = (await repo.getLocations()).find((l) => l.locationName === 'body')!;
      expect(updated.configFingerprint).toBe('new-fingerprint');
    });

    it('should return false for nonexistent location', async () => {
      const repo = new LocationsRepository(db);

      const result = await repo.updateLocationFingerprint('nonexistent', 'fp');
      expect(result).toBe(false);
    });
  });
});
