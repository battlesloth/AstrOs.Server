import { logger } from "../../logger";
import { DataAccess } from "../data_access";
import { LocationsTable } from "../tables/controller_tables/locations_table";
import { ControllerLocationTable } from "../tables/controller_tables/controller_location_table";
import {
  ControlModule,
  ControllerLocation,
  GpioChannel,
  HumanCyborgRelationsModule,
  I2cChannel,
  KangarooX2,
  MaestroBoard,
  MaestroChannel,
  MaestroModule,
  UartModule,
  UartType,
} from "astros-common";
import { UartModuleTable } from "../tables/uart_tables/uart_module_table";
import { I2cChannelsTable } from "../tables/controller_tables/i2c_channels_table";
import { GpioChannelsTable } from "../tables/controller_tables/gpio_channels_table";
import { MaestroBoardsTable } from "../tables/uart_tables/maestro_boards_table";
import { MaestroChannelTable } from "../tables/uart_tables/maestro_channels_table";
import { KangarooX2Table } from "../tables/uart_tables/kangaroo_x2_table";

interface UartMods {
  id: string;
  type: number;
}

export class LocationsRepository {
  dao: DataAccess;

  constructor(dao: DataAccess) {
    this.dao = dao;
    this.dao.connect();
  }

  public async getLocations(): Promise<Array<ControllerLocation>> {
    const result = new Array<ControllerLocation>();
    await this.dao
      .get(LocationsTable.selectAll, [])
      .then((val: any) => {
        for (const c of val) {
          const location = new ControllerLocation(
            c.id,
            c.name,
            c.description,
            c.configFingerprint,
          );
          result.push(location);
        }
      })
      .catch((err: any) => {
        logger.error(err);
        throw "error";
      });

    return result;
  }

  public async getLocationByController(
    id: number,
  ): Promise<ControllerLocation | null> {
    let location = null;

    await this.dao
      .get(ControllerLocationTable.selectLocationByController, [id.toString()])
      .then((val: any) => {
        if (val.length > 0) {
          location = new ControllerLocation(
            val[0].id,
            val[0].locationName,
            val[0].locationDescription,
            val[0].configFingerprint,
          );
        }
      })
      .catch((err: any) => {
        logger.error(err);
        throw err;
      });

    return location;
  }

  public async getLocationIdByController(mac: string): Promise<number> {
    let locationId = -1;

    await this.dao
      .get(ControllerLocationTable.selectLocationIdByControllerAddress, [mac])
      .then((val: any) => {
        if (val.length > 0) {
          locationId = val[0].locationId;
        }
      })
      .catch((err: any) => {
        logger.error(err);
        throw err;
      });

    return locationId;
  }

  public async loadLocations(): Promise<Array<ControllerLocation>> {
    const result = new Array<ControllerLocation>();
    await this.dao
      .get(ControllerLocationTable.selectLocationControllers, [])
      .then((val: any) => {
        for (const c of val) {
          const location = new ControllerLocation(
            c.locationId,
            c.locationName,
            c.locationDescription,
            c.configFingerprint,
          );

          if (c.controllerId !== null && c.controllerId !== undefined) {
            location.controller = new ControlModule(
              c.controllerId,
              c.controllerName,
              c.controllerAddress,
            );
          }

          result.push(location);
        }
      })
      .catch((err: any) => {
        logger.error(err);
        throw "error";
      });

    for (let i = 0; i < result.length; i++) {
      await this.loadLocationConfiguration(result[i]);
    }

    return result;
  }

  public async loadLocationConfiguration(
    location: ControllerLocation,
  ): Promise<ControllerLocation> {
    // load uart modules
    await this.dao
      .get(UartModuleTable.selectAllForLocation, [location.id.toString()])
      .then((val: any) => {
        val.forEach((uart: any) => {
          const module = new UartModule(
            uart.id,
            location.id,
            uart.uartType,
            uart.uartChannel,
            uart.baudRate,
            uart.moduleName,
          );
          location.uartModules.push(module);
        });
      })
      .catch((err: any) => {
        logger.error(err);
        throw "error";
      });

    for (const uart of location.uartModules) {
      switch (uart.uartType) {
        case UartType.humanCyborgRelations:
          uart.subModule = new HumanCyborgRelationsModule();
          break;
        case UartType.kangaroo:
          uart.subModule = await this.loadKangarooModule(uart.id);
          break;
        case UartType.maestro:
          uart.subModule = await this.loadMaestroModule(uart);
          break;
        default:
          uart.subModule = {};
          break;
      }
    }

    await this.dao
      .get(I2cChannelsTable.selectAll, [location.id.toString()])
      .then((val: any) => {
        val.forEach((ch: any) => {
          location.i2cModule.channels[ch.channelId] = new I2cChannel(
            ch.channelId,
            ch.channelName,
            ch.enabled,
          );
        });
      })
      .catch((err) => {
        logger.error(err);
        throw "error";
      });

    await this.dao
      .get(GpioChannelsTable.selectAll, [location.id.toString()])
      .then((val: any) => {
        val.forEach((ch: any) => {
          location.gpioModule.channels[ch.channelId] = new GpioChannel(
            ch.channelId,
            ch.channelName,
            ch.defaultLow,
            ch.enabled,
          );
        });
      });

    return location;
  }

  public async updateLocation(location: ControllerLocation): Promise<boolean> {
    await this.dao
      .run(LocationsTable.updateFingerprint, [
        // TODO: only wipe fingerprint if there are changes to uart/servo/i2c
        //location.configFingerprint,
        "outofdate",
        location.id.toString(),
      ])
      .catch((err: any) => {
        logger.error(err);
        throw "error";
      });

    if (location.controller !== undefined && location.controller !== null) {
      await this.setLocationController(
        location.id,
        location.controller?.id || 0,
      );
    }

    await this.removeStaleUartModules(
      location.id,
      location.uartModules.map((m) => m.id),
    );

    for (const uart of location.uartModules) {
      switch (uart.uartType) {
        case UartType.kangaroo:
          await this.insertKangarooModule(
            uart.id,
            uart.subModule as KangarooX2,
          );
          break;
        case UartType.maestro:
          await this.insertMaestroModule(
            uart.id,
            uart.subModule as MaestroModule,
          );
          break;
      }

      await this.dao
        .run(UartModuleTable.insert, [
          uart.id,
          uart.locationId.toString(),
          uart.uartChannel.toString(),
          uart.baudRate.toString(),
          uart.name,
        ])
        .catch((err: any) => {
          logger.error(err);
          throw "error";
        });
    }

    for (const i2c of location.i2cModule.channels) {
      await this.dao
        .run(I2cChannelsTable.update, [
          i2c.channelName,
          i2c.enabled ? "1" : "0",
          i2c.id.toString(),
          location.id.toString(),
        ])
        .catch((err: any) => {
          logger.error(err);
          throw "error";
        });
    }

    for (const gpio of location.gpioModule.channels) {
      await this.dao
        .run(GpioChannelsTable.update, [
          gpio.channelName,
          gpio.defaultLow ? "1" : "0",
          gpio.enabled ? "1" : "0",
          gpio.id.toString(),
          location.id.toString(),
        ])
        .catch((err: any) => {
          logger.error(err);
          throw "error";
        });
    }

    logger.info(`Updated location ${location.id}`);

    return true;
  }

  public async setLocationController(
    locationId: number,
    controllerId: number,
  ): Promise<boolean> {
    await this.dao
      .run(ControllerLocationTable.delete, [
        locationId.toString(),
        controllerId.toString(),
      ])
      .catch((err: any) => {
        logger.error(err);
        throw "error";
      });

    await this.dao
      .run(ControllerLocationTable.insert, [
        locationId.toString(),
        controllerId.toString(),
      ])
      .catch((err: any) => {
        logger.error(err);
        throw "error";
      });

    return true;
  }

  public async updateLocationFingerprint(
    locationId: number,
    fingerprint: string,
  ): Promise<boolean> {
    await this.dao
      .run(LocationsTable.updateFingerprint, [
        fingerprint,
        locationId.toString(),
      ])
      .catch((err: any) => {
        logger.error(err);
        throw "error";
      });

    return true;
  }

  //#region Utility methods
  private async removeStaleUartModules(
    locationId: number,
    currentMods: Array<string>,
  ) {
    const uartMods = new Array<UartMods>();

    this.dao
      .get(UartModuleTable.selectAllForLocation, [locationId.toString()])
      .then((val: any) => {
        for (const m of val) {
          uartMods.push({ id: m.id, type: m.uartType });
        }
      })
      .catch((err: any) => {
        logger.error(err);
        throw "error";
      });

    for (const uartMod of uartMods) {
      if (currentMods.includes(uartMod.id)) {
        continue;
      }

      switch (uartMod.type) {
        case UartType.kangaroo:
          await this.deleteKangarooModule(uartMod.id);
          break;
        case UartType.maestro:
          await this.deleteMaestroModule(uartMod.id);
          break;
        default:
          break;
      }

      await this.dao
        .run(UartModuleTable.delete, [uartMod.id])
        .catch((err: any) => {
          logger.error(err);
          throw err;
        });
    }
  }

  //#endregion

  //#region KangarooX2 methods

  private async insertKangarooModule(
    parentId: string,
    module: KangarooX2,
  ): Promise<void> {
    await this.dao
      .run(KangarooX2Table.insert, [
        module.id,
        parentId,
        module.ch1Name,
        module.ch2Name,
      ])
      .catch((err: any) => {
        logger.error(err);
        throw "error";
      });
  }

  private async loadKangarooModule(uartId: string): Promise<KangarooX2 | null> {
    let module = null;

    await this.dao
      .get(KangarooX2Table.selectByParent, [uartId])
      .then((val: any) => {
        module = new KangarooX2(val[0].id, val[0].ch1Name, val[0].ch2Name);
      })
      .catch((err: any) => {
        logger.error(err);
        throw "error";
      });

    return module;
  }

  private async deleteKangarooModule(parentId: string): Promise<void> {
    await this.dao
      .run(KangarooX2Table.deleteByParent, [parentId])
      .catch((err: any) => {
        logger.error(err);
        throw err;
      });
  }

  //#endregion

  //#region Maestro methods

  private async insertMaestroModule(
    parentId: string,
    module: MaestroModule,
  ): Promise<void> {
    for (const board of module.boards) {
      await this.dao
        .run(MaestroBoardsTable.insert, [
          board.id,
          parentId,
          board.boardId.toString(),
          board.name,
        ])
        .catch((err: any) => {
          logger.error(err);
          throw "error";
        });

      for (const channel of board.channels) {
        await this.dao
          .run(MaestroChannelTable.insert, [
            channel.id.toString(),
            board.id,
            channel.channelName,
            channel.enabled ? "1" : "0",
            channel.isServo ? "1" : "0",
            channel.minPos.toString(),
            channel.maxPos.toString(),
            channel.homePos.toString(),
            channel.inverted ? "1" : "0",
          ])
          .catch((err: any) => {
            logger.error(err);
            throw "error";
          });
      }
    }
  }

  private async loadMaestroModule(uartMod: UartModule): Promise<MaestroModule> {
    const module = new MaestroModule();

    await this.dao
      .get(MaestroBoardsTable.selectAllForParent, [uartMod.id])
      .then((val: any) => {
        for (const b of val) {
          const board = new MaestroBoard(b.id, b.boardId, b.boardName);
          module.boards.push(board);
        }
      })
      .catch((err: any) => {
        logger.error(err);
        throw "error";
      });

    for (const board of module.boards) {
      await this.dao
        .get(MaestroChannelTable.selectAllForBoard, [board.id])
        .then((val: any) => {
          for (const c of val) {
            const ch = new MaestroChannel(
              c.id,
              c.channelName,
              c.enabled,
              board.id,
              c.isServo,
              c.minPos,
              c.maxPos,
              c.homePos,
              c.inverted,
              uartMod.uartChannel,
              uartMod.baudRate,
            );

            board.channels.push(ch);
          }
        })
        .catch((err: any) => {
          logger.error(err);
          throw "error";
        });
    }

    return module;
  }

  private async deleteMaestroModule(parentId: string): Promise<void> {
    const boardIds = new Array<string>();

    await this.dao
      .get(MaestroBoardsTable.selectIdsForParent, [parentId])
      .then((val: any) => {
        for (const v of val) {
          boardIds.push(v);
        }
      })
      .catch((err: any) => {
        logger.error(err);
        throw err;
      });

    for (const id of boardIds) {
      await this.dao
        .run(MaestroChannelTable.deleteByBoardId, [id])
        .catch((err: any) => {
          logger.error(err);
          throw err;
        });
    }

    await this.dao
      .run(MaestroBoardsTable.deleteByParent, [parentId])
      .catch((err: any) => {
        logger.error(err);
        throw err;
      });
  }

  //#endregion
}
