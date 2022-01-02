export class I2cChannelsTable {
    public static readonly table = 'i2c_channels';
    public static readonly id = 'id';
    public static readonly controllerId = 'controllerId';
    public static readonly channelId = 'channelId';
    public static readonly channelName = 'channelName';

    public static readonly create =
    `CREATE TABLE IF NOT EXISTS ${this.table} (
    ${this.id} INTEGER PRIMARY KEY AUTOINCREMENT,
    ${this.controllerId} INTEGER,
    ${this.channelId} INTEGER,
    ${this.channelName} TEXT,
    UNIQUE(${this.controllerId}, ${this.channelId}) ON CONFLICT REPLACE)`;

    public static readonly insert =
    `INSERT INTO ${this.table}
    (${this.controllerId}, ${this.channelId}, ${this.channelName})
    VALUES (?, ?, ?)`;

    public static readonly selectAll =
    `SELECT ${this.channelId}, ${this.channelName}
    FROM ${this.table}
    WHERE ${this.controllerId} = ?`;

    public static readonly select =
    `SELECT ${this.channelId}, ${this.channelName}
    FROM ${this.table}
    WHERE ${this.channelId} = ?
    AND ${this.controllerId} = ?`;

    public static readonly update =
    `UPDATE ${this.table}
    SET ${this.channelName} = ?
    WHERE ${this.channelId}  = ?
    AND ${this.controllerId} = ?`;
}