export class ControllersTable {
    public static readonly table = 'controllers';
    public static readonly id = 'id';
    public static readonly controllerId = 'controllerId';
    public static readonly controllerName = 'controllerName';
    public static readonly controllerIp = 'controllerIp';

    public static readonly create =
    `CREATE TABLE IF NOT EXISTS ${this.table} (
    ${this.id} INTEGER PRIMARY KEY AUTOINCREMENT,
    ${this.controllerId} INTEGER UNIQUE,
    ${this.controllerName} TEXT,
    ${this.controllerIp} TEXT)`;

    public static readonly insert =
    `INSERT INTO ${this.table}
    (${this.controllerId}, ${this.controllerName})
    VALUES (?, ?)`;

    public static readonly select =
    `SELECT ${this.controllerName},
            ${this.controllerIp}
    FROM ${this.table}
    WHERE ${this.controllerId} = ?`;

    public static readonly updateIp =
    `UPDATE ${this.table}
    SET ${this.controllerIp} = ?
    WHERE ${this.controllerId} = ?`;
}