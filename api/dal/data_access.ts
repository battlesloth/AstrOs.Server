import appdata from "appdata-path";
import { Database }  from "sqlite3";
import fs from "fs";
import crypto from "crypto";

class DataAccess {
    
    appdataPath: string;
    databaseFile: string;
    database!: Database;

    constructor() {
        this.appdataPath = appdata("astroserver");
        this.databaseFile = '/database.sqlite3';
    }

    async connect() : Promise<void> {
        this.database = new Database(`${this.appdataPath}${this.databaseFile}`, this.errorHandler);    
    }

    private errorHandler(err: any): void {
        if (err) {
            console.log('Could not connect to database', err);
        }
        else {
            console.log('Connected to database');
        }
    }
    async setup() : Promise<void>  {

        if (!fs.existsSync(this.appdataPath)) {
            fs.mkdirSync(this.appdataPath, { recursive: true });
        }

        if (!fs.existsSync(`${this.appdataPath}${this.databaseFile}`)) {
            fs.writeFile(`${this.appdataPath}${this.databaseFile}`, '', function (err) {
                if (err) throw err;
                console.log('Created database file');
            });
        }

        console.log(`Database path: ${this.appdataPath}${this.databaseFile}`)

        await this.connect();

        let result = await this.getVersion();
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

    async getVersion() {
        let result = '0';
        try {
            result = await this.get(SettingsTable.Select, ["version"])
                .then((version : any) => {
                    const first = version[0].value;
                    return first;
                })
                .catch((err) => {
                    console.log(err);
                    return '0';
                });
        } catch { }

        return result;
    }

    async setupV1Tables() {

        await this.createTable(SettingsTable.Table, SettingsTable.Create);

        await this.createTable(UsersTable.Table, UsersTable.Create);

        await this.createTable(ControllersTable.Table, ControllersTable.Create);

        await this.createTable(PwmChannelsTable.Table, PwmChannelsTable.Create);

        await this.createTable(I2cChannelsTable.Table, I2cChannelsTable.Create);
    
        await this.createTable(ScriptsTable.Table, ScriptsTable.Create);

        await this.createTable(ScriptEventsTable.Table, ScriptEventsTable.Create); 
    }

    async setV1Values() {
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = crypto
            .pbkdf2Sync("password", salt, 1000, 64, 'sha512')
            .toString('hex');

        await this.run(UsersTable.Insert, ["admin", hash, salt])
            .then(() => {
                console.log("Added default admin")
            })
            .catch((err) => console.error(`Error adding default admin: ${err}`));

        const controllers = [ControllerId.CORE, ControllerId.DOME, ControllerId.BODY];

        const nameMap = new Map();
        nameMap.set(ControllerId.CORE, "Dome Core Controller");
        nameMap.set(ControllerId.DOME, "Dome Surface Controller");
        nameMap.set(ControllerId.BODY, "Body Controller");

        for (let m = 0; m < controllers.length; m++) {
            let name = controllers[m];

            await this.run(ControllersTable.Insert, [name, nameMap.get(name)])
            .catch((err) => console.error(`Error adding ${name} controller: ${err}`));

            for (let i = 0; i < 36; i++) {
                await this.run(PwmChannelsTable.Insert, [name, i, "unassigned", PwmType.UNASSIGNED, 0, 0])
                .catch((err) => console.error(`Error adding pwm channel ${i}: ${err}`))
            }

            for (let i = 0; i < 128; i++) {
                await this.run(I2cChannelsTable.Insert, [name, i, "unassigned"])
                .catch((err) => console.error(`Error adding i2c channel ${i}: ${err}`))
            }
        }
        
        await this.run(SettingsTable.Insert, ["version", "1"]).then(() => {
            console.log("Updated database to version 1");
        })
            .catch((err) => {
                console.log(`Error updating database version: ${err}`);
            });;
    }

    async createTable(tableName: string, query: string) {
        await this.run(query)
            .then(() => {
                console.log(`Created ${tableName} table`)
            })
            .catch((err) => {
                console.log(`Error creating ${tableName} table: ${err}`);
            });
    }

    run(sql : string, params = new Array<string>()) {
        return new Promise((resolve, reject) => {
            this.database.run(sql, params, function (err) {
                if (err) {
                    console.log('Error running sql ' + sql);
                    console.log(err);
                    reject(err);
                }
                else {
                    resolve({ id: this.lastID });
                }
            })
        });
    }

    get(sql: string, params = new Array<string>()) {
        return new Promise((resolve, reject) => {
            this.database.all(sql, params, (err, rows) => {
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
}