import { DataAccess } from "../../dal/data_access";
import { ControlModule, ControllerType, ServoChannel, I2cChannel, UartModule, AudioModule, AudioModuleType, UartChannel } from "astros-common";
import { ControllersTable } from "../../dal/tables/controllers_table";
import { ServoChannelsTable } from "../../dal/tables/servo_channels_table";
import { I2cChannelsTable } from "../../dal/tables/i2c_channels_table";
import { UartModuleTable } from "../tables/uart_module_table";
import { logger } from "../../logger";
import { AudioModuleTable } from "../tables/audio_module_table";

export class ControllerRepository {

    dao: DataAccess;

    constructor(dao: DataAccess) {
        this.dao = dao;
        this.dao.connect();
    }

    public async getControllerIp(controller: ControllerType): Promise<string> {
        let result = '';

        await this.dao.get(ControllersTable.getIp, [controller.toString()])
            .then((val: any) => {
                result = val[0].controllerIp
            })
            .catch((err: any) => {
                logger.error(err);
                throw 'error';
            });

        return result;
    }

    public async getControllerData(): Promise<Array<ControlModule>> {
        const result = new Array<ControlModule>();

        const controllers = [ControllerType.core, ControllerType.dome, ControllerType.body];

        for (const ctl of controllers) {

            const controller = new ControlModule(ctl, "", "00000000-0000-0000-0000-000000000000");

            await this.dao.get(ControllersTable.select, [ctl.toString()])
                .then((val: any) => {
                    controller.name = val[0].controllerName;
                    controller.ipAddress = val[0].controllerIp;
                    controller.fingerprint = val[0].fingerprint;
                })
                .catch((err: any) => {
                    logger.error(err);
                    throw 'error';
                });

            result.push(controller);
        }

        return result;
    }

    public async getControllers(): Promise<Array<ControlModule>> {
        const result = new Array<ControlModule>();

        const controllers = [ControllerType.core, ControllerType.dome, ControllerType.body];

        for (const ctl of controllers) {

            const controller = new ControlModule(ctl, "", "00000000-0000-0000-0000-000000000000");

            await this.dao.get(ControllersTable.select, [ctl.toString()])
                .then((val: any) => {
                    controller.name = val[0].controllerName;
                    controller.ipAddress = val[0].controllerIp;
                    controller.fingerprint = val[0].fingerprint;
                })
                .catch((err: any) => {
                    logger.error(err);
                    throw 'error';
                });

            controller.uartModule = new UartModule();

            await this.dao.get(UartModuleTable.select, [ctl.toString(), '1'])
                .then((val: any) => {

                    const uart = new UartChannel(val[0].uartType, 1, val[0].moduleName, JSON.parse(val[0].moduleJson));
                    controller.uartModule.channels.push(uart);
                })
                .catch((err: any) => {
                    logger.error(err);
                    throw 'error';
                });

            await this.dao.get(UartModuleTable.select, [ctl.toString(), '2'])
                .then((val: any) => {

                    const uart = new UartChannel(val[0].uartType, 2, val[0].moduleName, JSON.parse(val[0].moduleJson));
                    controller.uartModule.channels.push(uart);
                })
                .catch((err: any) => {
                    logger.error(err);
                    throw 'error';
                });

            await this.dao.get(ServoChannelsTable.selectAll, [ctl.toString()])
                .then((val: any) => {
                    val.forEach((ch: any) => {
                        controller.servoModule.channels[ch.channelId] =
                            new ServoChannel(ch.channelId, ch.channelName, ch.enabled, ch.minPos, ch.maxPos, ch.inverted);
                    });
                })
                .catch((err: any) => {
                    logger.error(err);
                    throw 'error';
                });

            await this.dao.get(I2cChannelsTable.selectAll, [ctl.toString()])
                .then((val: any) => {
                    val.forEach((ch: any) => {
                        controller.i2cModule.channels[ch.channelId] =
                            new I2cChannel(ch.channelId, ch.channelName, ch.enabled);
                    });
                })
                .catch((err) => {
                    logger.error(err);
                    throw 'error';
                });

            result.push(controller);
        }

        return result;
    }

    public async saveControllers(controllers: Array<ControlModule>): Promise<boolean> {

        for (const ctl of controllers) {

            await this.dao.run(ControllersTable.updateIp, [ctl.ipAddress, ctl.id.toString()])
                .catch((err: any) => {
                    logger.error(err);
                    throw 'error';
                });

            // TODO: only wipe fingerprint if there are changes to uart/servo/i2c
            await this.dao.run(ControllersTable.updateFingerprint, ['', ctl.id.toString()])
                .catch((err: any) => {
                    logger.error(err);
                    throw 'error';
                });

            for (const uart of ctl.uartModule.channels){

                await this.dao.run(UartModuleTable.update, [uart.type.toString(),
                uart.channelName, JSON.stringify(uart.module), ctl.id.toString(), uart.id.toString()])
                    .catch((err: any) => {
                        logger.error(err);
                        throw 'error';
                    })
    
            }

            for (const servo of ctl.servoModule.channels) {

                await this.dao.run(ServoChannelsTable.update, [servo.channelName, servo.enabled ? '1' : '0',
                servo.minPos.toString(), servo.maxPos.toString(), servo.inverted ? '1' : '0', servo.id.toString(), ctl.id.toString()])
                    .catch((err: any) => {
                        logger.error(err);
                        throw 'error';
                    });

            }

            for (const i2c of ctl.i2cModule.channels) {

                await this.dao.run(I2cChannelsTable.update, [i2c.channelName, i2c.enabled ? '1' : '0', i2c.id.toString(), ctl.id.toString()])
                    .catch((err: any) => {
                        logger.error(err);
                        throw 'error';
                    });
            }

            logger.info(`Updated controller ${ctl.id}`);
        }

        return true;
    }

    public async updateControllerIp(controllerId: number, ip: string): Promise<boolean> {

        await this.dao.run(ControllersTable.updateIp, [ip, controllerId.toString()])
            .catch((err: any) => {
                logger.error(err);
                return false;
            });

        return true;
    }

    public async updateControllerFingerprint(controllerId: number, fingerprint: string): Promise<boolean> {

        await this.dao.run(ControllersTable.updateFingerprint, [fingerprint, controllerId.toString()])
            .catch((err: any) => {
                logger.error(err);
                return false;
            });

        return true;
    }

    public async getAudioModule(): Promise<AudioModule | null> {

        const result = new AudioModule();

        await this.dao.get(AudioModuleTable.selectAll, [])
            .then((val: any) => {

                val.forEach((x: any) => {
                    if (x.key === "type") {
                        result.setType(x.value);
                    } else {
                        result.entries.push([x.key, x.value]);
                    }
                })

                return result;
            })
            .catch((err: any) => {
                logger.error(err);
                result.type = AudioModuleType.Disabled;
                return result;
            });

        return result;
    }

    public async saveAudioModule(module: AudioModule): Promise<boolean> {

        let type = '';

        await this.dao.get(AudioModuleTable.getType, [])
            .then((val: any) => {
                type = val[0]
            })
            .catch((err: any) => {
                logger.error(err);
                type = 'error';
            });

        // if our type has changed, delete all current settings
        if (type !== AudioModule.getType(module)) {
            await this.dao.run(AudioModuleTable.deleteAll, [])
                .catch((err: any) => {
                    logger.error(err);
                });
        }

        await this.dao.run(AudioModuleTable.insert, ["type", AudioModule.getType(module)])
            .catch((err: any) => {
                logger.error(err);
                return false;
            });

        module.entries.forEach(async (val: [string, string]) => {
            await this.dao.run(AudioModuleTable.insert, [val[0], val[1]])
                .catch((err: any) => {
                    logger.error(err);
                    return false;
                });
        });

        return true;
    }
}
