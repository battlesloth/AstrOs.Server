
export class UsersTable {
    public static readonly table = 'users';
    public static readonly id = 'id';
    public static readonly user = 'user';
    public static readonly hash = 'hash';
    public static readonly salt = 'salt';

    public static readonly create =
    `CREATE TABLE IF NOT EXISTS ${this.table} (
    ${this.id} INTEGER PRIMARY KEY AUTOINCREMENT,
    ${this.user} TEXT UNIQUE,
    ${this.hash} TEXT,
    ${this.salt} TEXT)`;

    public static readonly insert =
    `INSERT INTO ${this.table}
    (${this.user}, ${this.hash}, ${this.salt})
    VALUES (?, ?, ?)`

    public static readonly select =
    `SELECT ${this.user},
    ${this.hash},
    ${this.salt}
    FROM ${this.table}
    WHERE ${this.user} = ?`
}
