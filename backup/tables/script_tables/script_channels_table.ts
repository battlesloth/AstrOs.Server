export class ScriptChannelsTable {
  public static readonly table = "script_channels";
  public static readonly id = "id";
  public static readonly scriptId = "scriptId";
  public static readonly channelType = "channelType";
  public static readonly moduleChannelId = "moduleChannelId";
  public static readonly moduleChannelType = "moduleChannelType";

  public static readonly create = `CREATE TABLE IF NOT EXISTS ${this.table} (
    ${this.id} TEXT PRIMARY KEY,
    ${this.scriptId} TEXT,
    ${this.channelType} INTEGER,
    ${this.moduleChannelId} TEXT,
    ${this.moduleChannelType} TEXT)`;

  public static readonly insert = `INSERT INTO ${this.table}
    (${this.id}, 
    ${this.scriptId},
    ${this.channelType},
    ${this.moduleChannelId}, 
    ${this.moduleChannelType})
    VALUES ( ?, ?, ?, ?, ?, ?)
    ON CONFLICT(${this.id}) DO UPDATE SET
    ${this.scriptId} = excluded.${this.scriptId},
    ${this.channelType} = excluded.${this.channelType},
    ${this.moduleChannelId} = excluded.${this.moduleChannelId},
    ${this.moduleChannelType} = excluded.${this.moduleChannelType}`;

  public static readonly selectAllForScript = `SELECT 
    ${this.id},
    ${this.scriptId},
    ${this.channelType},
    ${this.moduleChannelId},
    ${this.moduleChannelType},
    FROM ${this.table} 
    WHERE ${this.scriptId} = ?`;

  public static readonly deleteAllForScript = `DELETE FROM ${this.table}
    WHERE ${this.scriptId} = ?`;
}
