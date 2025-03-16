import { Kysely, Transaction } from "kysely";
import { logger } from "../../logger.js";
import { inserted } from "../database.js";
import { Database } from "../types.js";
import {
  ControlModule,
  ControllerLocation,
} from "astros-common";
import { 
  getGpioModule, 
  upsertGpioModule 
} from "./module_repositories/gpio_repository.js";
import { 
  getUartModules, 
  upsertUartModules, 
  removeStaleUartModules 
} from "./module_repositories/uart_repository.js";
import { 
  getI2cModules, 
  removeStaleI2CModules, 
  upsertI2cModules 
} from "./module_repositories/i2c_repository.js";


export class LocationsRepository {

    constructor(
      private readonly db: Kysely<Database>
    ) {}

  public async getLocations(): Promise<Array<ControllerLocation>> {
    const result = new Array<ControllerLocation>();

    const data = await this.db
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
    const data = await this.db
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
    const data = await this.db
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

    location.uartModules = await getUartModules(this.db, location.id);

    location.i2cModules = await getI2cModules(this.db, location.id);

    location.gpioModule = await getGpioModule(this.db, location.id);

    return location;
  }


  //#region Update Location
  public async updateLocation(location: ControllerLocation): Promise<boolean> {
    logger.info(`Updating location ${location.id}, ${location.locationName}`);

    // TODO: only wipe fingerprint if there are changes to uart/servo/i2c

    await this.db.transaction().execute(async (trx) => {

      logger.info('here 1');
      await trx
        .updateTable("locations")
        .set({
          config_fingerprint: "outofdate",
        })
        .where("id", "=", location.id)
        .execute()
        .catch((err) => {
          logger.info('here 1.1');
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

      logger.info('here 2');

      await removeStaleUartModules(
        trx,
        location.id,
        location.uartModules.map((m) => m.id),
      );

      await upsertUartModules(trx, location.uartModules);

      logger.info('here 3');

      await removeStaleI2CModules(
        trx,
        location.id,
        location.i2cModules.map((m) => m.id),
      );

      await upsertI2cModules(trx, location.i2cModules);

      logger.info('here 4');
      await upsertGpioModule(trx, location.gpioModule);
      logger.info('here 5');
    });

    logger.info(`Updated location ${location.id}`);

    return true;
  }

  //#endregion
  //#region Controllers

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

  //#endregion
  //#region Fingerprint

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
    const result = await this.db
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
}
