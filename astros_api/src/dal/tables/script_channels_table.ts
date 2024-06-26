export class ScriptChannelsTable {
    public static readonly table = 'script_channels';
    public static readonly id = 'id';
    public static readonly scriptId = 'scriptId';
    public static readonly locationId = 'locationId';
    public static readonly type = 'type';
    public static readonly subType = 'subType';
    public static readonly channelNumber = 'channelNumber'

    public static readonly create =
        `CREATE TABLE IF NOT EXISTS ${this.table} (
    ${this.id} TEXT PRIMARY KEY,
    ${this.scriptId} TEXT,
    ${this.locationId} INTEGER,
    ${this.type} INTEGER,
    ${this.subType} INTEGER,
    ${this.channelNumber} INTEGER)`;

    public static readonly insert =
        `INSERT INTO ${this.table}
    (${this.id}, 
    ${this.scriptId}, 
    ${this.locationId}, 
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
        `SELECT ${this.id}, 
    ${this.scriptId}, 
    ${this.locationId},
    ${this.type},
    ${this.subType},
    ${this.channelNumber}
    FROM ${this.table} 
    WHERE ${this.scriptId} = ?`;

    public static readonly deleteAllForScript =
        `DELETE FROM ${this.table}
    WHERE ${this.scriptId} = ?`
}