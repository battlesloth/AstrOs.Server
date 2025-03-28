import { describe, it, expect, beforeEach, afterEach } from "vitest";
import SQLite from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import { Database } from "../../types.js";
import { migrateToLatest } from "../../database.js";
import {
  AstrOsConstants,
  UartModule,
  ModuleSubType,
  ModuleType,
  KangarooX2,
} from "astros-common";
import { getUartModules, upsertUartModules } from "./uart_repository.js";
import { v4 as uuid } from "uuid";

describe("I2cRepository", () => {
  let db: Kysely<Database>;
  const location = AstrOsConstants.BODY;

  beforeEach(async () => {
    const dialect = new SqliteDialect({
      database: new SQLite(":memory:"),
    });

    db = new Kysely<Database>({
      dialect,
    });

    await migrateToLatest(db);
  });

  afterEach(async () => {
    await db.destroy();
  });

  it("should get no modules from new database", async () => {
    const locationId = await db
      .selectFrom("locations")
      .select(["id"])
      .where("name", "=", location)
      .executeTakeFirstOrThrow();

    const module = await getUartModules(db, locationId.id);

    expect(module).toBeDefined();

    expect(module.length).toBe(0);
  });

  it("should save and get a module", async () => {
    const locationId = await db
      .selectFrom("locations")
      .select(["id"])
      .where("name", "=", location)
      .executeTakeFirstOrThrow();

    const modId = uuid();

    const module = new UartModule(
      0,
      modId,
      "Uart Module",
      locationId.id,
      ModuleSubType.genericSerial,
      1,
      9600,
    );

    await db.transaction().execute(async (trx) => {
      await upsertUartModules(trx, [module]);
    });

    const modules = await getUartModules(db, locationId.id);

    expect(modules.length).toBe(1);
    expect(modules[0].id).toBe(modId);
    expect(modules[0].locationId).toBe(locationId.id);
    expect(modules[0].name).toBe("Uart Module");
    expect(modules[0].uartChannel).toBe(1);
    expect(modules[0].baudRate).toBe(9600);
    expect(modules[0].moduleType).toBe(ModuleType.uart);
    expect(modules[0].moduleSubType).toBe(ModuleSubType.genericSerial);
  });

  it("should update changes", async () => {
    const locationId = await db
      .selectFrom("locations")
      .select(["id"])
      .where("name", "=", location)
      .executeTakeFirstOrThrow();

    const modId = uuid();

    const module = new UartModule(
      0,
      modId,
      "Uart Module",
      locationId.id,
      ModuleSubType.genericSerial,
      1,
      9600,
    );

    await db.transaction().execute(async (trx) => {
      await upsertUartModules(trx, [module]);
    });

    const modules = await getUartModules(db, locationId.id);

    expect(modules.length).toBe(1);
    expect(modules[0].id).toBe(modId);
    expect(modules[0].locationId).toBe(locationId.id);
    expect(modules[0].name).toBe("Uart Module");
    expect(modules[0].uartChannel).toBe(1);
    expect(modules[0].baudRate).toBe(9600);
    expect(modules[0].moduleType).toBe(ModuleType.uart);
    expect(modules[0].moduleSubType).toBe(ModuleSubType.genericSerial);

    modules[0].name = "New Name";
    modules[0].uartChannel = 2;
    modules[0].baudRate = 115200;

    await db.transaction().execute(async (trx) => {
      await upsertUartModules(trx, modules);
    });

    const updatedModules = await getUartModules(db, locationId.id);

    expect(updatedModules.length).toBe(1);
    expect(updatedModules[0].id).toBe(modId);
    expect(updatedModules[0].locationId).toBe(locationId.id);
    expect(updatedModules[0].name).toBe("New Name");
    expect(updatedModules[0].uartChannel).toBe(2);
    expect(updatedModules[0].baudRate).toBe(115200);
    expect(updatedModules[0].moduleType).toBe(ModuleType.uart);
    expect(updatedModules[0].moduleSubType).toBe(ModuleSubType.genericSerial);
  });

  it("should update kanagroo module", async () => {
    const locationId = await db
      .selectFrom("locations")
      .select(["id"])
      .where("name", "=", location)
      .executeTakeFirstOrThrow();

    const modId = uuid();

    const subModuleId = uuid();

    const module = new UartModule(
      0,
      modId,
      "Uart Module",
      locationId.id,
      ModuleSubType.kangaroo,
      1,
      9600,
    );

    const subModule = new KangarooX2(subModuleId, "channel 1", "channel 2");

    module.subModule = subModule;

    await db.transaction().execute(async (trx) => {
      await upsertUartModules(trx, [module]);
    });

    const modules = await getUartModules(db, locationId.id);

    const savedSubmodule = modules[0].subModule as KangarooX2;

    expect(modules.length).toBe(1);
    expect(modules[0].id).toBe(modId);
    expect(modules[0].locationId).toBe(locationId.id);
    expect(modules[0].name).toBe("Uart Module");
    expect(modules[0].uartChannel).toBe(1);
    expect(modules[0].baudRate).toBe(9600);
    expect(modules[0].moduleType).toBe(ModuleType.uart);
    expect(modules[0].moduleSubType).toBe(ModuleSubType.kangaroo);
    expect(modules[0].subModule).toBeDefined();
    expect(modules[0].subModule).toBeInstanceOf(KangarooX2);
    expect(savedSubmodule.ch1Name).toBe("channel 1");
    expect(savedSubmodule.ch2Name).toBe("channel 2");

    modules[0].name = "New Name";
    modules[0].uartChannel = 2;
    modules[0].baudRate = 115200;
    savedSubmodule.ch1Name = "new channel 1";
    savedSubmodule.ch2Name = "new channel 2";

    await db.transaction().execute(async (trx) => {
      await upsertUartModules(trx, modules);
    });

    const updatedModules = await getUartModules(db, locationId.id);
    const updatedSubmodule = updatedModules[0].subModule as KangarooX2;

    expect(updatedModules.length).toBe(1);
    expect(updatedModules[0].id).toBe(modId);
    expect(updatedModules[0].locationId).toBe(locationId.id);
    expect(updatedModules[0].name).toBe("New Name");
    expect(updatedModules[0].uartChannel).toBe(2);
    expect(updatedModules[0].baudRate).toBe(115200);
    expect(updatedModules[0].moduleType).toBe(ModuleType.uart);
    expect(updatedModules[0].moduleSubType).toBe(ModuleSubType.kangaroo);
    expect(updatedModules[0].subModule).toBeDefined();
    expect(updatedModules[0].subModule).toBeInstanceOf(KangarooX2);
    expect(updatedSubmodule.ch1Name).toBe("new channel 1");
    expect(updatedSubmodule.ch2Name).toBe("new channel 2");
  });
});
