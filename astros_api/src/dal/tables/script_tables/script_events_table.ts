export class ScriptEventsTable {
  public static readonly table = "script_events";
  public static readonly scriptId = "scriptId";
  public static readonly scriptChannel = "scriptChannel";
  public static readonly channelType = "channelType";
  public static readonly channelSubType = "channelSubType";
  public static readonly time = "time";
  public static readonly dataJson = "dataJson";

  public static readonly create = `CREATE TABLE IF NOT EXISTS ${this.table} (
    ${this.scriptId} TEXT,
    ${this.scriptChannel} TEXT,
    ${this.channelType} INTEGER,
    ${this.channelSubType} INTEGER,
    ${this.time} INTEGER,
    ${this.dataJson} TEXT,
    UNIQUE(${this.scriptChannel}, ${this.time}) ON CONFLICT REPLACE)`;

  public static readonly insert = `INSERT INTO ${this.table}
    (${this.scriptId}, 
    ${this.scriptChannel}, 
    ${this.channelType},  
    ${this.channelSubType}, 
    ${this.time},
    ${this.dataJson})
    VALUES (
    ?, 
    ?, 
    ?, 
    ?, 
    ?, 
    ?)`;

  public static readonly selectForChannel = `SELECT 
    ${this.scriptChannel}, 
    ${this.channelType},
    ${this.channelSubType},
    ${this.time}, 
    ${this.dataJson}
    FROM ${this.table}
    WHERE ${this.scriptId} = ?
    AND ${this.scriptChannel} = ?`;

  public static readonly deleteAllForScript = `DELETE FROM ${this.table}
    WHERE ${this.scriptId} = ?`;
}
