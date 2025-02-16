export class ScriptEventsTable {
  public static readonly table = "script_events";
  public static readonly scriptId = "scriptId";
  public static readonly scriptChannel = "scriptChannel";
  public static readonly moduleType = "moduleType";
  public static readonly moduleSubType = "moduleSubType";
  public static readonly time = "time";
  public static readonly dataJson = "dataJson";

  public static readonly create = `CREATE TABLE IF NOT EXISTS ${this.table} (
    ${this.scriptId} TEXT,
    ${this.scriptChannel} TEXT,
    ${this.moduleType} INTEGER,
    ${this.moduleSubType} INTEGER,
    ${this.time} INTEGER,
    ${this.dataJson} TEXT,
    UNIQUE(${this.scriptChannel}, ${this.time}) ON CONFLICT REPLACE)`;

  public static readonly insert = `INSERT INTO ${this.table}
    (${this.scriptId}, 
    ${this.scriptChannel}, 
    ${this.moduleType},  
    ${this.moduleSubType}, 
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
    ${this.moduleType},
    ${this.moduleSubType},
    ${this.time}, 
    ${this.dataJson}
    FROM ${this.table}
    WHERE ${this.scriptId} = ?
    AND ${this.scriptChannel} = ?`;

  public static readonly deleteAllForScript = `DELETE FROM ${this.table}
    WHERE ${this.scriptId} = ?`;
}
