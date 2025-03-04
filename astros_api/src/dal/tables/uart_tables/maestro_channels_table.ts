export class MaestroChannelTable {
  public static readonly table = "maestro_channels";
  public static readonly id = "id";
  public static readonly boardId = "boardId";
  public static readonly channelNumber = "channelNumber";
  public static readonly channelName = "name";
  public static readonly enabled = "enable";
  public static readonly isServo = "isServo";
  public static readonly minPos = "minPos";
  public static readonly maxPos = "maxPos";
  public static readonly homePos = "homePos";
  public static readonly inverted = "inverted";

  public static readonly create = `CREATE TABLE IF NOT EXISTS ${this.table} (
        ${this.id} TEXT PRIMARY KEY,
        ${this.boardId} TEXT,
        ${this.channelNumber} INTEGER,
        ${this.channelName} TEXT,
        ${this.enabled} INTEGER DEFAULT 0 NOT NULL,
        ${this.isServo} INTEGER DEFAULT 1 NOT NULL,
        ${this.minPos} INTEGER DEFAULT 0 NOT NULL,
        ${this.maxPos} INTEGER DEFAULT 0 NOT NULL,
        ${this.homePos} INTEGER DEFAULT 0 NOT NULL,
        ${this.inverted} INTEGER DEFAULT 0 NOT NULL,
        UNIQUE(${this.boardId}, ${this.channelNumber}))`;

  public static readonly insert = `INSERT INTO ${this.table} (
        ${this.id}
        ${this.boardId}, 
        ${this.channelNumber}, 
        ${this.channelName}, 
        ${this.enabled},
        ${this.isServo}, 
        ${this.minPos}, 
        ${this.maxPos}, 
        ${this.homePos}, 
        ${this.inverted})
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(${this.id}) DO UPDATE SET
        ${this.boardId} = excluded.${this.boardId},
        ${this.channelNumber} = excluded.${this.channelNumber},
        ${this.channelName} = excluded.${this.channelName},
        ${this.enabled} = excluded.${this.enabled},
        ${this.isServo} = excluded.${this.isServo},
        ${this.minPos} = excluded.${this.minPos},
        ${this.maxPos} = excluded.${this.maxPos},
        ${this.homePos} = excluded.${this.homePos},
        ${this.inverted} = excluded.${this.inverted}
        `;

  public static readonly selectAllForBoard = `SELECT 
        ${this.id},
        ${this.channelNumber},
        ${this.channelName},
        ${this.enabled},
        ${this.isServo},
        ${this.minPos},
        ${this.maxPos},
        ${this.homePos},
        ${this.inverted}
        FROM ${this.table}
        WHERE ${this.boardId} = ?`;

  public static readonly select = `SELECT
        ${this.id},
        ${this.boardId},
        ${this.channelNumber},
        ${this.channelName},
        ${this.enabled},
        ${this.isServo},
        ${this.minPos},
        ${this.maxPos},
        ${this.homePos},
        ${this.inverted}
        FROM ${this.table}
        WHERE ${this.id} = ?
        AND ${this.boardId} = ?`;

  public static readonly deleteByBoardId = `DELETE FROM ${this.table} WHERE ${this.boardId} = ?`;
}
