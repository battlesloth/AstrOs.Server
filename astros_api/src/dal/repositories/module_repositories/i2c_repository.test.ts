import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import SQLite from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import { Database } from '../../types.js';
import { migrateToLatest } from '../../database.js';
import { AstrOsConstants, I2cModule, ModuleSubType } from 'astros-common';
import { getI2cModules, upsertI2cModules } from './i2c_repository.js';
import { v4 as uuid } from 'uuid';

describe('I2cRepository', () => {
  let db: Kysely<Database>;
  const location = AstrOsConstants.BODY;

  beforeEach(async () => {
    const dialect = new SqliteDialect({
      database: new SQLite(':memory:'),
    });

    db = new Kysely<Database>({
      dialect,
    });

    await migrateToLatest(db);
  });

  afterEach(async () => {
    await db.destroy();
  });

  it('should get no modules from new database', async () => {
    const locationId = await db
      .selectFrom('locations')
      .select(['id'])
      .where('name', '=', location)
      .executeTakeFirstOrThrow();

    const module = await getI2cModules(db, locationId.id);

    expect(module).toBeDefined();

    expect(module.length).toBe(0);
  });

  it('should save and get a module', async () => {
    const locationId = await db
      .selectFrom('locations')
      .select(['id'])
      .where('name', '=', location)
      .executeTakeFirstOrThrow();

    const modId = uuid();

    const module = new I2cModule(
      0,
      modId,
      'I2C Module',
      locationId.id,
      42,
      ModuleSubType.genericI2C,
    );

    const modules = [module];

    await db.transaction().execute(async (trx) => {
      await upsertI2cModules(trx, modules);
    });

    const savedModules = await getI2cModules(db, locationId.id);

    expect(savedModules).toBeDefined();
    expect(savedModules.length).toBe(1);
    expect(savedModules[0].id).toBe(modId);
    expect(savedModules[0].locationId).toBe(locationId.id);
    expect(savedModules[0].i2cAddress).toBe(42);
    expect(savedModules[0].moduleSubType).toBe(ModuleSubType.genericI2C);
  });

  it('should update a module', async () => {
    const locationId = await db
      .selectFrom('locations')
      .select(['id'])
      .where('name', '=', location)
      .executeTakeFirstOrThrow();

    const modId = uuid();

    const module = new I2cModule(
      0,
      modId,
      'I2C Module',
      locationId.id,
      42,
      ModuleSubType.genericI2C,
    );

    const modules = [module];

    await db.transaction().execute(async (trx) => {
      await upsertI2cModules(trx, modules);
    });

    const savedModules = await getI2cModules(db, locationId.id);

    console.log(savedModules);

    expect(savedModules).toBeDefined();
    expect(savedModules.length).toBe(1);
    expect(savedModules[0].id).toBe(modId);
    expect(savedModules[0].name).toBe('I2C Module');
    expect(savedModules[0].locationId).toBe(locationId.id);
    expect(savedModules[0].i2cAddress).toBe(42);
    expect(savedModules[0].moduleSubType).toBe(ModuleSubType.genericI2C);

    savedModules[0].name = 'Updated I2C Module';
    savedModules[0].i2cAddress = 43;

    await db.transaction().execute(async (trx) => {
      await upsertI2cModules(trx, savedModules);
    });

    const updatedModules = await getI2cModules(db, locationId.id);

    expect(updatedModules).toBeDefined();
    expect(updatedModules.length).toBe(1);
    expect(updatedModules[0].id).toBe(modId);
    expect(updatedModules[0].locationId).toBe(locationId.id);
    expect(updatedModules[0].name).toBe('Updated I2C Module');
    expect(updatedModules[0].i2cAddress).toBe(43);
    expect(updatedModules[0].moduleSubType).toBe(ModuleSubType.genericI2C);
  });
});
