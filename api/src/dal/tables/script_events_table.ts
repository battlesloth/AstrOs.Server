export class ScriptEventsTable {
    public static readonly table = 'script_events';
    public static readonly id = 'id';
    public static readonly scriptId = 'scriptId';
    public static readonly scriptChannel = 'scriptChannel';
    public static readonly time = 'time';
    public static readonly dataJson = 'dataJson';

    public static readonly create =
    `CREATE TABLE IF NOT EXISTS ${this.table} (
    ${this.id} TEXT PRIMARY KEY,
    ${this.scriptId} TEXT,
    ${this.scriptChannel} TEXT,
    ${this.time} INTEGER,
    ${this.dataJson} TEXT)`;

    public static readonly insert =
    `INSERT INTO ${this.table}
    (${this.id}, ${this.scriptId}, ${this.scriptChannel}, ${this.time}, ${this.dataJson})
    VALUES (?, ?, ?, ?, ?)`;

    public static readonly selectForChannel =
    `SELECT ${this.id},
    ${this.scriptChannel}, 
    ${this.time}, 
    ${this.dataJson}
    FROM ${this.table}
    WHERE ${this.scriptId} = ?
    AND ${this.scriptChannel} = ?`;

    public static readonly deleteAllForScript =
    `DELETE FROM ${this.table}
    WHERE ${this.scriptId} = ?`
}