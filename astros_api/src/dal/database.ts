import appdata from "appdata-path";
import SQLite from "better-sqlite3";
import {
  InsertResult,
  Kysely,
  Migration,
  MigrationProvider,
  Migrator,
  SqliteDialect,
} from "kysely";
import { logger } from "../logger.js";
import { Database } from "./types.js";
import { migration_0 } from "./migrations/migration_0.js";

const appdataPath = appdata("astrosserver");
const databaseFile = "/database.sqlite3";

const dialect = new SqliteDialect({
  database: new SQLite(`${appdataPath}${databaseFile}`),
});

export const db = new Kysely<Database>({
  dialect,
});

const migrationProvider = new (class implements MigrationProvider {
  async getMigrations(): Promise<Record<string, Migration>> {
    return {
      "0_initial": migration_0,
    };
  }
})();

export async function migrateToLatest(db: Kysely<Database>): Promise<void> {
  const migrator = new Migrator({
    db,
    provider: migrationProvider,
  });

  const { error, results } = await migrator.migrateToLatest();

  results?.forEach((it) => {
    if (it.status === "Success") {
      logger.info(`migration "${it.migrationName}" was executed successfully`);
    } else if (it.status === "Error") {
      logger.error(`failed to execute migration "${it.migrationName}"`);
    }
  });

  if (error) {
    logger.error("failed to migrate");
    logger.error(error);
  }
}

export function inserted(val: InsertResult): boolean {
  return (
    val.numInsertedOrUpdatedRows !== undefined &&
    val.numInsertedOrUpdatedRows > 0
  );
}
