export class ScriptsDeploymentTable {
  public static readonly table = "scripts_deployment";
  public static readonly id = "id";
  public static readonly scriptId = "scriptId";
  public static readonly locationId = "locationId";
  public static readonly lastDeployed = "lastDeployed";

  public static readonly create = `CREATE TABLE IF NOT EXISTS ${this.table} (
    ${this.id} NUMBER PRIMARY KEY,
    ${this.scriptId} TEXT,
    ${this.locationId} NUMBER,
    ${this.lastDeployed} TEXT,
    UNIQUE(${this.scriptId}, ${this.locationId}) ON CONFLICT REPLACE)`;

  public static readonly insert = `INSERT OR REPLACE INTO ${this.table}
    (${this.scriptId}, 
    ${this.locationId}, 
    ${this.lastDeployed})
    VALUES (?, 
    ?,
    ?)`;

  public static readonly selectByScript = `SELECT ${this.scriptId}, 
    ${this.locationId}, 
    ${this.lastDeployed}
    FROM ${this.table}
    WHERE ${this.scriptId} = ?`;

  public static readonly getDateByScriptAndController = `SELECT ${this.lastDeployed}
    FROM ${this.table}
    WHERE ${this.scriptId} = ?
    AND ${this.locationId} = ?`;
}
