import appdata from "appdata-path";
import { Database } from "sqlite3";
import fs from "fs";
import crypto from "crypto";
import { SettingsTable } from "./tables/settings_table";
import { UsersTable } from "./tables/users_table";
import { ControllersTable } from "./tables/controllers_table";
import { I2cChannelsTable } from "./tables/i2c_channels_table";
import { PwmChannelsTable } from "./tables/pwm_channels_table";
import { ScriptsTable } from "./tables/scripts_table";
import { ScriptEventsTable } from "./tables/script_events_table";
import { PwmType } from "../models/control_module/ControlModule";
import { ControllerId } from "../models/control_module/ControllerId";


export class DataAccess {

    appdataPath: string;
    databaseFile: string;
    database!: Database;

    constructor() {
        this.appdataPath = appdata("astroserver");
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
                console.log('Created database file');
            });
        }

        console.log(`Database path: ${this.appdataPath}${this.databaseFile}`)

        await this.connect();

        const result = await this.getVersion();
        const version = parseInt(result, 10);

        if (Number.isNaN(version) || version < 1) {
            console.log('Setting up database...');

            await this.setupV1Tables()
                .then(async () => await this.setV1Values());

            console.log('Database set up complete!');
        }
        else {
            console.log(`Database at version ${version.toString()}`);
        }

    }

    public async run(sql: string, params = new Array<string>()): Promise<void> {
        return new Promise((resolve, reject) => {
            this.database.run(sql, params, (result: any, err: any) => {
                if (err) {
                    console.log('Error running sql ' + sql);
                    console.log(err);
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
                    console.log('Error running sql ' + sql);
                    console.log(err);
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
                    console.log(err);
                    return '0';
                });
        } catch (ex) {
            console.log(`Exception getting database version:${ex}`)
        }

        return result;
    }

    private async setupV1Tables(): Promise<void> {

        await this.createTable(SettingsTable.table, SettingsTable.create);

        await this.createTable(UsersTable.table, UsersTable.create);

        await this.createTable(ControllersTable.table, ControllersTable.create);

        await this.createTable(PwmChannelsTable.table, PwmChannelsTable.create);

        await this.createTable(I2cChannelsTable.table, I2cChannelsTable.create);

        await this.createTable(ScriptsTable.table, ScriptsTable.create);

        await this.createTable(ScriptEventsTable.table, ScriptEventsTable.create);
    }

    private async setV1Values(): Promise<void> {
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = crypto
            .pbkdf2Sync("password", salt, 1000, 64, 'sha512')
            .toString('hex');

        await this.run(UsersTable.insert, ["admin", hash, salt])
            .then(() => {
                console.log("Added default admin")
            })
            .catch((err) => console.error(`Error adding default admin: ${err}`));

        const controllers = [ControllerId.CORE, ControllerId.DOME, ControllerId.BODY];

        const nameMap = new Map();
        nameMap.set(ControllerId.CORE, "Dome Core Controller");
        nameMap.set(ControllerId.DOME, "Dome Surface Controller");
        nameMap.set(ControllerId.BODY, "Body Controller");

        for (const ctl of controllers) {

            await this.run(ControllersTable.insert, [ctl, nameMap.get(ctl)])
                .catch((err) => console.error(`Error adding ${name} controller: ${err}`));

            for (let i = 0; i < 36; i++) {
                await this.run(PwmChannelsTable.insert, [ctl, i.toString(), "unassigned", PwmType.unassigned.toString(), "0", "0"])
                    .catch((err) => console.error(`Error adding pwm channel ${i}: ${err}`))
            }

            for (let i = 0; i < 128; i++) {
                await this.run(I2cChannelsTable.insert, [ctl, i.toString(), "unassigned"])
                    .catch((err) => console.error(`Error adding i2c channel ${i}: ${err}`))
            }
        }

        await this.run(SettingsTable.insert, ["version", "1"]).then(() => {
            console.log("Updated database to version 1");
        })
            .catch((err) => {
                console.log(`Error updating database version: ${err}`);
            });;
    }

    private async createTable(tableName: string, query: string): Promise<void> {
        await this.run(query)
            .then(() => {
                console.log(`Created ${tableName} table`)
            })
            .catch((err) => {
                console.log(`Error creating ${tableName} table: ${err}`);
            });
    }

    private errorHandler(err: any): void {
        if (err) {
            console.log('Could not connect to database', err);
        }
        else {
            console.log('Connected to database');
        }
    }
}