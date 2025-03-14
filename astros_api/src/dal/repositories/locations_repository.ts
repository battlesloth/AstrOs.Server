import { Transaction } from "kysely";
import { logger } from "../../logger.js";
import { db, inserted } from "../database.js";
import { Database, UartModule as UartModuleRow } from "../types.js";
import {
  ControlModule,
  ControllerLocation,
  GpioChannel,
  HumanCyborgRelationsModule,
  I2cModule,
  KangarooX2,
  MaestroBoard,
  MaestroChannel,
  MaestroModule,
  ModuleSubType,
  UartModule,
} from "astros-common";

export class LocationsRepository {
  public async getLocations(): Promise<Array<ControllerLocation>> {
    const result = new Array<ControllerLocation>();

    const data = await db
      .selectFrom("locations")
      .leftJoin("controller_locations as cl", "cl.location_id", "locations.id")
      .leftJoin("controllers as c", "c.id", "cl.controller_id")
      .select([
        "locations.id as loc_id",
        "locations.name as loc_name",
        "locations.description as loc_desc",
        "locations.config_fingerprint as loc_fingerprint",
        "c.id as ctrl_id",
        "c.name as ctrl_name",
        "c.address as ctrl_address",
      ])
      .execute()
      .catch((err) => {
        logger.error(err);
        throw err;
      });

    for (const c of data) {
      const location = new ControllerLocation(
        c.loc_id,
        c.loc_name,
        c.loc_desc,
        c.loc_fingerprint,
      );

      location.controller = new ControlModule(
        c.ctrl_id ?? "",
        c.ctrl_name ?? "",
        c.ctrl_address ?? "",
      );

      result.push(location);
    }

    return result;
  }

  public async getLocationByController(
    id: string,
  ): Promise<ControllerLocation> {
    const data = await db
      .selectFrom("locations")
      .leftJoin("controller_locations as cl", "cl.location_id", "locations.id")
      .leftJoin("controllers as c", "c.id", "cl.controller_id")
      .select([
        "locations.id as loc_id",
        "locations.name as loc_name",
        "locations.description as loc_desc",
        "locations.config_fingerprint as loc_fingerprint",
        "c.id as ctrl_id",
        "c.name as ctrl_name",
        "c.address as ctrl_address",
      ])
      .where("c.id", "=", id)
      .executeTakeFirstOrThrow()
      .catch((err) => {
        logger.error(err);
        throw err;
      });

    const location = new ControllerLocation(
      data.loc_id,
      data.loc_name,
      data.loc_desc,
      data.loc_fingerprint,
    );

    location.controller = new ControlModule(
      data.ctrl_id ?? "",
      data.ctrl_name ?? "",
      data.ctrl_address ?? "",
    );

    return location;
  }

  public async getLocationIdByController(mac: string): Promise<string> {
    const data = await db
      .selectFrom("controller_locations")
      .select("location_id")
      .where("controller_id", "=", mac)
      .executeTakeFirstOrThrow()
      .catch((err) => {
        logger.error(err);
        throw err;
      });

    return data.location_id;
  }

  public async loadLocations(): Promise<Array<ControllerLocation>> {
    const result = await this.getLocations();

    for (const location of result) {
      await this.loadLocationConfiguration(location);
    }

    return result;
  }

  public async loadLocationConfiguration(
    location: ControllerLocation,
  ): Promise<ControllerLocation> {
    // load uart modules
    const uartData = await db
      .selectFrom("uart_modules")
      .selectAll()
      .where("location_id", "=", location.id)
      .execute()
      .catch((err) => {
        logger.error(err);
        throw err;
      });

    uartData.map((m: UartModuleRow) => {
      location.uartModules.push(
        new UartModule(
          m.id,
          m.name,
          m.location_id,
          m.uart_type,
          m.uart_channel,
          m.baud_rate,
        ),
      );
    });

    for (const uart of location.uartModules) {
      switch (uart.moduleSubType) {
        case ModuleSubType.humanCyborgRelationsSerial:
          uart.subModule = new HumanCyborgRelationsModule();
          break;
        case ModuleSubType.kangaroo:
          uart.subModule = await this.loadKangarooModule(uart.id);
          break;
        case ModuleSubType.maestro:
          uart.subModule = await this.loadMaestroModule(uart);
          break;
        default:
          uart.subModule = {};
          break;
      }
    }

    // load i2c modules
    const i2cData = await db
      .selectFrom("i2c_modules")
      .selectAll()
      .where("location_id", "=", location.id)
      .execute()
      .catch((err) => {
        logger.error(err);
        throw err;
      });

    i2cData.map((m: any) => {
      location.i2cModules.push(
        new I2cModule(m.id, m.name, m.location_id, m.i2c_address, m.i2c_type),
      );
    });

    // load gpio channels
    const gpioData = await db
      .selectFrom("gpio_channels")
      .selectAll()
      .where("location_id", "=", location.id)
      .execute()
      .catch((err) => {
        logger.error(err);
        throw err;
      });

    gpioData.map((m: any) => {
      location.gpioModule.channels[m.channel_number] = new GpioChannel(
        m.id,
        m.location_id,
        m.channel_number,
        m.enabled > 0,
        m.name,
        m.default_low > 0,
      );
    });

    return location;
  }


  //#region Update Location
  public async updateLocation(location: ControllerLocation): Promise<boolean> {
    logger.info(`Updating location ${location.id}, ${location.locationName}`);

    // TODO: only wipe fingerprint if there are changes to uart/servo/i2c

    await db.transaction().execute(async (trx) => {
      await trx
        .updateTable("locations")
        .set({
          config_fingerprint: "outofdate",
        })
        .where("id", "=", location.id)
        .executeTakeFirstOrThrow()
        .catch((err) => {
          logger.error(err);
          throw err;
        });

      if (location.controller !== undefined && location.controller !== null) {
        await this.setLocationController(
          trx,
          location.id,
          location.controller.id,
        );
      }

      await this.removeStaleUartModules(
        trx,
        location.id,
        location.uartModules.map((m) => m.id),
      );

      for (const uart of location.uartModules) {
        logger.info(
          `Updating uart module ${uart.name}, id: ${uart.id}, type: ${uart.moduleSubType}`,
        );

        switch (uart.moduleSubType) {
          case ModuleSubType.kangaroo:
            await this.insertKangarooModule(
              trx,
              uart.id,
              uart.subModule as KangarooX2,
            );
            break;
          case ModuleSubType.maestro:
            await this.insertMaestroModule(
              trx,
              uart.id,
              uart.subModule as MaestroModule,
            );
            break;
        }

        await trx
          .insertInto("uart_modules")
          .values({
            id: uart.id,
            name: uart.name,
            location_id: uart.locationId,
            uart_type: uart.moduleSubType,
            uart_channel: uart.uartChannel,
            baud_rate: uart.baudRate,
          })
          .onConflict((c) =>
            c.column("id").doUpdateSet((eb) => ({
              name: eb.ref("excluded.name"),
              location_id: eb.ref("excluded.location_id"),
              uart_type: eb.ref("excluded.uart_type"),
              uart_channel: eb.ref("excluded.uart_channel"),
              baud_rate: eb.ref("excluded.baud_rate"),
            })),
          )
          .executeTakeFirstOrThrow()
          .catch((err) => {
            logger.error(err);
            throw err;
          });
      }

      await this.removeStaleI2CModules(
        trx,
        location.id,
        location.i2cModules.map((m) => m.id),
      );

      for (const i2c of location.i2cModules) {
        logger.info(
          `Updating i2c module ${i2c.name}, id: ${i2c.id}, type: ${i2c.moduleSubType}`,
        );

        switch (i2c.moduleSubType) {
          default:
            break;
        }

        await trx
          .insertInto("i2c_modules")
          .values({
            id: i2c.id,
            name: i2c.name,
            location_id: i2c.locationId,
            i2c_address: i2c.i2cAddress,
            i2c_type: i2c.moduleSubType,
          })
          .onConflict((c) =>
            c.column("id").doUpdateSet((eb) => ({
              name: eb.ref("excluded.name"),
              location_id: eb.ref("excluded.location_id"),
              i2c_address: eb.ref("excluded.i2c_address"),
              i2c_type: eb.ref("excluded.i2c_type"),
            })),
          )
          .executeTakeFirstOrThrow()
          .catch((err) => {
            logger.error(err);
            throw err;
          });
      }

      for (const gpio of location.gpioModule.channels) {
        await trx
          .insertInto("gpio_channels")
          .values({
            id: gpio.id,
            location_id: location.id,
            channel_number: gpio.channelNumber,
            name: gpio.channelName,
            default_low: gpio.defaultLow ? 1 : 0,
            enabled: gpio.enabled ? 1 : 0,
          })
          .onConflict((c) =>
            c.column("id").doUpdateSet((eb) => ({
              location_id: eb.ref("excluded.location_id"),
              channel_number: eb.ref("excluded.channel_number"),
              name: eb.ref("excluded.name"),
              default_low: eb.ref("excluded.default_low"),
              enabled: eb.ref("excluded.enabled"),
            })),
          )
          .executeTakeFirstOrThrow()
          .catch((err) => {
            logger.error(err);
            throw err;
          });
      }
    });

    logger.info(`Updated location ${location.id}`);

    return true;
  }



  public async setLocationController(
    trx: Transaction<Database>,
    locationId: string,
    controllerId: string,
  ): Promise<boolean> {
    await trx
      .deleteFrom("controller_locations")
      .where("location_id", "=", locationId)
      .execute()
      .catch((err) => {
        logger.error(err);
        throw err;
      });

    const result = await trx
      .insertInto("controller_locations")
      .values({
        location_id: locationId,
        controller_id: controllerId,
      })
      .executeTakeFirst()
      .catch((err) => {
        logger.error(err);
        throw err;
      });

    return inserted(result);
  }

  public async updateLocationFingerprintTrx(
    trx: Transaction<Database>,
    locationId: string,
    fingerprint: string,
  ): Promise<boolean> {
    const result = await trx
      .updateTable("locations")
      .set({
        config_fingerprint: fingerprint,
      })
      .where("id", "=", locationId)
      .executeTakeFirst()
      .catch((err) => {
        logger.error(err);
        throw err;
      });

    return result.numUpdatedRows > 0;
  }

  public async updateLocationFingerprint(
    locationId: string,
    fingerprint: string,
  ): Promise<boolean> {
    const result = await db
      .updateTable("locations")
      .set({
        config_fingerprint: fingerprint,
      })
      .where("id", "=", locationId)
      .executeTakeFirst()
      .catch((err) => {
        logger.error(err);
        throw err;
      });

    return result.numUpdatedRows > 0;
  }

  //#endregion

  //#region Utility methods
  private async removeStaleUartModules(
    trx: Transaction<Database>,
    locationId: string,
    currentMods: Array<string>,
  ) {
    const uartMods = await trx
      .selectFrom("uart_modules")
      .selectAll()
      .where("location_id", "=", locationId)
      .execute()
      .catch((err) => {
        logger.error(err);
        throw err;
      });

    for (const uartMod of uartMods) {
      if (currentMods.includes(uartMod.id)) {
        continue;
      }

      logger.info(
        `Removing stale uart module ${uartMod.name}, id: ${uartMod.id}, type: ${uartMod.uart_type}`,
      );

      switch (uartMod.uart_type) {
        case ModuleSubType.kangaroo:
          await this.deleteKangarooModule(trx, uartMod.id);
          break;
        case ModuleSubType.maestro:
          await this.deleteMaestroModule(trx, uartMod.id);
          break;
        default:
          break;
      }

      await trx
        .deleteFrom("uart_modules")
        .where("id", "=", uartMod.id)
        .execute()
        .catch((err) => {
          logger.error(err);
          throw err;
        });
    }
  }

  private async removeStaleI2CModules(
    trx: Transaction<Database>,
    locationId: string,
    currentMods: Array<string>,
  ) {
    const i2cMods = await trx
      .selectFrom("i2c_modules")
      .selectAll()
      .where("location_id", "=", locationId)
      .execute()
      .catch((err) => {
        logger.error(err);
        throw err;
      });

    for (const i2cMod of i2cMods) {
      if (currentMods.includes(i2cMod.id)) {
        continue;
      }

      logger.info(
        `Removing stale i2c module ${i2cMod.name}, id: ${i2cMod.id}, type: ${i2cMod.i2c_type}`,
      );

      switch (i2cMod.i2c_type) {
        default:
          break;
      }

      await trx
        .deleteFrom("i2c_modules")
        .where("id", "=", i2cMod.id)
        .execute()
        .catch((err) => {
          logger.error(err);
          throw err;
        });
    }
  }
  //#endregion

  //#region KangarooX2 methods

  private async insertKangarooModule(
    trx: Transaction<Database>,
    parentId: string,
    module: KangarooX2,
  ): Promise<void> {
    await trx
      .insertInto("kangaroo_x2")
      .values({
        id: module.id,
        parent_id: parentId,
        ch1_name: module.ch1Name,
        ch2_name: module.ch2Name,
      })
      .executeTakeFirst()
      .catch((err) => {
        logger.error(err);
        throw err;
      });
  }

  private async loadKangarooModule(uartId: string): Promise<KangarooX2> {
    const data = await db
      .selectFrom("kangaroo_x2")
      .selectAll()
      .where("parent_id", "=", uartId)
      .executeTakeFirstOrThrow()
      .catch((err) => {
        logger.error(err);
        throw err;
      });

    return new KangarooX2(data.id, data.ch1_name, data.ch2_name);
  }

  private async deleteKangarooModule(
    trx: Transaction<Database>,
    parentId: string,
  ): Promise<void> {
    await trx
      .deleteFrom("kangaroo_x2")
      .where("parent_id", "=", parentId)
      .execute()
      .catch((err) => {
        logger.error(err);
        throw err;
      });
  }

  //#endregion

  //#region Maestro methods

  private async insertMaestroModule(
    trx: Transaction<Database>,
    parentId: string,
    module: MaestroModule,
  ): Promise<void> {
    for (const board of module.boards) {
      await trx
        .insertInto("maestro_boards")
        .values({
          id: board.id,
          parent_id: parentId,
          board_id: board.boardId,
          name: board.name,
          channel_count: board.channelCount,
        })
        .executeTakeFirst()
        .catch((err) => {
          logger.error(err);
          throw err;
        });

      for (const channel of board.channels) {
        await trx
          .insertInto("maestro_channels")
          .values({
            id: channel.id,
            board_id: board.id,
            channel_number: channel.channelNumber,
            name: channel.channelName,
            enabled: channel.enabled ? 1 : 0,
            is_servo: channel.isServo ? 1 : 0,
            min_pos: channel.minPos,
            max_pos: channel.maxPos,
            home_pos: channel.homePos,
            inverted: channel.inverted ? 1 : 0,
          })
          .executeTakeFirst()
          .catch((err) => {
            logger.error(err);
            throw err;
          });
      }
    }
  }

  private async loadMaestroModule(uartMod: UartModule): Promise<MaestroModule> {
    const module = new MaestroModule();

    const boards = await db
      .selectFrom("maestro_boards")
      .selectAll()
      .where("parent_id", "=", uartMod.id)
      .orderBy("board_id")
      .execute()
      .catch((err) => {
        logger.error(err);
        throw err;
      });

    for (const b of boards) {
      module.boards.push(
        new MaestroBoard(
          b.id,
          b.parent_id,
          b.board_id,
          b.name,
          b.channel_count,
        ),
      );
    }

    for (const board of module.boards) {
      const channels = await db
        .selectFrom("maestro_channels")
        .selectAll()
        .where("board_id", "=", board.id)
        .orderBy("channel_number")
        .execute()
        .catch((err) => {
          logger.error(err);
          throw err;
        });

      for (const c of channels) {
        board.channels.push(
          new MaestroChannel(
            c.id,
            board.id,
            c.name,
            c.enabled > 0,
            c.channel_number,
            c.is_servo > 0,
            c.min_pos,
            c.max_pos,
            c.home_pos,
            c.inverted > 0,
          ),
        );
      }
    }

    return module;
  }

  private async deleteMaestroModule(
    trx: Transaction<Database>,
    parentId: string,
  ): Promise<void> {
    const boardIds = await trx
      .selectFrom("maestro_boards")
      .select("id")
      .where("parent_id", "=", parentId)
      .execute()
      .catch((err) => {
        logger.error(err);
        throw err;
      });

    for (const id of boardIds) {
      await trx
        .deleteFrom("maestro_channels")
        .where("board_id", "=", id.id)
        .execute()
        .catch((err) => {
          logger.error(err);
          throw err;
        });
    }

    await trx
      .deleteFrom("maestro_boards")
      .where("parent_id", "=", parentId)
      .execute()
      .catch((err) => {
        logger.error(err);
        throw err;
      });
  }

  //#endregion
}
