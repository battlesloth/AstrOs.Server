import { describe, it, expect, beforeEach, afterEach } from "vitest";
import SQLite from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import { migrateToLatest } from "../../database.js";
import { Database } from "../../types.js";
import { getGpioModule, upsertGpioModule } from "./gpio_repository.js";
import { AstrOsConstants } from "astros-common";

describe("GpioRepository", () => {
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

  it("should get a gpio module", async () => {
    const locationId = await db
      .selectFrom("locations")
      .select(["id"])
      .where("name", "=", location)
      .executeTakeFirstOrThrow();

    const module = await getGpioModule(db, locationId.id);

    expect(module).toBeDefined();

    expect(module.locationId).toBe(locationId.id);
    expect(module.channels.length).toBe(10);
  });

  it("should update changes", async () => {
    const locationId = await db
      .selectFrom("locations")
      .select(["id"])
      .where("name", "=", location)
      .executeTakeFirstOrThrow();

    const module = await getGpioModule(db, locationId.id);

    expect(module.channels[0].channelName).toBe("unassigned");
    expect(module.channels[0].defaultHigh).toBe(false);
    expect(module.channels[0].enabled).toBe(false);

    module.channels[0].channelName = "new name";
    module.channels[0].defaultHigh = true;
    module.channels[0].enabled = true;

    await upsertGpioModule(db, module);

    const updatedModule = await getGpioModule(db, locationId.id);

    expect(updatedModule).toBeDefined();
    expect(updatedModule.locationId).toBe(locationId.id);
    expect(updatedModule.channels.length).toBe(10);
    expect(updatedModule.channels[0].channelName).toBe("new name");
    expect(updatedModule.channels[0].defaultHigh).toBe(true);
    expect(updatedModule.channels[0].enabled).toBe(true);
  });
});
