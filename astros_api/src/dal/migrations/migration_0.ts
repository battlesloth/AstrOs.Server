import { Kysely, Migration } from "kysely";
import {
  NewController,
  NewControllerLocation,
  NewGpioChannel,
  NewLocation,
  NewRemoteConfig,
  NewUser,
} from "../types.js";
import { v4 as uuid } from "uuid";
import * as crypto from "crypto";
import { AstrOsConstants } from "astros-common";

export const migration_0: Migration = {
  up: async (db: Kysely<any>): Promise<void> => {
    await db.schema
      .createTable("settings")
      .addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
      .addColumn("key", "text", (col) => col.notNull().unique())
      .addColumn("value", "text", (col) => col.notNull())
      .addUniqueConstraint("settings_key_unique", ["key"])
      .execute();

    await db.schema
      .createTable("users")
      .addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
      .addColumn("user", "text", (col) => col.notNull().unique())
      .addColumn("hash", "text", (col) => col.notNull())
      .addColumn("salt", "text", (col) => col.notNull())
      .execute();

    await db.schema
      .createTable("remote_config")
      .addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
      .addColumn("type", "text", (col) => col.notNull().unique())
      .addColumn("value", "text", (col) => col.notNull())
      .execute();

    await db.schema
      .createTable("audio_files")
      .addColumn("id", "text", (col) => col.primaryKey())
      .addColumn("file_name", "text", (col) => col.notNull())
      .addColumn("description", "text", (col) => col.notNull())
      .addColumn("duration", "integer", (col) => col.notNull())
      .execute();

    await db.schema
      .createTable("scripts")
      .addColumn("id", "text", (col) => col.primaryKey())
      .addColumn("name", "text", (col) => col.notNull())
      .addColumn("description", "text", (col) => col.notNull())
      .addColumn("last_modified", "integer", (col) => col.notNull())
      .addColumn("enabled", "integer", (col) => col.notNull().defaultTo(1))
      .execute();

    await db.schema
      .createTable("script_channels")
      .addColumn("id", "text", (col) => col.primaryKey())
      .addColumn("script_id", "text", (col) => col.notNull())
      .addColumn("channel_type", "integer", (col) => col.notNull())
      .addColumn("module_channel_id", "text", (col) => col.notNull())
      .addColumn("module_channel_type", "text", (col) => col.notNull())
      .execute();

    await db.schema
      .createTable("script_events")
      .addColumn("script_id", "text", (col) => col.notNull())
      .addColumn("script_channel_id", "text", (col) => col.notNull())
      .addColumn("module_type", "integer", (col) => col.notNull())
      .addColumn("module_sub_type", "integer", (col) => col.notNull())
      .addColumn("time", "integer", (col) => col.notNull())
      .addColumn("data", "text", (col) => col.notNull())
      .execute();

    await db.schema
      .createTable("script_deployments")
      .addColumn("script_id", "text", (col) => col.notNull())
      .addColumn("location_id", "text", (col) => col.notNull())
      .addColumn("last_deployed", "integer", (col) => col.notNull())
      .addPrimaryKeyConstraint("script_deployments_pk", [
        "script_id",
        "location_id",
      ])
      .execute();

    await db.schema
      .createTable("controllers")
      .addColumn("id", "text", (col) => col.primaryKey())
      .addColumn("name", "text", (col) => col.notNull().unique())
      .addColumn("description", "text", (col) => col.notNull())
      .addColumn("address", "text", (col) => col.notNull().unique())
      .execute();

    await db.schema
      .createTable("locations")
      .addColumn("id", "text", (col) => col.primaryKey())
      .addColumn("name", "text", (col) => col.notNull().unique())
      .addColumn("description", "text", (col) => col.notNull())
      .addColumn("config_fingerprint", "text", (col) => col.notNull())
      .execute();

    await db.schema
      .createTable("controller_locations")
      .addColumn("location_id", "text", (col) => col.notNull())
      .addColumn("controller_id", "integer", (col) => col.notNull())
      .execute();

    await db.schema
      .createTable("gpio_channels")
      .addColumn("id", "text", (col) => col.primaryKey())
      .addColumn("location_id", "text", (col) => col.notNull())
      .addColumn("channel_number", "integer", (col) => col.notNull())
      .addColumn("name", "text", (col) => col.notNull())
      .addColumn("default_low", "integer", (col) => col.notNull())
      .addColumn("enabled", "integer", (col) => col.notNull())
      .execute();

    await db.schema
      .createTable("i2c_modules")
      .addColumn("id", "text", (col) => col.primaryKey())
      .addColumn("location_id", "text", (col) => col.notNull())
      .addColumn("name", "text", (col) => col.notNull())
      .addColumn("i2c_address", "integer", (col) => col.notNull())
      .addColumn("i2c_type", "integer", (col) => col.notNull())
      .execute();

    await db.schema
      .createTable("uart_modules")
      .addColumn("id", "text", (col) => col.primaryKey())
      .addColumn("location_id", "text", (col) => col.notNull())
      .addColumn("name", "text", (col) => col.notNull())
      .addColumn("uart_type", "integer", (col) => col.notNull())
      .addColumn("uart_channel", "integer", (col) => col.notNull())
      .addColumn("baud_rate", "integer", (col) => col.notNull())
      .execute();

    await db.schema
      .createTable("kangaroo_x2")
      .addColumn("id", "text", (col) => col.primaryKey())
      .addColumn("parent_id", "text", (col) => col.notNull().unique())
      .addColumn("ch1_name", "text", (col) => col.notNull())
      .addColumn("ch2_name", "text", (col) => col.notNull())
      .execute();

    await db.schema
      .createTable("maestro_boards")
      .addColumn("id", "text", (col) => col.primaryKey())
      .addColumn("parent_id", "text", (col) => col.notNull())
      .addColumn("board_id", "integer", (col) => col.notNull())
      .addColumn("name", "text", (col) => col.notNull())
      .addColumn("channel_count", "integer", (col) => col.notNull())
      .execute();

    await db.schema
      .createTable("maestro_channels")
      .addColumn("id", "text", (col) => col.primaryKey())
      .addColumn("board_id", "text", (col) => col.notNull())
      .addColumn("channel_number", "integer", (col) => col.notNull())
      .addColumn("name", "text", (col) => col.notNull())
      .addColumn("enabled", "integer", (col) => col.notNull().defaultTo(0))
      .addColumn("is_servo", "integer", (col) => col.notNull().defaultTo(1))
      .addColumn("min_pos", "integer", (col) => col.notNull().defaultTo(500))
      .addColumn("max_pos", "integer", (col) => col.notNull().defaultTo(2500))
      .addColumn("home_pos", "integer", (col) => col.notNull().defaultTo(1250))
      .addColumn("inverted", "integer", (col) => col.notNull().defaultTo(0))
      .execute();

    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto
      .pbkdf2Sync("password", salt, 1000, 64, "sha512")
      .toString("hex");

    const adminUser = <NewUser>{
      user: "admin",
      hash: hash,
      salt: salt,
    };

    await db.insertInto("users").values(adminUser).execute();

    const remoteConfig = <NewRemoteConfig>{
      type: "astrOsScreen",
      value: "{}",
    };

    await db.insertInto("remote_config").values(remoteConfig).execute();

    const masterController = <NewController>{
      id: uuid(),
      name: "master",
      description: "Master Controller",
      address: "00:00:00:00:00:00",
    };

    await db.insertInto("controllers").values(masterController).execute();

    const locations = [
      AstrOsConstants.BODY,
      AstrOsConstants.CORE,
      AstrOsConstants.DOME,
    ];

    const nameMap = new Map();
    nameMap.set(AstrOsConstants.BODY, "Body Controller");
    nameMap.set(AstrOsConstants.CORE, "Dome Core Controller");
    nameMap.set(AstrOsConstants.DOME, "Dome Surface Controller");

    const bodyId = uuid();

    for await (const loc of locations) {
      let id = "";

      if (loc === AstrOsConstants.BODY) {
        id = bodyId;
      } else {
        id = uuid();
      }

      const location = <NewLocation>{
        id: id,
        name: loc,
        description: nameMap.get(loc),
        config_fingerprint: "",
      };

      await db.insertInto("locations").values(location).execute();

      for (let i = 0; i < 10; i++) {
        const gpioChannel = <NewGpioChannel>{
          id: uuid(),
          location_id: id,
          channel_number: i,
          name: "unassigned",
          default_low: 0,
          enabled: 0,
        };

        await db.insertInto("gpio_channels").values(gpioChannel).execute();
      }
    }

    const controllerLocation = <NewControllerLocation>{
      location_id: bodyId,
      controller_id: masterController.id,
    };

    await db
      .insertInto("controller_locations")
      .values(controllerLocation)
      .execute();

    return Promise.resolve();
  },
  down: async (db: Kysely<any>): Promise<void> => {
    await db.schema.dropTable("settings").execute();
    await db.schema.dropTable("users").execute();
    await db.schema.dropTable("remote_config").execute();
    await db.schema.dropTable("audio_files").execute();
    await db.schema.dropTable("scripts").execute();
    await db.schema.dropTable("script_channels").execute();
    await db.schema.dropTable("script_events").execute();
    await db.schema.dropTable("script_deployments").execute();
    await db.schema.dropTable("controllers").execute();
    await db.schema.dropTable("locations").execute();
    await db.schema.dropTable("controller_location").execute();
    await db.schema.dropTable("gpio_channels").execute();
    await db.schema.dropTable("i2c_modules").execute();
    await db.schema.dropTable("uart_modules").execute();
    await db.schema.dropTable("kangaroo_x2").execute();
    await db.schema.dropTable("maestro_boards").execute();
    await db.schema.dropTable("maestro_channels").execute();

    return Promise.resolve();
  },
};
