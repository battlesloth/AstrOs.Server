export class I2cModuleTable {
  public static readonly table = "i2c_modules";
  public static readonly id = "id";
  public static readonly moduleName = "name";
  public static readonly locationId = "locationId";
  public static readonly i2cAddress = "i2cAddress";
  public static readonly i2cType = "i2cType";

  public static readonly create = `CREATE TABLE IF NOT EXISTS ${this.table} (
    ${this.id} TEXT PRIMARY KEY,
    ${this.moduleName} TEXT NOT NULL,
    ${this.locationId} TEXT NOT NULL,
    ${this.i2cType} INTEGER NOT NULL,
    ${this.i2cAddress} INTEGER NOT NULL)`;

  public static readonly insert = `INSERT INTO ${this.table} (
    ${this.id}, 
    ${this.moduleName}, 
    ${this.locationId}, 
    ${this.i2cType}, 
    ${this.i2cAddress})
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(${this.id}) DO UPDATE SET
    ${this.moduleName} = excluded.${this.moduleName},
    ${this.locationId} = excluded.${this.locationId},
    ${this.i2cType} = excluded.${this.i2cType},
    ${this.i2cAddress} = excluded.${this.i2cAddress}`;

  public static readonly select = `SELECT
    ${this.id},
    ${this.moduleName},
    ${this.locationId},
    ${this.i2cType},
    ${this.i2cAddress}
    FROM ${this.table}
    WHERE ${this.id} = ?`;

  public static readonly selectAllForLocation = `SELECT
    ${this.id},
    ${this.moduleName},
    ${this.locationId},
    ${this.i2cType},
    ${this.i2cAddress}
    FROM ${this.table}
    WHERE ${this.locationId} = ?`;

  public static readonly delete = `DELETE FROM ${this.table} WHERE ${this.id} = ?`;
}
