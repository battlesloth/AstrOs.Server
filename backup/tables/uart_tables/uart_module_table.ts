export class UartModuleTable {
  public static readonly table = "uart_modules";
  public static readonly id = "id";
  public static readonly moduleName = "moduleName";
  public static readonly locationId = "locationId";
  public static readonly uartType = "uartType";
  public static readonly uartChannel = "uartChannel";
  public static readonly baudRate = "baudRate";

  public static readonly create = `CREATE TABLE IF NOT EXISTS ${this.table} (
    ${this.id} TEXT PRIMARY KEY,
    ${this.locationId} TEXT NOT NULL,
    ${this.moduleName} TEXT,
    ${this.uartType} INTEGER NOT NULL,
    ${this.uartChannel} INTEGER NOT NULL,
    ${this.baudRate} INTEGER NOT NULL)`;

  public static readonly insert = `INSERT INTO ${this.table} (
    ${this.id}, 
    ${this.moduleName},
    ${this.locationId}, 
    ${this.uartType}, 
    ${this.uartChannel}, 
    ${this.baudRate})
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(${this.id}) DO UPDATE SET
    ${this.moduleName} = excluded.${this.moduleName},
    ${this.locationId} = excluded.${this.locationId},
    ${this.uartType} = excluded.${this.uartType},
    ${this.uartChannel} = excluded.${this.uartChannel},
    ${this.baudRate} = excluded.${this.baudRate}`;

  public static readonly select = `SELECT
    ${this.id},
    ${this.moduleName},
    ${this.locationId},
    ${this.uartType},
    ${this.uartChannel},
    ${this.baudRate}
    FROM ${this.table}
    WHERE ${this.id} = ?`;

  public static readonly selectAllForLocation = `SELECT 
    ${this.id},
    ${this.moduleName},
    ${this.locationId},
    ${this.uartType}, 
    ${this.uartChannel},
    ${this.baudRate}
    FROM ${this.table}
    WHERE ${this.locationId} = ?`;

  public static readonly delete = `DELETE FROM ${this.table} WHERE ${this.id} = ?`;
}
