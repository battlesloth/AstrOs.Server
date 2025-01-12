export class ScriptsTable {
  public static readonly table = "scripts";
  public static readonly id = "id";
  public static readonly scriptName = "scriptName";
  public static readonly description = "description";
  public static readonly lastSaved = "lastSaved";
  public static readonly enabled = "enabled";

  public static readonly create = `CREATE TABLE IF NOT EXISTS ${this.table} (
    ${this.id} TEXT PRIMARY KEY,
    ${this.scriptName} TEXT,
    ${this.description} TEXT,
    ${this.lastSaved} TEXT,
    ${this.enabled} NUMBER)`;

  public static readonly insert = `INSERT OR REPLACE INTO ${this.table}
    (${this.id}, 
    ${this.scriptName}, 
    ${this.description}, 
    ${this.lastSaved},
    ${this.enabled})
    VALUES (?, 
        ?,
        ?, 
        ?,
        1)`;

  public static readonly selectAll = `SELECT ${this.id}, 
    ${this.scriptName}, 
    ${this.description},
    ${this.lastSaved}
    FROM ${this.table}
    WHERE ${this.enabled} = 1`;

  public static readonly select = `SELECT ${this.id}, 
    ${this.scriptName}, 
    ${this.description},
    ${this.lastSaved}
    FROM ${this.table}
    WHERE ${this.id} = ?`;

  public static readonly updateScript = `UPDATE ${this.table}
    SET ${this.scriptName}} = ?,
    ${this.description} = ?,
    ${this.lastSaved} = ?
    WHERE ${this.id} = ?`;

  public static readonly disableScript = `UPDATE ${this.table}
    SET ${this.enabled} = 0
    WHERE ${this.id} = ?
    `;
}
