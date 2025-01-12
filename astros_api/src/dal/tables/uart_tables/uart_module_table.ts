export class UartModuleTable {
  public static readonly table = "uart_modules";
  public static readonly id = "id";
  public static readonly locationId = "locationId";
  public static readonly uartType = "uartType";
  public static readonly uartChannel = "uartChannel";
  public static readonly baudRate = "baudRate";
  public static readonly moduleName = "name";

  public static readonly create = `CREATE TABLE IF NOT EXISTS ${this.table} (
    ${this.id} TEXT PRIMARY KEY,
    ${this.locationId} INTEGER NOT NULL,
    ${this.uartType} INTEGER NOT NULL,
    ${this.uartChannel} INTEGER NOT NULL,
    ${this.baudRate} INTEGER NOT NULL,
    ${this.moduleName} TEXT)`;

  public static readonly insert = `INSERT INTO ${this.table} (
    ${this.id}, 
    ${this.locationId}, 
    ${this.uartType}, 
    ${this.uartChannel}, 
    ${this.baudRate},
    ${this.moduleName})
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(${this.id}) DO UPDATE SET
    ${this.locationId} = excluded.${this.locationId},
    ${this.uartType} = excluded.${this.uartType},
    ${this.uartChannel} = excluded.${this.uartChannel},
    ${this.baudRate} = excluded.${this.baudRate},
    ${this.moduleName} = excluded.${this.moduleName}`;

  public static readonly select = `SELECT
    ${this.id},
    ${this.locationId},
    ${this.uartType},
    ${this.uartChannel},
    ${this.baudRate},
    ${this.moduleName}
    FROM ${this.table}
    WHERE ${this.id} = ?`;

  public static readonly selectAllForLocation = `SELECT 
    ${this.uartType}, 
    ${this.uartChannel},
    ${this.baudRate}, 
    ${this.moduleName}
    FROM ${this.table}
    WHERE ${this.locationId} = ?`;

  public static readonly delete = `DELETE FROM ${this.table} WHERE ${this.id} = ?`;
}
