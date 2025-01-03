export class LocationsTable {
    public static readonly table = "locations";
    public static readonly id = "id";
    public static readonly locationName = "name";
    public static readonly description = "description";
    public static readonly configFingerprint = "configFingerprint";

    public static readonly create = `CREATE TABLE IF NOT EXISTS ${this.table} (
    ${this.id} INTEGER PRIMARY KEY AUTOINCREMENT,
    ${this.locationName} TEXT UNIQUE,
    ${this.description} TEXT,
    ${this.configFingerprint} TEXT)`;

    public static readonly insert =
        `INSERT INTO ${this.table}
    (${this.locationName}, 
    ${this.description},
    ${this.configFingerprint})
    VALUES (?, ?, ?)
    RETURNING id`;

    public static readonly selectByName =
        `SELECT 
    ${this.id}, 
    ${this.locationName}, 
    ${this.description},
    ${this.configFingerprint}
    FROM ${this.table}
    WHERE ${this.locationName} = ?`;

    public static readonly selectById =
        `SELECT
    ${this.id},
    ${this.locationName},
    ${this.description},
    ${this.configFingerprint}
    FROM ${this.table}
    WHERE ${this.id} = ?`;

    public static readonly selectAll =
        `SELECT
    ${this.id},
    ${this.locationName},
    ${this.description},
    ${this.configFingerprint}
    FROM ${this.table}`;

    public static readonly update =
        `UPDATE ${this.table}
    SET ${this.locationName} = ?,
    SET ${this.description} = ?,
    SET ${this.configFingerprint} = ?
    WHERE ${this.id} = ?`;

    public static readonly updateFingerprint =
        `UPDATE ${this.table}
    SET ${this.configFingerprint} = ?
    WHERE ${this.id} = ?`;

    public static readonly delete =
        `DELETE FROM ${this.table}
    WHERE ${this.id} = ?`;

}