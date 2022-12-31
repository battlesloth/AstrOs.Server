export class ControllersTable {
    public static readonly table = 'controllers';
    public static readonly id = 'id';
    public static readonly controllerId = 'controllerId';
    public static readonly controllerName = 'controllerName';
    public static readonly controllerIp = 'controllerIp';
    public static readonly fingerprint = 'fingerprint';

    public static readonly create =
    `CREATE TABLE IF NOT EXISTS ${this.table} (
    ${this.id} INTEGER PRIMARY KEY AUTOINCREMENT,
    ${this.controllerId} INTEGER UNIQUE,
    ${this.controllerName} TEXT,
    ${this.controllerIp} TEXT,
    ${this.fingerprint} TEXT)`;

    public static readonly insert =
    `INSERT INTO ${this.table}
    (${this.controllerId}, ${this.controllerName}, ${this.controllerIp}, ${this.fingerprint})
    VALUES (?, ?, '', 1)`;

    public static readonly select =
    `SELECT ${this.controllerName},
            ${this.controllerIp},
            ${this.fingerprint}
    FROM ${this.table}
    WHERE ${this.controllerId} = ?`;

    public static readonly getIp =
    `SELECT ${this.controllerIp}
    FROM ${this.table}
    WHERE ${this.controllerId} = ?`;

    public static readonly updateIp =
    `UPDATE ${this.table}
    SET ${this.controllerIp} = ?
    WHERE ${this.controllerId} = ?`;

    public static readonly updateFingerprint =
    `UPDATE ${this.table}
    SET ${this.fingerprint} =?
    WHERE ${this.controllerId} = ?`;
}