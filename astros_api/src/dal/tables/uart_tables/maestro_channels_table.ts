export class MaestroChannelTable {
    public static readonly table = 'maestro_channels';
    public static readonly id = 'id';
    public static readonly maestroBoardId = 'maestroBoardId';
    public static readonly channelId = 'channelId';
    public static readonly channelName = 'name';
    public static readonly enabled = 'enable';
    public static readonly isServo = 'isServo';
    public static readonly minPos = 'minPos';
    public static readonly maxPos = 'maxPos';
    public static readonly homePos = 'homePos';
    public static readonly inverted = 'inverted';

    public static readonly create = `CREATE TABLE IF NOT EXISTS ${this.table} (
        ${this.id} INTEGER PRIMARY KEY,
        ${this.maestroBoardId} TEXT,
        ${this.channelId} INTEGER,
        ${this.channelName} TEXT,
        ${this.enabled} INTEGER DEFAULT 0 NOT NULL,
        ${this.isServo} INTEGER DEFAULT 1 NOT NULL,
        ${this.minPos} INTEGER DEFAULT 0 NOT NULL,
        ${this.maxPos} INTEGER DEFAULT 0 NOT NULL,
        ${this.homePos} INTEGER DEFAULT 0 NOT NULL,
        ${this.inverted} INTEGER DEFAULT 0 NOT NULL,
        UNIQUE(${this.maestroBoardId}, ${this.channelId}))`;

    public static readonly insert =
        `INSERT INTO ${this.table} (
        ${this.id}
        ${this.maestroBoardId}, 
        ${this.channelId}, 
        ${this.channelName}, 
        ${this.enabled},
        ${this.isServo}, 
        ${this.minPos}, 
        ${this.maxPos}, 
        ${this.homePos}, 
        ${this.inverted})
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(${this.id}) DO UPDATE SET
        ${this.maestroBoardId} = excluded.${this.maestroBoardId},
        ${this.channelId} = excluded.${this.channelId},
        ${this.channelName} = excluded.${this.channelName},
        ${this.enabled} = excluded.${this.enabled},
        ${this.isServo} = excluded.${this.isServo},
        ${this.minPos} = excluded.${this.minPos},
        ${this.maxPos} = excluded.${this.maxPos},
        ${this.homePos} = excluded.${this.homePos},
        ${this.inverted} = excluded.${this.inverted}
        `;

    public static readonly selectAllForBoard =
        `SELECT ${this.channelId},
        ${this.channelName},
        ${this.enabled},
        ${this.isServo},
        ${this.minPos},
        ${this.maxPos},
        ${this.homePos},
        ${this.inverted}
        FROM ${this.table}
        WHERE ${this.maestroBoardId} = ?`;

    public static readonly select = `SELECT ${this.channelId},
        ${this.channelName},
        ${this.enabled},
        ${this.isServo},
        ${this.minPos},
        ${this.maxPos},
        ${this.homePos},
        ${this.inverted}
        FROM ${this.table}
        WHERE ${this.channelId} = ?
        AND ${this.maestroBoardId} = ?`;

    public static readonly deleteByBoardId = 
        `DELETE FROM ${this.table} WHERE ${this.maestroBoardId} = ?`;
}