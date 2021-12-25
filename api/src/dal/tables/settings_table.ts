
export class SettingsTable {

    public static readonly table = 'settings';
    public static readonly id = 'id';
    public static readonly key = 'key';
    public static readonly value = 'value';

    public static readonly create =
    `CREATE TABLE IF NOT EXISTS ${this.table} (
    ${this.id} INTEGER PRIMARY KEY AUTOINCREMENT,
    ${this.key} TEXT UNIQUE,
    ${this.value} TEXT)`;

    public static readonly insert =
    `INSERT INTO ${this.table}
    (${this.key}, ${this.value})
    VALUES (?, ?)`;

    public static readonly select =
    `SELECT ${this.value}
    FROM ${this.table}
    WHERE ${this.key} = ?`;

    public static readonly update =
    `UPDATE ${this.table}
    SET ${this.value} = ?
    WHERE ${this.key} = ?`;

    public static readonly deleteValue =
    `DELETE FROM ${this.table}
    WHERE ${this.key} = ?`;
}
