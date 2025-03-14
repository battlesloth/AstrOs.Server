import { db, inserted } from "../../dal/database.js";
import { ControlModule } from "astros-common";
import { logger } from "../../logger.js";
import { v4 as uuid } from "uuid";

export class ControllerRepository {
  public async insertControllers(
    controllers: ControlModule[],
  ): Promise<boolean> {
    const wasInserted: boolean[] = [];

    for (let i = 0; i < controllers.length; i++) {
      const result = await db
        .insertInto("controllers")
        .values({
          id: uuid(),
          name: controllers[i].name,
          description: "",
          address: controllers[i].address,
        })
        .executeTakeFirst()
        .catch((err) => {
          logger.error(err);
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

    const result = await db
      .insertInto("controllers")
      .values({
        id: id,
        name: controller.name,
        description: "",
        address: controller.address,
      })
      .executeTakeFirst()
      .catch((err) => {
        logger.error(err);
        throw err;
      });

    return inserted(result) ? id : "";
  }

  public async updateController(controller: ControlModule): Promise<boolean> {
    const result = await db
      .updateTable("controllers")
      .set({
        name: controller.name,
        address: controller.address,
      })
      .where("id", "=", controller.id)
      .executeTakeFirst()
      .catch((err) => {
        logger.error(err);
        throw err;
      });

    return result.numUpdatedRows > 0;
  }

  public async getControllers(): Promise<Array<ControlModule>> {
    const result = new Array<ControlModule>();

    const data = await db
      .selectFrom("controllers")
      .selectAll()
      .execute()
      .catch((err) => {
        logger.error(err);
        throw err;
      });

    for (const c of data) {
      const control = new ControlModule(c.id, c.name, c.address);
      result.push(control);
    }

    return result;
  }

  public async getControllerById(id: string): Promise<ControlModule> {
    const data = await db
      .selectFrom("controllers")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirstOrThrow()
      .catch((err) => {
        logger.error(err);
        throw err;
      });

    return new ControlModule(data.id, data.name, data.address);
  }

  public async getControllerByAddress(address: string): Promise<ControlModule> {
    const data = await db
      .selectFrom("controllers")
      .selectAll()
      .where("address", "=", address)
      .executeTakeFirstOrThrow()
      .catch((err) => {
        logger.error(err);
        throw err;
      });

    return new ControlModule(data.id, data.name, data.address);
  }
}
