import { inserted } from "../../dal/database.js";
import { ControlModule } from "astros-common";
import { logger } from "../../logger.js";
import { v4 as uuid } from "uuid";
import { Kysely } from "kysely";
import { Database } from "../types.js";

export class ControllerRepository {
  constructor(private readonly db: Kysely<Database>) {}

  public async insertControllers(
    controllers: ControlModule[],
  ): Promise<boolean> {
    const wasInserted: boolean[] = [];

    for (let i = 0; i < controllers.length; i++) {
      const result = await this.db
        .insertInto("controllers")
        .values({
          id: uuid(),
          name: controllers[i].name,
          description: "",
          address: controllers[i].address,
        })
        .onConflict((c) =>
          c.column("name").doUpdateSet((eb) => ({
            description: eb.ref("excluded.description"),
            address: eb.ref("excluded.address"),
          })),
        )
        .executeTakeFirst()
        .catch((err) => {
          logger.error("ControllerRepository.insertControllers", err);
          throw err;
        });

      if (inserted(result)) {
        wasInserted.push(true);
      }
    }

    return wasInserted.length === controllers.length;
  }

  public async insertController(controller: ControlModule): Promise<string> {
    const id = uuid();

    const result = await this.db
      .insertInto("controllers")
      .values({
        id: id,
        name: controller.name,
        description: "",
        address: controller.address,
      })
      .executeTakeFirst()
      .catch((err) => {
        logger.error("ControllerRepository.insertController", err);
        throw err;
      });

    return inserted(result) ? id : "";
  }

  public async updateController(controller: ControlModule): Promise<boolean> {
    const result = await this.db
      .updateTable("controllers")
      .set({
        name: controller.name,
        address: controller.address,
      })
      .where("id", "=", controller.id)
      .executeTakeFirst()
      .catch((err) => {
        logger.error("ControllerRepository.updateController", err);
        throw err;
      });

    return result.numUpdatedRows > 0;
  }

  public async getControllers(): Promise<Array<ControlModule>> {
    const result = new Array<ControlModule>();

    const data = await this.db
      .selectFrom("controllers")
      .selectAll()
      .execute()
      .catch((err) => {
        logger.error("ControllerRepository.getControllers", err);
        throw err;
      });

    for (const c of data) {
      const control = new ControlModule(c.id, c.name, c.address);
      result.push(control);
    }

    return result;
  }

  public async getControllerById(id: string): Promise<ControlModule> {
    const data = await this.db
      .selectFrom("controllers")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirstOrThrow()
      .catch((err) => {
        logger.error("ControllerRepository.getControllerById", err);
        throw err;
      });

    return new ControlModule(data.id, data.name, data.address);
  }

  public async getControllerByAddress(address: string): Promise<ControlModule> {
    const data = await this.db
      .selectFrom("controllers")
      .selectAll()
      .where("address", "=", address)
      .executeTakeFirstOrThrow()
      .catch((err) => {
        logger.error("ControllerRepository.getControllerByAddress", err);
        throw err;
      });

    return new ControlModule(data.id, data.name, data.address);
  }

  public async getControllerByLocationId(
    locationId: string,
  ): Promise<ControlModule> {
    const data = await this.db
      .selectFrom("controllers")
      .leftJoin(
        "controller_locations as cl",
        "cl.controller_id",
        "controllers.id",
      )
      .selectAll()
      .where("cl.location_id", "=", locationId)
      .executeTakeFirstOrThrow()
      .catch((err) => {
        logger.error("ControllerRepository.getControllerByLocationId", err);
        throw err;
      });

    return new ControlModule(data.id, data.name, data.address);
  }
}
