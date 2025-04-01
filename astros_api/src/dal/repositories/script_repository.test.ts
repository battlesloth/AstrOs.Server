import { describe, it, expect, beforeEach, afterEach } from "vitest";
import SQLite from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import { Database } from "../types.js";
import { migrateToLatest } from "../database.js";
import { ScriptRepository } from "./script_repository.js";
import { Script } from "astros-common";

import { v4 as uuid } from "uuid";

describe("Script Repository", () => {
  let db: Kysely<Database>;

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

  it("should save script", async () => {
    const scriptId = uuid();

    const script = new Script(
      scriptId,
      "Test Script",
      "Test Description",
      new Date(Date.now()),
    );

    const repo = new ScriptRepository(db);

    await repo.upsertScript(script);

    const savedScripts = await repo.getScripts();

    expect(savedScripts.length).toBe(1);
    expect(savedScripts[0].id).toBe(scriptId);
    expect(savedScripts[0].scriptName).toBe("Test Script");
    expect(savedScripts[0].description).toBe("Test Description");
    expect(savedScripts[0].deploymentStatusKvp.length).toBe(0);
  });

  it("should update script", async () => {
    const scriptId = uuid();

    const script = new Script(
      scriptId,
      "Test Script",
      "Test Description",
      new Date(Date.now()),
    );

    const repo = new ScriptRepository(db);

    await repo.upsertScript(script);

    const savedScripts = await repo.getScripts();

    expect(savedScripts.length).toBe(1);
    expect(savedScripts[0].id).toBe(scriptId);
    expect(savedScripts[0].scriptName).toBe("Test Script");
    expect(savedScripts[0].description).toBe("Test Description");
    expect(savedScripts[0].deploymentStatusKvp.length).toBe(0);

    script.scriptName = "Updated Script";
    script.description = "Updated Description";

    await repo.upsertScript(script);

    const updatedScripts = await repo.getScripts();

    expect(updatedScripts.length).toBe(1);
    expect(updatedScripts[0].id).toBe(scriptId);
    expect(updatedScripts[0].scriptName).toBe("Updated Script");
    expect(updatedScripts[0].description).toBe("Updated Description");
    expect(updatedScripts[0].deploymentStatusKvp.length).toBe(0);
  });

  it("should delete script", async () => {
    const scriptId = uuid();

    const script = new Script(
      scriptId,
      "Test Script",
      "Test Description",
      new Date(Date.now()),
    );

    const repo = new ScriptRepository(db);

    await repo.upsertScript(script);

    const savedScripts = await repo.getScripts();

    expect(savedScripts.length).toBe(1);
    expect(savedScripts[0].id).toBe(scriptId);
    expect(savedScripts[0].scriptName).toBe("Test Script");
    expect(savedScripts[0].description).toBe("Test Description");
    expect(savedScripts[0].deploymentStatusKvp.length).toBe(0);

    await repo.deleteScript(scriptId);

    const updatedScripts = await repo.getScripts();

    expect(updatedScripts.length).toBe(0);
  });
});
