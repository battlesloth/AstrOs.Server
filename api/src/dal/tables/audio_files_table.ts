
export class AudioFilesTable {
    public static readonly table = 'audio_files';
    public static readonly id = 'id';
    public static readonly fileName = 'fileName';
    public static readonly description = 'description';
    public static readonly duration = 'duration';

    public static readonly create =
    `CREATE TABLE IF NOT EXISTS ${this.table} (
    ${this.id} TEXT PRIMARY KEY,
    ${this.fileName} TEXT,
    ${this.description} TEXT,
    ${this.duration} INTEGER)`;

    public static readonly insert =
    `INSERT INTO ${this.table}
    (${this.id}, ${this.fileName}, ${this.description}, ${this.duration})
    VALUES (?, ?, ?, ?)`


    public static readonly updateDuration =
    `UPDATE ${this.table}
    SET ${this.duration} = ?
    WHERE ${this.id} = ?`

    public static readonly selectAll =
    `SELECT ${this.id},
    ${this.fileName},
    ${this.description},
    ${this.duration}
    FROM ${this.table}`

    public static readonly delete =
    `DELETE FROM ${this.table}
    WHERE ${this.id} = ?`

    public static readonly selectZeroDuration =
    `SELECT ${this.id}
    FROM ${this.table}
    WHERE ${this.duration} = 0`
}
