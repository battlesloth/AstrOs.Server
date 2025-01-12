export class RemoteConfigTable {
  public static readonly table = "remote_config";
  public static readonly id = "id";
  public static readonly type = "type";
  public static readonly value = "value";

  public static readonly create = `CREATE TABLE IF NOT EXISTS ${this.table} (
    ${this.id} INTEGER PRIMARY KEY AUTOINCREMENT,
    ${this.type} TEXT UNIQUE,
    ${this.value} TEXT)`;

  public static readonly insert = `INSERT INTO ${this.table}
    (${this.type}, ${this.value})
    VALUES (?, ?)
    ON CONFLICT(${this.type})
    DO UPDATE 
    SET ${this.value} = excluded.${this.value}`;

  public static readonly select = `SELECT ${this.value}
    FROM ${this.table}
    WHERE ${this.type} = ?`;

  public static readonly update = `UPDATE ${this.table}
    SET ${this.value} = ?
    WHERE ${this.type} = ?`;

  public static readonly deleteValue = `DELETE FROM ${this.table}
    WHERE ${this.type} = ?`;
}
