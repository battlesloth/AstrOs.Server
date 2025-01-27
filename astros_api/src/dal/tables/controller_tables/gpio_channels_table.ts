export class GpioChannelsTable {
  public static readonly table = "gpio_channels";
  public static readonly id = "id";
  public static readonly locationId = "locationId";
  public static readonly channelId = "channelId";
  public static readonly channelName = "channelName";
  public static readonly defaultLow = "defaultLow";
  public static readonly enabled = "enabled";

  public static readonly create = `CREATE TABLE IF NOT EXISTS ${this.table} (
    ${this.id} INTEGER PRIMARY KEY AUTOINCREMENT,
    ${this.locationId} TEXT,
    ${this.channelId} INTEGER,
    ${this.channelName} TEXT,
    ${this.defaultLow} INTEGER,
    ${this.enabled} INTEGER,
    UNIQUE(${this.locationId}, ${this.channelId}) ON CONFLICT REPLACE)`;

  public static readonly insert = `INSERT INTO ${this.table}
    (
        ${this.locationId}, 
        ${this.channelId}, 
        ${this.channelName}, 
        ${this.defaultLow},
        ${this.enabled}
    )
    VALUES (?, ?, ?, ?, ?)`;

  public static readonly selectAll = `SELECT ${this.channelId},
        ${this.channelName},
        ${this.defaultLow},
        ${this.enabled}
    FROM ${this.table}
    WHERE ${this.locationId} = ?`;

  public static readonly select = `SELECT ${this.channelId}, 
        ${this.channelName},
        ${this.defaultLow},
        ${this.enabled}
    FROM ${this.table}
    WHERE ${this.channelId} = ?
    AND ${this.locationId} = ?`;

  public static readonly update = `UPDATE ${this.table}
    SET ${this.channelName} = ?,
        ${this.defaultLow} = ?,
        ${this.enabled} = ?
    WHERE ${this.channelId}  = ?
    AND ${this.locationId} = ?`;
}
