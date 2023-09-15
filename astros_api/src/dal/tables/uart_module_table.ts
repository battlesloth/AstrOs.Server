export class UartModuleTable {
    public static readonly table = 'uart_modules';
    public static readonly id = 'id';
    public static readonly controllerId = 'controllerId';
    public static readonly uartSlot = 'uartSlot';
    public static readonly uartType = 'uartType';
    public static readonly moduleName = 'moduleName';
    public static readonly moduleJson = 'moduleJson';

    
    //DB version 5
    public static readonly v5Update = 
    `ALTER TABLE ${this.table}
    ADD ${this.uartSlot} INTEGER DEFAULT 1 NOT NULL;` 

    public static readonly v5Rename = 
    `ALTER TABLE ${this.table} RENAME TO old_${this.table};`;

    public static readonly v5NewTable =
    `CREATE TABLE IF NOT EXISTS ${this.table} (
        ${this.id} INTEGER PRIMARY KEY AUTOINCREMENT,
        ${this.controllerId} INTEGER,
        ${this.uartType} INTEGER,
        ${this.moduleName} TEXT,
        ${this.moduleJson} TEXT,
        ${this.uartSlot} INTEGER,
        CONSTRAINT unique_id_slot UNIQUE(${this.controllerId}, ${this.uartSlot}) ON CONFLICT REPLACE);`
    
    public static readonly v5Copy =
    `INSERT INTO ${this.table} SELECT * FROM old_${this.table};`

    public static readonly v5Drop =
    `DROP TABLE old_${this.table};`

    public static readonly create =
    `CREATE TABLE IF NOT EXISTS ${this.table} (
    ${this.id} INTEGER PRIMARY KEY AUTOINCREMENT,
    ${this.controllerId} INTEGER,
    ${this.uartType} INTEGER,
    ${this.moduleName} TEXT,
    ${this.moduleJson} TEXT,
    UNIQUE(${this.controllerId}) ON CONFLICT REPLACE)`;


    public static readonly insertV1 =
    `INSERT INTO ${this.table}
    (${this.controllerId}, ${this.uartType}, ${this.moduleName}, ${this.moduleJson})
    VALUES (?, ?, ?, ?)`;

    public static readonly insert =
    `INSERT INTO ${this.table}
    (${this.controllerId}, ${this.uartSlot}, ${this.uartType}, ${this.moduleName}, ${this.moduleJson})
    VALUES (?, ?, ?, ?, ?)`;

    public static readonly select =
    `SELECT ${this.uartType}, ${this.moduleName}, ${this.moduleJson}
    FROM ${this.table}
    WHERE ${this.controllerId} = ?
    AND ${this.uartSlot} = ?`;

    public static readonly update =
    `UPDATE ${this.table}
    SET ${this.uartType} = ?,
        ${this.moduleName}  = ?,
        ${this.moduleJson} = ?
    WHERE ${this.controllerId} = ?
    AND ${this.uartSlot} = ?`;
}