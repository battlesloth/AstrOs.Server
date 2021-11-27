const table = 'settings';
const id = 'id';
const key = 'key';
const value = 'value';

const create = `
CREATE TABLE IF NOT EXISTS ${table} (
    ${id} INTEGER PRIMARY KEY AUTOINCREMENT,
    ${key} TEXT UNIQUE,
    ${value} TEXT)`;

const insert = `INSERT INTO ${table} (${key}, ${value}) VALUES (?, ?)`;

const select = `SELECT ${value} FROM ${table} WHERE ${key} = ?`;

const update = `UPDATE ${table} SET ${value} = ? WHERE ${key} = ?`;

const deleteValue = `DELETE FROM ${table} WHERE ${key} = ?`;

module.exports = Object.freeze({
    Table: table,
    Id: id,
    Key: key,
    Value: value,
    Create: create,
    Insert: insert,
    Select: select,
    Update: update,   
    Delete: deleteValue
});
