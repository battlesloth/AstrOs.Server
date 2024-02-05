export class ServoChannelsTable {
  public static readonly table = "servo_channels";
  public static readonly id = "id";
  public static readonly controllerId = "controllerId";
  public static readonly channelId = "channelId";
  public static readonly channelName = "channelName";
  public static readonly enabled = "enabled";
  public static readonly minPos = "minPos";
  public static readonly maxPos = "maxPos";
  public static readonly inverted = "inverted";

  public static readonly create = `CREATE TABLE IF NOT EXISTS ${this.table} (
    ${this.id} INTEGER PRIMARY KEY AUTOINCREMENT,
    ${this.controllerId} INTEGER,
    ${this.channelId} INTEGER,
    ${this.channelName} TEXT,
    ${this.enabled} INTEGER DEFAULT 1 NOT NULL,
    ${this.minPos} INTEGER DEFAULT 0 NOT NULL,
    ${this.maxPos} INTEGER DEFAULT 0 NOT NULL,
    ${this.inverted} INTEGER DEFAULT 0 NOT NULL,
    UNIQUE(${this.controllerId}, ${this.channelId}) ON CONFLICT REPLACE)`;

  public static readonly insert = `INSERT INTO ${this.table}
    (${this.controllerId}, ${this.channelId}, ${this.channelName}, ${this.enabled}, ${this.minPos}, ${this.maxPos},${this.inverted})
    VALUES (?, ?, ?, ?, ?, ?, ?)`;

  public static readonly selectAll = `SELECT ${this.channelId},
    ${this.channelName},
    ${this.enabled},
    ${this.minPos},
    ${this.maxPos},
    ${this.inverted}
    FROM ${this.table}
    WHERE ${this.controllerId} = ?`;

  public static readonly select = `SELECT ${this.channelId},
    ${this.channelName},
    ${this.enabled},
    ${this.minPos},
    ${this.maxPos},
    ${this.inverted}
    FROM ${this.table}
    WHERE ${this.channelId} = ?
    AND ${this.controllerId} = ?`;

  public static readonly update = `UPDATE ${this.table}
    SET ${this.channelName} = ?,
    ${this.enabled} = ?,
    ${this.minPos} = ?,
    ${this.maxPos} = ?,
    ${this.inverted} = ?
    WHERE ${this.channelId} = ?
    AND  ${this.controllerId} = ?`;
}
