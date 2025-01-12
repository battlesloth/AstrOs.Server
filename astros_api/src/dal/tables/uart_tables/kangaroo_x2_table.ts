export class KangarooX2Table {
  public static readonly table = "kangaroo_x2";
  public static readonly id = "id";
  public static readonly parentId = "parentId";
  public static readonly ch1Name = "ch1Name";
  public static readonly ch2Name = "ch2Name";

  public static readonly create = `CREATE TABLE IF NOT EXISTS ${this.table} (
        ${this.id} TEXT PRIMARY KEY,
        ${this.parentId} TEXT UNIQUE NOT NULL,
        ${this.ch1Name} TEXT,
        ${this.ch2Name} TEXT)`;

  public static readonly insert = `INSERT INTO ${this.table} (
        ${this.id}, 
        ${this.parentId},
        ${this.ch1Name},
        ${this.ch2Name})
        VALUES (?, ?, ?, ?)
        ON CONFLICT(${this.id}) DO UPDATE SET
        ${this.parentId} = excluded.${this.parentId},
        ${this.ch1Name} = excluded.${this.ch1Name},
        ${this.ch2Name} = excluded.${this.ch2Name}`;

  public static readonly selectByParent = `SELECT ${this.id},
        ${this.parentId},
        ${this.ch1Name},
        ${this.ch2Name}
        FROM ${this.table}
        WHERE ${this.parentId} = ?`;

  public static readonly deleteByParent = `DELETE FROM ${this.table} WHERE ${this.parentId} = ?`;
}
