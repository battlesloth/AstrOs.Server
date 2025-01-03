export class MaestroBoardsTable {
    public static readonly table = "maestro_boards";
    public static readonly id = "id";
    public static readonly parentId = "parentId";
    public static readonly boardId = "boardId";
    public static readonly boardName = "boardName";

    public static readonly create =
        `CREATE TABLE IF NOT EXISTS ${this.table} (
        ${this.id} TEXT PRIMARY KEY,
        ${this.parentId} TEXT,
        ${this.boardId} NUMBER,
        ${this.boardName} TEXT)`;

    public static readonly insert =
        `INSERT INTO ${this.table} (
        ${this.id}, 
        ${this.parentId},
        ${this.boardId},
        ${this.boardName})
        VALUES (?, ?, ?, ?)
        ON CONFLICT(${this.id}) DO UPDATE SET
        ${this.parentId} = excluded.${this.parentId},
        ${this.boardId} = excluded.${this.boardId},
        ${this.boardName} = excluded.${this.boardName}`;

    public static readonly selectAllForParent =
        `SELECT ${this.id},
        ${this.parentId},
        ${this.boardId},
        ${this.boardName}
        FROM ${this.table}
        WHERE ${this.parentId} = ?`;

    public static readonly selectIdsForParent =
        `SELECT ${this.id}
        FROM ${this.table}
        WHERE ${this.parentId} = ?`;

    public static readonly deleteByParent =
        `DELETE FROM ${this.table} WHERE ${this.parentId} = ?`;

}