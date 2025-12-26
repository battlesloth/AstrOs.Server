import { Kysely, Transaction } from "kysely";
import { Database, UartModule as UartModuleRow } from "../../types.js";
import { logger } from "../../../logger.js";
import {
  HumanCyborgRelationsModule,
  KangarooX2,
  KangarooX2Channel,
  MaestroBoard,
  MaestroChannel,
  MaestroModule,
  ModuleSubType,
  UartModule,
  UartChannel,
} from "astros-common";

//#region Uart Modules
export async function getUartModules(
  db: Kysely<Database>,
  locationId: string,
): Promise<UartModule[]> {
  const modules: UartModule[] = [];

  const uartData = await db
    .selectFrom("uart_modules")
    .selectAll()
    .where("location_id", "=", locationId)
    .orderBy("name")
    .execute()
    .catch((err) => {
      logger.error("UartRepository.getUartModules", err);
      throw err;
    });

  uartData.map((m: UartModuleRow) => {
    modules.push(
      new UartModule(
        m.idx,
        m.id,
        m.name,
        m.location_id,
        m.uart_type,
        m.uart_channel,
        m.baud_rate,
      ),
    );
  });

  for (const uart of modules) {
    switch (uart.moduleSubType) {
      case ModuleSubType.humanCyborgRelationsSerial:
        uart.subModule = new HumanCyborgRelationsModule();
        break;
      case ModuleSubType.kangaroo:
        uart.subModule = await loadKangarooModule(db, uart.id);
        break;
      case ModuleSubType.maestro:
        uart.subModule = await loadMaestroModule(db, uart);
        break;
      default:
        uart.subModule = {};
        break;
    }
  }

  return modules;
}

export async function upsertUartModules(
  trx: Transaction<Database>,
  modules: UartModule[],
): Promise<void> {
  for (const uart of modules) {
    logger.info(
      `Upserting uart module ${uart.name}, id: ${uart.id}, type: ${uart.moduleSubType}`,
    );

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
        logger.error("UartRepository.upsertUartModules", err);
        throw err;
      });

    switch (uart.moduleSubType) {
      case ModuleSubType.kangaroo:
        await upsertKangarooModule(trx, uart.id, uart.subModule as KangarooX2);
        break;
      case ModuleSubType.maestro:
        await upsertMaestroModule(
          trx,
          uart.id,
          uart.subModule as MaestroModule,
        );
        break;
    }
  }
}

export async function removeStaleUartModules(
  trx: Transaction<Database>,
  locationId: string,
  currentMods: Array<string>,
): Promise<void> {
  const uartMods = await trx
    .selectFrom("uart_modules")
    .selectAll()
    .where("location_id", "=", locationId)
    .execute()
    .catch((err) => {
      logger.error("UartRepository.removeStaleUartModules", err);
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
        await deleteKangarooModule(trx, uartMod.id);
        break;
      case ModuleSubType.maestro:
        await deleteMaestroModule(trx, uartMod.id);
        break;
      default:
        break;
    }

    await trx
      .deleteFrom("uart_modules")
      .where("id", "=", uartMod.id)
      .execute()
      .catch((err) => {
        logger.error("UartRepository.removeStaleUartModules", err);
        throw err;
      });
  }
}
//#endregion

//#region Generic Uart

export async function readUartChannel(
  db: Kysely<Database>,
  id: string,
): Promise<UartChannel> {
  const channel = await db
    .selectFrom("uart_modules")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirstOrThrow()
    .catch((err) => {
      logger.error("UartRepository.readUartChannel", err);
      throw err;
    });

  return new UartChannel(
    channel.id,
    channel.id,
    channel.name,
    channel.uart_type,
    true,
  );
}

//#endregion

//#region KangarooX2

async function upsertKangarooModule(
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
    .onConflict((c) =>
      c.column("id").doUpdateSet((eb) => ({
        ch1_name: eb.ref("excluded.ch1_name"),
        ch2_name: eb.ref("excluded.ch2_name"),
      })),
    )
    .executeTakeFirst()
    .catch((err) => {
      logger.error("UartRepository.upsertKangarooModule", err);
      throw err;
    });
}

async function loadKangarooModule(
  db: Kysely<Database>,
  uartId: string,
): Promise<KangarooX2> {
  const data = await db
    .selectFrom("kangaroo_x2")
    .selectAll()
    .where("parent_id", "=", uartId)
    .executeTakeFirstOrThrow()
    .catch((err) => {
      logger.error("UartRepository.loadKangarooModule", err);
      throw err;
    });

  return new KangarooX2(data.id, data.ch1_name, data.ch2_name);
}

async function deleteKangarooModule(
  trx: Transaction<Database>,
  parentId: string,
): Promise<void> {
  await trx
    .deleteFrom("kangaroo_x2")
    .where("parent_id", "=", parentId)
    .execute()
    .catch((err) => {
      logger.error("UartRepository.deleteKangarooModule", err);
      throw err;
    });
}

export async function readKangarooChannel(
  db: Kysely<Database>,
  id: string,
): Promise<KangarooX2Channel> {
  const channel = await db
    .selectFrom("kangaroo_x2")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirstOrThrow()
    .catch((err) => {
      logger.error("UartRepository.readKangarooChannel", err);
      throw err;
    });

  return new KangarooX2Channel(
    channel.id,
    channel.parent_id,
    "",
    channel.ch1_name,
    channel.ch2_name,
  );
}
//#endregion

//#region Maestro

async function upsertMaestroModule(
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
      .onConflict((c) =>
        c.column("id").doUpdateSet((eb) => ({
          name: eb.ref("excluded.name"),
          channel_count: eb.ref("excluded.channel_count"),
        })),
      )
      .executeTakeFirst()
      .catch((err) => {
        logger.error("UartRepository.upsertMaestroModule", err);
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
        .onConflict((c) =>
          c.column("id").doUpdateSet((eb) => ({
            board_id: eb.ref("excluded.board_id"),
            channel_number: eb.ref("excluded.channel_number"),
            name: eb.ref("excluded.name"),
            enabled: eb.ref("excluded.enabled"),
            is_servo: eb.ref("excluded.is_servo"),
            min_pos: eb.ref("excluded.min_pos"),
            max_pos: eb.ref("excluded.max_pos"),
            home_pos: eb.ref("excluded.home_pos"),
            inverted: eb.ref("excluded.inverted"),
          })),
        )
        .executeTakeFirst()
        .catch((err) => {
          logger.error("UartRepository.upsertMaestroModule", err);
          throw err;
        });
    }
  }
}

async function loadMaestroModule(
  db: Kysely<Database>,
  uartMod: UartModule,
): Promise<MaestroModule> {
  const module = new MaestroModule();

  const boards = await db
    .selectFrom("maestro_boards")
    .selectAll()
    .where("parent_id", "=", uartMod.id)
    .orderBy("board_id")
    .execute()
    .catch((err) => {
      logger.error("UartRepository.loadMaestroModule", err);
      throw err;
    });

  for (const b of boards) {
    module.boards.push(
      new MaestroBoard(b.id, b.parent_id, b.board_id, b.name, b.channel_count),
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
        logger.error("UartRepository.loadMaestroModule", err);
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

async function deleteMaestroModule(
  trx: Transaction<Database>,
  parentId: string,
): Promise<void> {
  const boardIds = await trx
    .selectFrom("maestro_boards")
    .select("id")
    .where("parent_id", "=", parentId)
    .execute()
    .catch((err) => {
      logger.error("UartRepository.deleteMaestroModule", err);
      throw err;
    });

  for (const id of boardIds) {
    await trx
      .deleteFrom("maestro_channels")
      .where("board_id", "=", id.id)
      .execute()
      .catch((err) => {
        logger.error("UartRepository.deleteMaestroModule", err);
        throw err;
      });
  }

  await trx
    .deleteFrom("maestro_boards")
    .where("parent_id", "=", parentId)
    .execute()
    .catch((err) => {
      logger.error("UartRepository.deleteMaestroModule", err);
      throw err;
    });
}

export async function readMaestroChannel(
  db: Kysely<Database>,
  id: string,
): Promise<MaestroChannel> {
  const channel = await db
    .selectFrom("maestro_channels")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirstOrThrow()
    .catch((err) => {
      logger.error("UartRepository.readMaestroChannel", err);
      throw err;
    });

  return new MaestroChannel(
    channel.id,
    channel.board_id,
    channel.name,
    channel.enabled > 0,
    channel.channel_number,
    channel.is_servo > 0,
    channel.min_pos,
    channel.max_pos,
    channel.home_pos,
    channel.inverted > 0,
  );
}

//#endregion
