export class ScriptEventsTable {
    public static readonly table = 'script_events';
    public static readonly id = 'id';
    public static readonly scriptId = 'scriptId';
    public static readonly dataJson = 'dataJson';

    public static readonly create =
    `CREATE TABLE IF NOT EXISTS ${this.table} (
    ${this.id} INTEGER PRIMARY KEY AUTOINCREMENT,
    ${this.scriptId} INTEGER),
    ${this.dataJson} TEXT`;

    public static readonly insert =
    `INSERT INTO ${this.table}
    (${this.scriptId}, ${this.dataJson})
    VALUES (?, ?)`;

    public static readonly select =
    `SELECT ${this.id}, ${this.scriptId}, ${this.dataJson}
    FROM ${this.table}
    WHERE ${this.id} = ?`;

    public static readonly updateName =
    `UPDATE ${this.table}
    SET ${this.scriptId} = ?,
    ${this.dataJson} = ?,
    WHERE ${this.id} = ?`;

    public static readonly deleteAllForScript =
    `DELETE FROM ${this.table}
    WHERE ${this.scriptId} = ?`
}