export class ControllersTable {
    public static readonly table = "controllers";
    public static readonly id = "id";
    public static readonly controllerName = "controllerName";
    public static readonly controllerAddress = "controllerAddress";

    public static readonly create = `CREATE TABLE IF NOT EXISTS ${this.table} (
    ${this.id} INTEGER PRIMARY KEY AUTOINCREMENT,
    ${this.controllerName} TEXT UNIQUE,
    ${this.controllerAddress} TEXT UNIQUE)`;

    public static readonly insert =
        `INSERT INTO ${this.table}
    (${this.controllerName}, 
    ${this.controllerAddress})
    VALUES (?, ?)
    RETURNING id`;

    public static readonly upsert =
        `INSERT INTO ${this.table}
    (${this.controllerName},
    ${this.controllerAddress})
    VALUES (?, ?)
    ON CONFLICT(${this.controllerAddress})
    DO UPDATE SET
    ${this.controllerName} = ?
    ${this.controllerAddress} = ?
    RETURNING id`;

    public static readonly select =
        `SELECT 
    ${this.controllerName},
    ${this.controllerAddress}
    FROM ${this.table}
    WHERE ${this.id} = ?`;

    public static readonly selectAll =
        `SELECT 
    ${this.id}, 
    ${this.controllerName},
    ${this.controllerAddress}
    FROM ${this.table}`;

    public static readonly selectByAddress =
        `SELECT
    ${this.id},
    ${this.controllerName},
    ${this.controllerAddress}
    FROM ${this.table}
    WHERE ${this.controllerAddress} = ?`;

    public static readonly update =
        `UPDATE ${this.table}
    SET ${this.controllerName} = ?,
    SET ${this.controllerAddress} = ?
    WHERE ${this.id} = ?`;
}
