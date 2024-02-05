export class ControllersTable {
    public static readonly table = "controllers";
    public static readonly id = "id";
    public static readonly controllerLocation = "controllerLocation";
    public static readonly controllerName = "controllerName";
    public static readonly controllerDescription = "controllerDescription";
    public static readonly controllerAddress = "controllerAddress";
    public static readonly fingerprint = "fingerprint";

    public static readonly create = `CREATE TABLE IF NOT EXISTS ${this.table} (
    ${this.id} INTEGER PRIMARY KEY AUTOINCREMENT,
    ${this.controllerLocation} TEXT UNIQUE,
    ${this.controllerName} TEXT UNIQUE,
    ${this.controllerDescription} TEXT,
    ${this.controllerAddress} TEXT,
    ${this.fingerprint} TEXT)`;

    public static readonly insert =
        `INSERT INTO ${this.table}
    (${this.controllerLocation}, 
        ${this.controllerName}, 
        ${this.controllerDescription}, 
        ${this.controllerAddress}, 
        ${this.fingerprint})
    VALUES (?, ?, ?, ?, ?)`;

    public static readonly selectIdByLocation =
        `SELECT ${this.id}
    FROM ${this.table}
    WHERE ${this.controllerLocation} = ?`;

    public static readonly select =
        `SELECT 
    ${this.controllerLocation},          
    ${this.controllerName},
    ${this.controllerDescription},
    ${this.controllerAddress},
    ${this.fingerprint}
    FROM ${this.table}
    WHERE ${this.id} = ?`;

    public static readonly selectAll =
        `SELECT 
    ${this.id}, 
    ${this.controllerLocation},
    ${this.controllerName},
    ${this.controllerDescription},
    ${this.controllerAddress},
    ${this.fingerprint}
    FROM ${this.table}`;

    public static readonly update =
        `UPDATE ${this.table}
    SET ${this.controllerLocation} = ?,
    SET ${this.controllerName} = ?,
    SET ${this.controllerDescription} = ?,
    SET ${this.controllerAddress} = ?,
    SET ${this.fingerprint} = ?
    WHERE ${this.id} = ?`;

    public static readonly getNameAndAddress =
        `SELECT ${this.controllerName},
    ${this.controllerAddress}    
    FROM ${this.table}
    WHERE ${this.id} = ?`;

    public static readonly updateNameAndAddress =
        `UPDATE ${this.table}
    SET ${this.controllerName} = ?,
    SET ${this.controllerAddress} = ?
    WHERE ${this.id} = ?`;

    public static readonly updateFingerprint =
        `UPDATE ${this.table}
    SET ${this.fingerprint} =?
    WHERE ${this.id} = ?`;
}
