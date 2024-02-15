export class ScriptsDeploymentTable {

    public static readonly table = 'scripts_deployment';
    public static readonly scriptId = 'scriptId';
    public static readonly locationId = 'locationId';
    public static readonly lastSaved = 'lastSaved';

    public static readonly create =
        `CREATE TABLE IF NOT EXISTS ${this.table} (
    ${this.scriptId} TEXT PRIMARY KEY,
    ${this.locationId} NUMBER,
    ${this.lastSaved} TEXT,
    UNIQUE(${this.scriptId}, ${this.locationId}) ON CONFLICT REPLACE)`;

    public static readonly insert =
        `INSERT OR REPLACE INTO ${this.table}
    (${this.scriptId}, 
    ${this.locationId}, 
    ${this.lastSaved})
    VALUES (?, 
    ?,
    ?)`;

    public static readonly selectByScript =
        `SELECT ${this.scriptId}, 
    ${this.locationId}, 
    ${this.lastSaved}
    FROM ${this.table}
    WHERE ${this.scriptId} = ?`;
}