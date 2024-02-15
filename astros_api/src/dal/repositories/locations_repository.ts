import { logger } from "../../logger";
import { DataAccess } from "../data_access";
import { LocationsTable } from "../tables/locations_table";
import { ControllerLocationTable } from "../tables/controller_location_table";
import { ControlModule, ControllerLocation, I2cChannel, ServoChannel, UartChannel, UartModule } from "astros-common";
import { UartModuleTable } from "../tables/uart_module_table";
import { I2cChannelsTable } from "../tables/i2c_channels_table";
import { ServoChannelsTable } from "../tables/servo_channels_table";

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
                        c.locationName,
                        c.locationDescription,
                        c.configFingerprint
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

    public async loadLocations(): Promise<Array<ControllerLocation>> {
        const result = new Array<ControllerLocation>();
        await this.dao
            .get(ControllerLocationTable.selectLocationControllers, [])
            .then((val: any) => {
                for (const c of val) {
                    const location = new ControllerLocation(
                        c.id,
                        c.locationName,
                        c.locationDescription,
                        c.configFingerprint
                    );

                    if (c.controllerId !== null || c.controllerId !== undefined) {
                        location.controller = new ControlModule(
                            c.controllerId,
                            c.controllerName,
                            c.controllerAddress
                        );
                    }

                    result.push(location);
                }
            })
            .catch((err: any) => {
                logger.error(err);
                throw "error";
            });

        for (const loc of result) {
            await this.loadLocationConfiguration(loc);
        }

        return result;
    }

    public async loadLocationConfiguration(location: ControllerLocation): Promise<ControllerLocation> {

        // load the 3 uart channels
        for (let i = 1; i < 4; i++) {
            await this.dao
                .get(UartModuleTable.select, [location.id.toString(), i.toString()])
                .then((val: any) => {
                    const uart = new UartChannel(
                        val[0].uartType,
                        i,
                        val[0].moduleName,
                        JSON.parse(val[0].moduleJson)
                    );

                    location.uartModule?.channels.push(uart);
                })
                .catch((err: any) => {
                    logger.error(err);
                    throw "error";
                });
        }

        await this.dao
            .get(ServoChannelsTable.selectAll, [location.id.toString()])
            .then((val: any) => {
                val.forEach((ch: any) => {
                    location.servoModule.channels[ch.channelId] = new ServoChannel(
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
            .get(I2cChannelsTable.selectAll, [location.id.toString()])
            .then((val: any) => {
                val.forEach((ch: any) => {
                    location.i2cModule.channels[ch.channelId] = new I2cChannel(
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


        return location;
    }

    public async updateLocation(location: ControllerLocation): Promise<boolean> {
        await this.dao
            .run(LocationsTable.update, [
                location.locationName,
                location.description,
                // TODO: only wipe fingerprint if there are changes to uart/servo/i2c
                //location.configFingerprint,
                "",
                location.id.toString(),
            ])
            .catch((err: any) => {
                logger.error(err);
                throw "error";
            });

        if (location.controller !== undefined && location.controller !== null) {
            await this.setLocationController(location.id, location.controller?.id || 0);
        }

        for (const uart of location.uartModule.channels) {
            await this.dao
                .run(UartModuleTable.update, [
                    uart.type.toString(),
                    uart.channelName,
                    JSON.stringify(uart.module),
                    uart.id.toString(),
                    location.id.toString()
                ])
                .catch((err: any) => {
                    logger.error(err);
                    throw "error";
                });
        }

        for (const servo of location.servoModule.channels) {
            await this.dao
                .run(ServoChannelsTable.update, [
                    servo.channelName,
                    servo.enabled ? "1" : "0",
                    servo.minPos.toString(),
                    servo.maxPos.toString(),
                    servo.inverted ? "1" : "0",
                    servo.id.toString(),
                    location.id.toString(),
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

        logger.info(`Updated location ${location.id}`);

        return true;
    }

    public async setLocationController(locationId: number, controllerId: number): Promise<boolean> {

        await this.dao
            .run(ControllerLocationTable.delete, [locationId.toString(), controllerId.toString()])
            .catch((err: any) => {
                logger.error(err);
                throw "error";
            });

        await this.dao
            .run(ControllerLocationTable.insert, [locationId.toString(), controllerId.toString()])
            .catch((err: any) => {
                logger.error(err);
                throw "error";
            });

        return true;
    }
}