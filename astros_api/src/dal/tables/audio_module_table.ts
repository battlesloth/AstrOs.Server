export class AudioModuleTable {
    public static readonly table = 'audio_module';
    public static readonly key = 'key';
    public static readonly value = 'value';

    public static readonly create =
    `CREATE TABLE IF NOT EXISTS ${this.table} (
    ${this.key} TEXT PRIMARY KEY,
    ${this.value} TEXT)`;

    public static readonly insert =
    `INSERT OR REPLACE INTO ${this.table}
    (${this.key}, ${this.value})
    VALUES (?, ?)`

    public static readonly selectAll =
    `SELECT ${this.key},
    ${this.value}
    FROM ${this.table}`

    public static readonly getType =
    `SELECT ${this.value}
    FROM ${this.table}
    WHERE ${this.key} = type`

    public static readonly deleteAll =
    `DELETE FROM ${this.table}`

    public static readonly delete =
    `DELETE FROM ${this.table}
    WHERE ${this.key} = ?`

    public static readonly update =
    `UPDATE ${this.table}
    SEET ${this.value} = ?
    WHERE ${this.key} = ?`
}
