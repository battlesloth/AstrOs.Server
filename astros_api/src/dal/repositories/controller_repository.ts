import { DataAccess } from "../../dal/data_access";
import {
    ControlModule,
    ServoChannel,
    I2cChannel,
    UartModule,
    UartChannel,
} from "astros-common";
import { ControllersTable } from "../../dal/tables/controllers_table";
import { ServoChannelsTable } from "../../dal/tables/servo_channels_table";
import { I2cChannelsTable } from "../../dal/tables/i2c_channels_table";
import { UartModuleTable } from "../tables/uart_module_table";
import { logger } from "../../logger";

export class ControllerRepository {
    dao: DataAccess;

    constructor(dao: DataAccess) {
        this.dao = dao;
        this.dao.connect();
    }

    public async getControllerNameAndAddress(
        controllerId: number
    ): Promise<[string, string]> {
        const result: [string, string] = ["", ""];

        await this.dao
            .get(ControllersTable.getNameAndAddress, [controllerId.toString()])
            .then((val: any) => {
                result.push(val[0].controllerName, val[0].controllerAddress);
            })
            .catch((err: any) => {
                logger.error(err);
                throw "error";
            });

        return result;
    }

    public async getControllerData(): Promise<Array<ControlModule>> {
        const result = new Array<ControlModule>();
        await this.dao
            .get(ControllersTable.selectAll, [])
            .then((val: any) => {
                for (const c of val) {
                    const control = new ControlModule(
                        c.id,
                        c.controllerLocation,
                        c.controllerName,
                        c.controllerDescription,
                        c.controllerAddress,
                        c.fingerprint
                    );
                    result.push(control);
                }
            })
            .catch((err: any) => {
                logger.error(err);
                throw "error";
            });

        return result;
    }

    public async getControllers(): Promise<Array<ControlModule>> {
        const result = new Array<ControlModule>();

        await this.dao
            .get(ControllersTable.selectAll, [])
            .then((val: any) => {
                for (const c of val) {
                    const control = new ControlModule(
                        c.id,
                        c.controllerLocation,
                        c.controllerName,
                        c.controllerDescription,
                        c.controllerAddress,
                        c.fingerprint
                    );
                    result.push(control);
                }
            })
            .catch((err: any) => {
                logger.error(err);
                throw "error";
            });

        for (const ctl of result) {
            ctl.uartModule = new UartModule();

            await this.dao
                .get(UartModuleTable.select, [ctl.id.toString(), "1"])
                .then((val: any) => {
                    const uart = new UartChannel(
                        val[0].uartType,
                        1,
                        val[0].moduleName,
                        JSON.parse(val[0].moduleJson)
                    );
                    ctl.uartModule.channels.push(uart);
                })
                .catch((err: any) => {
                    logger.error(err);
                    throw "error";
                });

            await this.dao
                .get(UartModuleTable.select, [ctl.id.toString(), "2"])
                .then((val: any) => {
                    const uart = new UartChannel(
                        val[0].uartType,
                        2,
                        val[0].moduleName,
                        JSON.parse(val[0].moduleJson)
                    );
                    ctl.uartModule.channels.push(uart);
                })
                .catch((err: any) => {
                    logger.error(err);
                    throw "error";
                });

            await this.dao
                .get(UartModuleTable.select, [ctl.id.toString(), "3"])
                .then((val: any) => {
                    const uart = new UartChannel(
                        val[0].uartType,
                        2,
                        val[0].moduleName,
                        JSON.parse(val[0].moduleJson)
                    );
                    ctl.uartModule.channels.push(uart);
                })
                .catch((err: any) => {
                    logger.error(err);
                    throw "error";
                });

            await this.dao
                .get(ServoChannelsTable.selectAll, [ctl.id.toString()])
                .then((val: any) => {
                    val.forEach((ch: any) => {
                        ctl.servoModule.channels[ch.channelId] = new ServoChannel(
                            ch.channelId,
                            ch.channelName,
                            ch.enabled,
                            ch.minPos,
                            ch.maxPos,
                            ch.inverted
                        );
                    });
                })
                .catch((err: any) => {
                    logger.error(err);
                    throw "error";
                });

            await this.dao
                .get(I2cChannelsTable.selectAll, [ctl.id.toString()])
                .then((val: any) => {
                    val.forEach((ch: any) => {
                        ctl.i2cModule.channels[ch.channelId] = new I2cChannel(
                            ch.channelId,
                            ch.channelName,
                            ch.enabled
                        );
                    });
                })
                .catch((err) => {
                    logger.error(err);
                    throw "error";
                });
        }

        return result;
    }

    public async saveControllers(controllers: Array<ControlModule>): Promise<boolean> {
        for (const ctl of controllers) {
            await this.dao
                .run(ControllersTable.update, [
                    ctl.location,
                    ctl.name,
                    ctl.description,
                    ctl.address,
                    ctl.fingerprint,
                    ctl.id.toString(),
                ])
                .catch((err: any) => {
                    logger.error(err);
                    throw "error";
                });

            // TODO: only wipe fingerprint if there are changes to uart/servo/i2c
            await this.dao
                .run(ControllersTable.updateFingerprint, ["", ctl.id.toString()])
                .catch((err: any) => {
                    logger.error(err);
                    throw "error";
                });

            for (const uart of ctl.uartModule.channels) {
                await this.dao
                    .run(UartModuleTable.update, [
                        uart.type.toString(),
                        uart.channelName,
                        JSON.stringify(uart.module),
                        uart.id.toString(),
                        ctl.id.toString()
                    ])
                    .catch((err: any) => {
                        logger.error(err);
                        throw "error";
                    });
            }

            for (const servo of ctl.servoModule.channels) {
                await this.dao
                    .run(ServoChannelsTable.update, [
                        servo.channelName,
                        servo.enabled ? "1" : "0",
                        servo.minPos.toString(),
                        servo.maxPos.toString(),
                        servo.inverted ? "1" : "0",
                        servo.id.toString(),
                        ctl.id.toString(),
                    ])
                    .catch((err: any) => {
                        logger.error(err);
                        throw "error";
                    });
            }

            for (const i2c of ctl.i2cModule.channels) {
                await this.dao
                    .run(I2cChannelsTable.update, [
                        i2c.channelName,
                        i2c.enabled ? "1" : "0",
                        i2c.id.toString(),
                        ctl.id.toString(),
                    ])
                    .catch((err: any) => {
                        logger.error(err);
                        throw "error";
                    });
            }

            logger.info(`Updated controller ${ctl.id}`);
        }

        return true;
    }

    public async updateControllerNameAndAddress(
        id: number,
        name: string,
        address: string
    ): Promise<boolean> {
        await this.dao
            .run(ControllersTable.updateNameAndAddress, [name, address, id.toString()])
            .catch((err: any) => {
                logger.error(err);
                return false;
            });

        return true;
    }

    public async updateControllerFingerprint(
        id: number,
        fingerprint: string
    ): Promise<boolean> {
        await this.dao
            .run(ControllersTable.updateFingerprint, [
                fingerprint,
                id.toString(),
            ])
            .catch((err: any) => {
                logger.error(err);
                return false;
            });

        return true;
    }
}
