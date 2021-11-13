const crypto = require('crypto');
const appdata = require('appdata-path');
const fs = require('fs');
const sqlite3 = require('sqlite3');

class DataAccess {
    constructor() {

        const appdataPath = appdata("astrosserver");

        if (!fs.existsSync(appdataPath)){
            fs.mkdirSync(appdataPath, { recursive: true });
        }

        if (!fs.existsSync(`${appdataPath}/database.sqlite3`)){
            fs.writeFile(`${appdataPath}/database.sqlite3`,'', function(err){
                if (err) throw err;
                console.log('Created database file');
            });
        }

        const dbFilePath = `${appdataPath}/database.sqlite3`;    
        console.log(`Database path: ${dbFilePath}`)

        this.db = new sqlite3.Database(dbFilePath, (err) =>{

            if (err){
                console.log('Could not connect to database', err);
            }
            else
            {
                console.log('Connected to database');
                this.setup();
            }
        });
    }

    async setup(){
        let result = await this.getVersion();
        const version = parseInt(result, 10);

        if (Number.isNaN(version) || version < 1){
            console.log('Setting up database...');

            await this.setupV1Tables();
            await this.setV1Values();
            
            console.log('Database set up complete!');
        } 
        else{
            console.log(`Database at version ${version.toString()}`);
        }
    }

    async getVersion(){
        let result = '0';
        const sql = `
        SELECT value FROM settings where Key = 'version'`;
        try{
            result = await this.get(sql, [])
                .then((version) => {
                    const first = version[0].value;
                    return first;
                })
                .catch((err) => {
                    console.log(err);
                    return '0';
                });
        } catch {}

        return result;
    }

    async setupV1Tables(){
        let sql = `
        CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT UNIQUE,
            value TEXT)`;

        await this.run(sql)
            .then(() =>{
                console.log("Created settings table")
            })
            .catch((err) =>{
                console.log(`Error creating setting table: ${err}`);
            });
        
        sql = `
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user TEXT UNIQUE,
            hash TEXT,
            salt TEXT)`;

        await this.run(sql)
            .then(() =>{
                console.log("Created users table")
            })
            .catch((err) =>{
                console.log(`Error creating user table: ${err}`);
            });
    }

    async setV1Values(){
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = crypto
        .pbkdf2Sync("password", salt, 1000, 64, 'sha512')
        .toString('hex');
        
        let sql = `
        INSERT INTO users (user, hash, salt) VALUES (?,?,?)`;

        await this.run(sql, ["admin", hash, salt])
            .then(() =>{
                console.log("Added default admin")
            })
            .catch((err) =>{
                console.log(`Error adding default admin: ${err}`);
            });;

        sql = `INSERT INTO settings (Key, Value) VALUES ('version', '1')`;

        await this.run(sql, []) .then(() =>{
            console.log("Updated database to version 1");
        })
        .catch((err) =>{
            console.log(`Error updating database version: ${err}`);
        });;
    }

    run(sql, params = []){
        return new Promise((resolve, reject) =>{
            this.db.run(sql, params, function (err){
                if (err){
                    console.log('Error running sql ' + sql);
                    console.log(err);
                    reject(err);
                }
                else
                {
                    resolve({ id: this.lastID });
                }
            })
        });
    }

    get(sql, params = []){
        return new Promise((resolve, reject) =>{
            this.db.all(sql, params, (err, rows) => {
                if (err){
                    console.log('Error running sql ' + sql);
                    console.log(err);
                    reject(err);    
                }
                else 
                {
                    resolve(rows);
                }
            })
        });
    }
}

module.exports = DataAccess;