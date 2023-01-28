import appdata from "appdata-path";
import { Database } from "sqlite3";
import fs from "fs";
import crypto from "crypto";
import { SettingsTable } from "./tables/settings_table";
import { UsersTable } from "./tables/users_table";
import { ControllersTable } from "./tables/controllers_table";
import { I2cChannelsTable } from "./tables/i2c_channels_table";
import { ServoChannelsTable } from "./tables/servo_channels_table";
import { ControllerType, UartType } from "astros-common";
import { ScriptsTable } from "./tables/scripts_table";
import { ScriptEventsTable } from "./tables/script_events_table";
import { ScriptChannelsTable } from "./tables/script_channels_table";
import { AudioFilesTable } from "./tables/audio_files_table";
import { UartModuleTable } from "./tables/uart_module_table";
import { logger } from "../logger";



export class DataAccess {

    appdataPath: string;
    databaseFile: string;
    database!: Database;

    constructor() {
        this.appdataPath = appdata("astrosserver");
        this.databaseFile = '/database.sqlite3';
    }


    public static toDbBool(val: boolean) : string {
        return val ? "1" : "0";
    }

    public static fromDbBool(val: string) : boolean {
        return val === "1";
    }

    public async connect(): Promise<void> {
        this.database = new Database(`${this.appdataPath}${this.databaseFile}`, this.errorHandler);
    }

    public async setup(): Promise<void> {

        if (!fs.existsSync(this.appdataPath)) {
            fs.mkdirSync(this.appdataPath, { recursive: true });
        }

        if (!fs.existsSync(`${this.appdataPath}${this.databaseFile}`)) {
            fs.writeFile(`${this.appdataPath}${this.databaseFile}`, '', (err) => {
                if (err) throw err;
                logger.info('Created database file');
            });
        }

        logger.info(`Database path: ${this.appdataPath}${this.databaseFile}`)

        await this.connect();

        const result = await this.getVersion();
        let version = parseInt(result, 10);

        if (Number.isNaN(version) || version < 1) {
            logger.info('Setting up database...');

            await this.setupV1Tables()
                .then(async () => await this.setV1Values());

            version = 1;
            logger.info('Database set up complete!');
        }
        
        logger.info(`Database at version ${version.toString()}`);
        
        switch (version){
            case 1:
                await this.upgradeToV2();
                break
            default:
                logger.info('Database up to date');        
                break;
        }

    }

    public async run(sql: string, params = new Array<string>()): Promise<void> {
        return new Promise((resolve, reject) => {
            this.database.run(sql, params, (result: any, err: any) => {
                if (err) {
                    logger.error('Error running sql ' + sql);
                    logger.error(err);
                    reject(err);
                }
                else {
                    resolve(result);
                }
            })
        });
    }

    public async get(sql: string, params = new Array<string>()): Promise<void> {
        return new Promise((resolve, reject) => {
            this.database.all(sql, params, (err: any, rows: any) => {
                if (err) {
                    logger.error('Error running sql ' + sql);
                    logger.error(err);
                    reject(err);
                }
                else {
                    resolve(rows);
                }
            })
        });
    }

    private async getVersion(): Promise<string> {
        let result = '0';
        try {
            result = await this.get(SettingsTable.select, ["version"])
                .then((version: any) => {
                    const first = version[0].value;
                    return first;
                })
                .catch((err) => {
                    logger.error(err);
                    return '0';
                });
        } catch (ex) {
            logger.error(`Exception getting database version:${ex}`)
        }

        return result;
    }

    private async setupV1Tables(): Promise<void> {

        await this.createTable(SettingsTable.table, SettingsTable.create);

        await this.createTable(UsersTable.table, UsersTable.create);

        await this.createTable(ControllersTable.table, ControllersTable.create);

        await this.createTable(UartModuleTable.table, UartModuleTable.create);

        await this.createTable(ServoChannelsTable.table, ServoChannelsTable.create);

        await this.createTable(I2cChannelsTable.table, I2cChannelsTable.create);

        await this.createTable(ScriptsTable.table, ScriptsTable.create);

        await this.createTable(ScriptChannelsTable.table, ScriptChannelsTable.create);
        
        await this.createTable(ScriptEventsTable.table, ScriptEventsTable.create);
   
        await this.createTable(AudioFilesTable.table, AudioFilesTable.create);

    }

    private async setV1Values(): Promise<void> {
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = crypto
            .pbkdf2Sync("password", salt, 1000, 64, 'sha512')
            .toString('hex');

        await this.run(UsersTable.insert, ["admin", hash, salt])
            .then(() => {
                logger.info("Added default admin")
            })
            .catch((err) => console.error(`Error adding default admin: ${err}`));

        const controllers = [ControllerType.core, ControllerType.dome, ControllerType.body];

        const nameMap = new Map();
        nameMap.set(ControllerType.core, "Dome Core Controller");
        nameMap.set(ControllerType.dome, "Dome Surface Controller");
        nameMap.set(ControllerType.body, "Body Controller");

        for (const ctl of controllers) {

            await this.run(ControllersTable.insert, [ctl.toString(), nameMap.get(ctl)])
                .catch((err) => console.error(`Error adding ${ctl} controller: ${err}`));

            await this.run(UartModuleTable.insert, [ctl.toString(), UartType.none.toString(), "unassigned", JSON.stringify(new Object())]);
            
            for (let i = 0; i < 32; i++) {
                await this.run(ServoChannelsTable.insertV1, [ctl.toString(), i.toString(), "unassigned", "0", "0", "0"])
                    .catch((err) => console.error(`Error adding servo channel ${i}: ${err}`))
            }

            for (let i = 0; i < 128; i++) {

                if (i === 64 || i === 65){
                    await this.run(I2cChannelsTable.insert, [ctl.toString(), i.toString(), "reserved", '0'])
                    .catch((err) => console.error(`Error adding i2c channel ${i}: ${err}`))
                } else {
                    await this.run(I2cChannelsTable.insert, [ctl.toString(), i.toString(), "unassigned", '0'])
                    .catch((err) => console.error(`Error adding i2c channel ${i}: ${err}`))
                }
            }
        }

        await this.run(SettingsTable.insert, ["version", "1"]).then(() => {
            logger.info("Updated database to version 1");
        })
            .catch((err) => {
                logger.error(`Error updating database version: ${err}`);
            });
    }

    private async createTable(tableName: string, query: string): Promise<void> {
        await this.run(query)
            .then(() => {
                logger.info(`Created ${tableName} table`)
            })
            .catch((err) => {
                logger.error(`Error creating ${tableName} table: ${err}`);
            });
    }

    private errorHandler(err: any): void {
        if (err) {
            logger.error('Could not connect to database', err);
        }
        else {
            logger.info('Connected to database');
        }
    }

    private async upgradeToV2(): Promise<void> {
        logger.info('Upgrading to V2..')

        await this.run(ServoChannelsTable.v2)
        .then(() => {
            logger.info("ServoChannelsTable at V2")
        })
        .catch((err) => console.error(`Error updating ServoChannelsTable to V2: ${err}`));

        await this.UpdateDbVerion(2);

        logger.info('Upgrade complete!..')
    } 

    private async UpdateDbVerion(version: number): Promise<void>{
        await this.run(SettingsTable.update, [version.toString(), "version"])
        .then(() => {
            logger.info(`Updated version in  settings to ${version}`);
        })
        .catch((err) => {
            logger.error(`Error updating database version in settings: ${err}`);
        });
    }
}