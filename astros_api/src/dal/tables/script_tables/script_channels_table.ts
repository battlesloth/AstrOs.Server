export class ScriptChannelsTable {
  public static readonly table = "script_channels";
  public static readonly id = "id";
  public static readonly channelId = "channelId";
  public static readonly locationId = "locationId";
  public static readonly scriptId = "scriptId";
  public static readonly channelType = "channelType";
  public static readonly moduleChannelType = "moduleChannelType";

  public static readonly create = `CREATE TABLE IF NOT EXISTS ${this.table} (
    ${this.id} TEXT PRIMARY KEY,
    ${this.channelId} TEXT,
    ${this.locationId} TEXT,
    ${this.scriptId} TEXT,
    ${this.channelType} INTEGER,
    ${this.moduleChannelType} TEXT)`;

  public static readonly insert = `INSERT INTO ${this.table}
    (${this.id}, 
    ${this.channelId},
    ${this.locationId}, 
    ${this.scriptId},
    ${this.channelType}, 
    ${this.moduleChannelType})
    VALUES ( ?, ?, ?, ?, ?, ?)
    ON CONFLICT(${this.id}) DO UPDATE SET
    ${this.channelId} = excluded.${this.channelId},
    ${this.locationId} = excluded.${this.locationId},
    ${this.scriptId} = excluded.${this.scriptId},
    ${this.channelType} = excluded.${this.channelType},
    ${this.moduleChannelType} = excluded.${this.moduleChannelType}`;

  public static readonly selectAllForScript = `SELECT 
    ${this.id}, 
    ${this.channelId},
    ${this.locationId},
    ${this.scriptId},
    ${this.channelType},
    ${this.moduleChannelType},
    FROM ${this.table} 
    WHERE ${this.scriptId} = ?`;

  public static readonly deleteAllForScript = `DELETE FROM ${this.table}
    WHERE ${this.scriptId} = ?`;
}
