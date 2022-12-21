export class ServoChannelsTable {
    public static readonly table = 'servo_channels';
    public static readonly id = 'id';
    public static readonly controllerId = 'controllerId';
    public static readonly channelId = 'channelId';
    public static readonly channelName = 'channelName';
    public static readonly enabled = 'enabled';
    public static readonly minPos = 'minPos';
    public static readonly maxPos = 'maxPos';

    public static readonly create =
    `CREATE TABLE IF NOT EXISTS ${this.table} (
    ${this.id} INTEGER PRIMARY KEY AUTOINCREMENT,
    ${this.controllerId} INTEGER,
    ${this.channelId} INTEGER,
    ${this.channelName} TEXT,
    ${this.enabled} INTEGER,
    ${this.minPos} INTEGER,
    ${this.maxPos} INTEGER,
    UNIQUE(${this.controllerId}, ${this.channelId}) ON CONFLICT REPLACE)`;

    public static readonly insert =
    `INSERT INTO ${this.table}
    (${this.controllerId}, ${this.channelId}, ${this.channelName}, ${this.enabled}, ${this.minPos}, ${this.maxPos})
    VALUES (?, ?, ?, ?, ?, ?)`;

    public static readonly selectAll =
    `SELECT ${this.channelId},
    ${this.channelName},
    ${this.enabled},
    ${this.minPos},
    ${this.maxPos}
    FROM ${this.table}
    WHERE ${this.controllerId} = ?`;

    public static readonly select =
    `SELECT ${this.channelId},
    ${this.channelName},
    ${this.enabled},
    ${this.minPos},
    ${this.maxPos}
    FROM ${this.table}
    WHERE ${this.channelId} = ?
    AND ${this.controllerId} = ?`;

    public static readonly update =
    `UPDATE ${this.table}
    SET ${this.channelName} = ?,
    ${this.enabled} = ?,
    ${this.minPos} = ?,
    ${this.maxPos} = ?
    WHERE ${this.channelId} = ?
    AND  ${this.controllerId} = ?`;
}