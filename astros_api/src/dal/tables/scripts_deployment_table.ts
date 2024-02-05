export class ScriptsDeploymentTable {

    public static readonly table = 'scripts_deployment';
    public static readonly scriptId = 'scriptId';
    public static readonly controllerId = 'controllerId';
    public static readonly lastSaved = 'lastSaved';

    public static readonly create =
        `CREATE TABLE IF NOT EXISTS ${this.table} (
    ${this.scriptId} TEXT PRIMARY KEY,
    ${this.controllerId} NUMBER,
    ${this.lastSaved} TEXT,
    UNIQUE(${this.scriptId}, ${this.controllerId}) ON CONFLICT REPLACE)`;

    public static readonly insert =
        `INSERT OR REPLACE INTO ${this.table}
    (${this.scriptId}, 
    ${this.controllerId}, 
    ${this.lastSaved})
    VALUES (?, 
    ?,
    ?)`;

    public static readonly selectByScript =
        `SELECT ${this.scriptId}, 
    ${this.controllerId}, 
    ${this.lastSaved}
    FROM ${this.table}
    WHERE ${this.scriptId} = ?`;
}