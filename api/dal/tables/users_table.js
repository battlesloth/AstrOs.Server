const table = 'users';
const id = 'id';
const user = 'user';
const hash = 'hash';
const salt = 'salt';
const create = `
CREATE TABLE IF NOT EXISTS ${table} (
    ${id} INTEGER PRIMARY KEY AUTOINCREMENT,
    ${user} TEXT UNIQUE,
    ${hash} TEXT,
    ${salt} TEXT)`; 

const insert = `INSERT INTO ${table} (${user}, ${hash}, ${salt}) VALUES (?, ?, ?)`

const select =  `SELECT ${user}, ${hash}, ${salt} FROM ${table} WHERE ${user} = ?`

module.exports = Object.freeze({
    Table: table,
    Id: id,
    User: user,
    Hash: hash,
    Salt: salt,
    Create: create,
    Insert: insert,
    select: select
});