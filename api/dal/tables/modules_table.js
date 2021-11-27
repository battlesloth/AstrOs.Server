const table = 'modules';
const id = 'id';
const moduleId = 'moduleId';
const name = 'name';
const create = `
CREATE TABLE IF NOT EXISTS ${table} (
    ${id} INTEGER PRIMARY KEY AUTOINCREMENT,
    ${moduleId} TEXT UNIQUE,
    ${name} TEXT)`;

const insert = `INSERT INTO ${table} (${moduleId}, ${name}) VALUES (?, ?)`;
const updateName = `UPDATE ${table} SET ${name} = ? WHERE ${moduleId} = ?`;

module.exports = Object.freeze({
    Table: table,
    Id: id,
    ModuleId: moduleId,
    Name: name,
    Create: create,
    Insert: insert,
    UpdateName: updateName
});