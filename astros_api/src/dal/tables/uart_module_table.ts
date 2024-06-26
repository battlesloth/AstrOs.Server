export class UartModuleTable {
    public static readonly table = 'uart_modules';
    public static readonly id = 'id';
    public static readonly locationId = 'locationId';
    public static readonly uartSlot = 'uartSlot';
    public static readonly uartType = 'uartType';
    public static readonly moduleName = 'moduleName';
    public static readonly moduleJson = 'moduleJson';

    public static readonly create =
        `CREATE TABLE IF NOT EXISTS ${this.table} (
    ${this.id} INTEGER PRIMARY KEY AUTOINCREMENT,
    ${this.locationId} INTEGER,
    ${this.uartType} INTEGER,
    ${this.moduleName} TEXT,
    ${this.moduleJson} TEXT,
    ${this.uartSlot} INTEGER,
    CONSTRAINT unique_id_slot UNIQUE(${this.locationId}, ${this.uartSlot}) ON CONFLICT REPLACE);`

    public static readonly insert =
        `INSERT INTO ${this.table}
    (${this.locationId}, ${this.uartSlot}, ${this.uartType}, ${this.moduleName}, ${this.moduleJson})
    VALUES (?, ?, ?, ?, ?)`;

    public static readonly select =
        `SELECT ${this.uartType}, ${this.moduleName}, ${this.moduleJson}
    FROM ${this.table}
    WHERE ${this.uartSlot} = ?
    AND ${this.locationId} = ?`;

    public static readonly update =
        `UPDATE ${this.table}
    SET ${this.uartType} = ?,
        ${this.moduleName}  = ?,
        ${this.moduleJson} = ?
    WHERE ${this.uartSlot} = ?
    AND ${this.locationId}  = ?`;
}