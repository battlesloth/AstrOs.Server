import { ControllersTable } from "./controllers_table";


export class ScriptChannelsTable {
    public static readonly table = 'script_channels';
    public static readonly id = 'id';
    public static readonly scriptId = 'scriptId';
    public static readonly controllerType = 'controllerType';
    public static readonly type = 'type';
    public static readonly channelNumber = 'channelNumber'

    public static readonly create =
    `CREATE TABLE IF NOT EXISTS ${this.table} (
    ${this.id} TEXT PRIMARY KEY,
    ${this.scriptId} TEXT,
    ${this.controllerType} INTEGER,
    ${this.type} INTEGER,
    ${this.channelNumber} INTEGER)`;

    public static readonly insert =
    `INSERT INTO ${this.table}
    (${this.id}, ${this.scriptId}, ${this.controllerType}, ${this.type}, ${this.channelNumber})
    VALUES (?, ?, ?, ?, ?)`;

    public static readonly selectAllForScript =
    `SELECT t.${this.id}, 
    t.${this.scriptId},
    c.${ControllersTable.controllerName},
    t.${this.controllerType},
    t.${this.type},
    t.${this.channelNumber}
    FROM ${this.table} AS t
    LEFT JOIN ${ControllersTable.table} AS c
    ON c.${ControllersTable.controllerId} = t.${this.controllerType} 
    WHERE t.${this.scriptId} = ?`;

    public static readonly deleteAllForScript =
    `DELETE FROM ${this.table}
    WHERE ${this.scriptId} = ?`
}