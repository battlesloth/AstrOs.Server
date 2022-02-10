export class PwmChannelsTable {
    public static readonly table = 'pwm_channels';
    public static readonly id = 'id';
    public static readonly controllerId = 'controllerId';
    public static readonly channelId = 'channelId';
    public static readonly channelName = 'channelName';
    public static readonly type = 'type';
    public static readonly limit0 = 'limit0';
    public static readonly limit1 = 'limit1';

    public static readonly create =
    `CREATE TABLE IF NOT EXISTS ${this.table} (
    ${this.id} INTEGER PRIMARY KEY AUTOINCREMENT,
    ${this.controllerId} INTEGER,
    ${this.channelId} INTEGER,
    ${this.channelName} TEXT,
    ${this.type} INTEGER,
    ${this.limit0} INTEGER,
    ${this.limit1} INTEGER,
    UNIQUE(${this.controllerId}, ${this.channelId}) ON CONFLICT REPLACE)`;

    public static readonly insert =
    `INSERT INTO ${this.table}
    (${this.controllerId}, ${this.channelId}, ${this.channelName}, ${this.type}, ${this.limit0}, ${this.limit1})
    VALUES (?, ?, ?, ?, ?, ?)`;

    public static readonly selectAll =
    `SELECT ${this.channelId},
    ${this.channelName},
    ${this.type},
    ${this.limit0},
    ${this.limit1}
    FROM ${this.table}
    WHERE ${this.controllerId} = ?`;

    public static readonly select =
    `SELECT ${this.channelId},
    ${this.channelName},
    ${this.type},
    ${this.limit0},
    ${this.limit1}
    FROM ${this.table}
    WHERE ${this.channelId} = ?
    AND ${this.controllerId} = ?`;

    public static readonly update =
    `UPDATE ${this.table}
    SET ${this.channelName} = ?,
    ${this.type} = ?,
    ${this.limit0} = ?,
    ${this.limit1} = ?
    WHERE ${this.channelId} = ?
    AND  ${this.controllerId} = ?`;
}