import { DataAccess } from "../../dal/data_access";
import { ScriptsTable } from "../../dal/tables/script_tables/scripts_table";
import { ScriptChannelsTable } from "../../dal/tables/script_tables/script_channels_table";
import { ScriptEventsTable } from "../../dal/tables/script_tables/script_events_table";
import {
  ChannelType,
  I2cChannel,
  Script,
  ScriptChannel,
  ScriptEvent,
  ChannelSubType,
  UploadStatus,
  DeploymentStatus,
  GpioChannel,
  MaestroChannel,
  KangarooX2Channel,
  UartModule,
} from "astros-common";
import { I2cChannelsTable } from "../tables/controller_tables/i2c_channels_table";
import { UartModuleTable } from "../tables/uart_tables/uart_module_table";
import { logger } from "../../logger";
import { Guid } from "guid-typescript";
import { ScriptsDeploymentTable } from "../tables/script_tables/scripts_deployment_table";
import { GpioChannelsTable } from "../tables/controller_tables/gpio_channels_table";
import { UartChannel } from "astros-common/dist/control_module/uart/uart_channel";
import { MaestroChannelTable } from "../tables/uart_tables/maestro_channels_table";
import { KangarooX2Table } from "../tables/uart_tables/kangaroo_x2_table";

type UartScriptChannel =
  | UartChannel
  | MaestroChannel
  | KangarooX2Channel
  | null;

export class ScriptRepository {
  private characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  dao: DataAccess;

  constructor(dao: DataAccess) {
    this.dao = dao;
    this.dao.connect();
  }

  async getScripts(): Promise<Array<Script>> {
    const result = new Array<Script>();

    await this.dao
      .get(ScriptsTable.selectAll)
      .then((val: any) => {
        val.forEach((scr: any) => {
          result.push(
            new Script(
              scr.id,
              scr.scriptName,
              scr.description,
              new Date(Date.parse(scr.lastSaved)),
            ),
          );
        });
      })
      .catch((err) => {
        logger.error(err);
        throw "error";
      });

    for (let i = 0; i < result.length; i++) {
      const scr = result[i];
      await this.dao
        .get(ScriptsDeploymentTable.selectByScript, [scr.id])
        .then((val: any) => {
          val.forEach((dep: any) => {
            const status = new DeploymentStatus(dep.locationId.toString(), {
              date: new Date(Date.parse(dep.lastDeployed)),
              value: UploadStatus.uploaded,
            });
            scr.deploymentStatusKvp.push(status);
          });
        })
        .catch((err) => {
          logger.error(err);
          throw "error";
        });
    }

    return result;
  }

  async getScript(id: string): Promise<Script> {
    let result = Script.prototype;

    await this.dao
      .get(ScriptsTable.select, [id])
      .then(async (val: any) => {
        const scr = val[0];

        result = new Script(
          scr.id,
          scr.scriptName,
          scr.description,
          new Date(Date.parse(scr.lastSaved)),
        );
      })
      .catch((err) => {
        logger.error(err);
        throw "error";
      });

    await this.dao
      .get(ScriptsDeploymentTable.selectByScript, [id])
      .then((val: any) => {
        val.forEach((dep: any) => {
          const status = new DeploymentStatus(dep.locationId, {
            date: new Date(Date.parse(dep.lastDeployed)),
            value: UploadStatus.uploaded,
          });
          result.deploymentStatusKvp.push(status);
        });
      })
      .catch((err) => {
        logger.error(err);
        throw "error";
      });

    const channels = new Array<ScriptChannel>();

    await this.dao
      .get(ScriptChannelsTable.selectAllForScript, [id])
      .then((val: any) => {
        val.forEach((ch: any) => {
          const channel = new ScriptChannel(
            ch.id,
            ch.scriptId,
            ch.locationId,
            ch.type,
            ch.subType,
            ch.channelNumber,
            null,
            0,
          );

          channels.push(channel);
        });
      })
      .catch((err) => {
        logger.error(err);
        throw "error";
      });

    for (const ch of channels) {
      const channel = await this.configScriptChannel(id, ch);
      result.scriptChannels.push(channel);
    }

    for (const ch of result.scriptChannels) {
      await this.dao
        .get(ScriptEventsTable.selectForChannel, [result.id, ch.id])
        .then((val: any) => {
          val.forEach((evt: any) => {
            const event = new ScriptEvent(
              evt.scriptChannel,
              evt.channelType,
              evt.channelSubType !== null
                ? evt.channelSubType
                : ChannelSubType.none,
              evt.time,
              evt.dataJson,
            );
            ch.eventsKvpArray.push({ key: event.time, value: event });
          });
        })
        .catch((err) => {
          logger.error(err);
          throw "error";
        });
    }

    return result;
  }

  private async configScriptChannel(
    scriptId: string,
    channel: ScriptChannel,
  ): Promise<ScriptChannel> {
    switch (channel.type) {
      case ChannelType.i2c:
        channel.channel = await this.getChannelForScriptChannel(
          ChannelType.i2c,
          channel.channelNumber,
          channel.locationId,
        );
        break;
      case ChannelType.uart:
        channel.channel = await this.getUartChannel(channel);
        break;
      case ChannelType.gpio:
        channel.channel = await this.getChannelForScriptChannel(
          ChannelType.gpio,
          channel.channelNumber,
          channel.locationId,
        );
        break;
    }

    return channel;
  }

  //#region UART channels

  private async getUartChannel(
    scriptChannel: ScriptChannel,
  ): Promise<UartScriptChannel> {
    let result: UartScriptChannel;

    switch (scriptChannel.subType) {
      case ChannelSubType.maestro:
        result = await this.getMaestroChannel(
          scriptChannel.channel.moduleId,
          scriptChannel.channel.channelId,
        );
        break;
      case ChannelSubType.kangaroo:
        result = await this.getKangarooChannel(scriptChannel.channel.moduleId);
        break;
      default:
        result = await this.getGenericSerialChannel(
          scriptChannel.channel.moduleId,
        );
        break;
    }

    return result;
  }

  private async getMaestroChannel(
    moduleId: string,
    channelId: number,
  ): Promise<MaestroChannel | null> {
    let result: MaestroChannel | null = null;
    let module: UartModule;

    await this.dao
      .get(UartModuleTable.select, [moduleId.toString()])
      .then(async (val: any) => {
        module = new UartModule(
          val[0].id,
          val[0].locationId,
          val[0].uartType,
          val[0].uartChannel,
          val[0].baudRate,
          val[0].moduleName,
        );
      })
      .catch((err) => {
        logger.error(err);
        throw "error";
      });

    await this.dao
      .get(MaestroChannelTable.select, [channelId.toString(), moduleId])
      .then((val: any) => {
        const ch = val[0];
        result = new MaestroChannel(
          ch.id,
          ch.channelName,
          ch.enabled,
          moduleId,
          ch.isServo,
          ch.minPos,
          ch.maxPos,
          ch.homePos,
          ch.inverted,
          module.uartChannel,
          module.baudRate,
        );
      })
      .catch((err) => {
        logger.error(err);
        throw "error";
      });

    return result;
  }

  private async getKangarooChannel(
    moduleId: string,
  ): Promise<KangarooX2Channel | null> {
    let result: KangarooX2Channel | null = null;
    let module: UartModule;

    await this.dao
      .get(UartModuleTable.select, [moduleId.toString()])
      .then(async (val: any) => {
        module = new UartModule(
          val[0].id,
          val[0].locationId,
          val[0].uartType,
          val[0].uartChannel,
          val[0].baudRate,
          val[0].moduleName,
        );
      })
      .catch((err) => {
        logger.error(err);
        throw "error";
      });

    await this.dao
      .get(KangarooX2Table.selectByParent, [moduleId])
      .then((val: any) => {
        const ch = val[0];
        result = new KangarooX2Channel(
          module.name,
          ch.id,
          moduleId,
          module.uartChannel,
          module.baudRate,
          ch.ch1Name,
          ch.ch2Name,
        );
      })
      .catch((err) => {
        logger.error(err);
        throw "error";
      });

    return result;
  }

  private async getGenericSerialChannel(
    moduleId: string,
  ): Promise<UartChannel | null> {
    let result: UartChannel | null = null;

    this.dao
      .get(UartModuleTable.select, [moduleId])
      .then((val: any) => {
        result = new UartChannel(
          0,
          val[0].moduleName,
          true,
          val[0].uartType,
          moduleId,
          val[0].uartChannel,
          val[0].baudRate,
        );
      })
      .catch((err) => {
        logger.error(err);
        throw "error";
      });

    return result;
  }

  //#endregion

  private async getChannelForScriptChannel(
    type: ChannelType,
    chId: number,
    locationId: number,
  ): Promise<any> {
    let result = {};

    let sql = "";

    switch (type) {
      case ChannelType.i2c:
        sql = I2cChannelsTable.select;
        break;
      case ChannelType.gpio:
        sql = GpioChannelsTable.select;
        break;
      default:
        return;
    }

    await this.dao
      .get(sql, [chId.toString(), locationId.toString()])
      .then((val: any) => {
        try {
          switch (type) {
            case ChannelType.gpio:
              result = new GpioChannel(
                val[0].channelId,
                val[0].channelName,
                val[0].defaultLow,
                val[0].enabled,
              );
              break;
            case ChannelType.i2c:
              result = new I2cChannel(
                val[0].channelId,
                val[0].channelName,
                val[0].enabled,
              );
              break;
          }
        } catch (error) {
          logger.error(error);
        }
      })
      .catch((err) => {
        logger.error(err);
        throw "error";
      });

    return result;
  }

  async updateScriptControllerUploaded(
    scriptId: string,
    locationId: number,
    dateTime: Date,
  ): Promise<boolean> {
    let success = true;

    await this.dao
      .run(ScriptsDeploymentTable.insert, [
        scriptId,
        locationId.toString(),
        dateTime.toISOString(),
      ])
      .catch((err: any) => {
        logger.error(
          `Exception updating script upload for controller: ${locationId} => ${err}`,
        );
        success = false;
      });

    return success;
  }

  async getLastScriptUploadedDate(
    scriptId: string,
    locationId: number,
  ): Promise<Date> {
    let result = new Date("1970-01-01T00:00:00.000Z");

    await this.dao
      .get(ScriptsDeploymentTable.getDateByScriptAndController, [
        scriptId,
        locationId.toString(),
      ])
      .then((val: any) => {
        if (val.length > 0) {
          result = new Date(Date.parse(val[0].lastDeployed));
        }
      })
      .catch((err: any) => {
        logger.error(
          `Exception getting last script uploaded date for controller: ${locationId} => ${err}`,
        );
      });

    return result;
  }

  async saveScript(script: Script): Promise<boolean> {
    await this.dao.run("BEGIN TRANSACTION", []);

    const date = new Date().toISOString();
    try {
      await this.dao
        .run(ScriptsTable.insert, [
          script.id,
          script.scriptName,
          script.description,
          date,
        ])
        .then((val: any) => {
          if (val) {
            logger.info(val);
          }
        });

      await this.dao
        .run(ScriptChannelsTable.deleteAllForScript, [script.id])
        .then((val: any) => {
          if (val) {
            logger.info(val);
          }
        });

      await this.dao
        .run(ScriptEventsTable.deleteAllForScript, [script.id])
        .then((val: any) => {
          if (val) {
            logger.info(val);
          }
        });

      for (let i = 0; i < script.scriptChannels.length; i++) {
        const ch = script.scriptChannels[i];

        await this.dao
          .run(ScriptChannelsTable.insert, [
            ch.id,
            script.id,
            ch.locationId.toString(),
            ch.type.toString(),
            ch.subType.toString(),
            ch.channelNumber.toString(),
          ])
          .then((val: any) => {
            if (val) {
              logger.info(val);
            }
          });

        for (let j = 0; j < ch.eventsKvpArray.length; j++) {
          const evt = ch.eventsKvpArray[j].value;

          if (evt) {
            await this.dao
              .run(ScriptEventsTable.insert, [
                script.id,
                evt.scriptChannel,
                evt.channelType.toString(),
                evt.channelSubType.toString(),
                evt.time.toString(),
                evt.dataJson,
              ])
              .then((val: any) => {
                if (val) {
                  logger.info(val);
                }
              });
          }
        }
      }

      await this.dao.run("COMMIT", []);
    } catch (err) {
      logger.error(`Error Saving script: ${err}`);
      await this.dao.run("ROLLBACK", []);
      return false;
    }

    return true;
  }

  async deleteScript(id: string): Promise<boolean> {
    let success = true;
    const sql = ScriptsTable.disableScript;

    await this.dao.run(sql, [id]).catch((err: any) => {
      logger.error(`Exception disabling script for ${id} => ${err}`);
      success = false;
    });

    return success;
  }

  async copyScript(id: string): Promise<Script> {
    let result = Script.prototype;

    const script = await this.getScript(id);

    script.id = this.generateScriptId(5);
    script.scriptName = script.scriptName + " - copy";
    for (const ch of script.scriptChannels) {
      ch.id = Guid.create().toString();
      for (const kvp of ch.eventsKvpArray) {
        kvp.value.scriptChannel = ch.id;
      }
    }
    script.deploymentStatusKvp = new Array<DeploymentStatus>();
    script.lastSaved = new Date();

    await this.saveScript(script).catch((err: any) => {
      logger.error(`Exception saving copy script for ${id} => ${err}`);
    });

    result = new Script(
      script.id,
      script.scriptName,
      script.description,
      new Date(script.lastSaved),
    );

    return result;
  }

  private generateScriptId(length: number): string {
    let result = `s${Math.floor(Date.now() / 1000)}`;
    const charactersLength = this.characters.length;
    for (let i = 0; i < length; i++) {
      result += this.characters.charAt(
        Math.floor(Math.random() * charactersLength),
      );
    }
    return result;
  }
}
