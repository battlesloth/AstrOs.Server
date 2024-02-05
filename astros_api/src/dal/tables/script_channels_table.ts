import { ControllersTable } from "./controllers_table";


export class ScriptChannelsTable {
    public static readonly table = 'script_channels';
    public static readonly id = 'id';
    public static readonly scriptId = 'scriptId';
    public static readonly controllerId = 'controllerId';
    public static readonly type = 'type';
    public static readonly subType = 'subType';
    public static readonly channelNumber = 'channelNumber'

    public static readonly create =
        `CREATE TABLE IF NOT EXISTS ${this.table} (
    ${this.id} TEXT PRIMARY KEY,
    ${this.scriptId} TEXT,
    ${this.controllerId} INTEGER,
    ${this.type} INTEGER,
    ${this.subType} INTEGER,
    ${this.channelNumber} INTEGER)`;

    public static readonly insert =
        `INSERT INTO ${this.table}
    (${this.id}, 
    ${this.scriptId}, 
    ${this.controllerId}, 
    ${this.type}, 
    ${this.subType}, 
    ${this.channelNumber})
    VALUES (
    ?,
    ?, 
    ?, 
    ?, 
    ?, 
    ?)`;

    public static readonly selectAllForScript =
        `SELECT t.${this.id}, 
    t.${this.scriptId}, 
    t.${this.controllerId},
    t.${this.type},
    t.${this.subType},
    t.${this.channelNumber}
    FROM ${this.table}
    WHERE t.${this.scriptId} = ?`;

    public static readonly deleteAllForScript =
        `DELETE FROM ${this.table}
    WHERE ${this.scriptId} = ?`
}