export class LocationsTable {
  public static readonly table = "locations";
  public static readonly id = "id";
  public static readonly locationId = "locationId";
  public static readonly locationName = "name";
  public static readonly description = "description";
  public static readonly configFingerprint = "configFingerprint";

  public static readonly create = `CREATE TABLE IF NOT EXISTS ${this.table} (
    ${this.id} TEXT PRIMARY KEY,
    ${this.locationId} TEXT,
    ${this.locationName} TEXT,
    ${this.description} TEXT,
    ${this.configFingerprint} TEXT)`;

  public static readonly insert = `INSERT INTO ${this.table} (
    ${this.id}, 
    ${this.locationId},
    ${this.locationName}, 
    ${this.description},
    ${this.configFingerprint})
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(${this.id}) DO UPDATE SET
    ${this.locationId} = excluded.${this.locationId},
    ${this.locationName} = excluded.${this.locationName},
    ${this.description} = excluded.${this.description},
    ${this.configFingerprint} = excluded.${this.configFingerprint}`;

  public static readonly selectByName = `SELECT 
    ${this.id}, 
    ${this.locationId},
    ${this.locationName}, 
    ${this.description},
    ${this.configFingerprint}
    FROM ${this.table}
    WHERE ${this.locationName} = ?`;

  public static readonly selectById = `SELECT
    ${this.id},
    ${this.locationId},
    ${this.locationName},
    ${this.description},
    ${this.configFingerprint}
    FROM ${this.table}
    WHERE ${this.id} = ?`;

  public static readonly selectByLocationId = `SELECT
    ${this.id},
    ${this.locationId},
    ${this.locationName},
    ${this.description},
    ${this.configFingerprint}
    FROM ${this.table}
    WHERE ${this.locationId} = ?`;

  public static readonly selectAll = `SELECT
    ${this.id},
    ${this.locationId},
    ${this.locationName},
    ${this.description},
    ${this.configFingerprint}
    FROM ${this.table}`;

  public static readonly update = `UPDATE ${this.table}
    SET ${this.locationName} = ?,
    SET ${this.description} = ?,
    SET ${this.configFingerprint} = ?
    WHERE ${this.id} = ?`;

  public static readonly updateFingerprint = `UPDATE ${this.table}
    SET ${this.configFingerprint} = ?
    WHERE ${this.id} = ?`;

  public static readonly delete = `DELETE FROM ${this.table}
    WHERE ${this.id} = ?`;
}
