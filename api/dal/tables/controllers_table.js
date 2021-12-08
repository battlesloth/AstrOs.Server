const table = 'controllers';
const id = 'id';
const controllerId = 'controllerId';
const name = 'name';
const create = `
CREATE TABLE IF NOT EXISTS ${table} (
    ${id} INTEGER PRIMARY KEY AUTOINCREMENT,
    ${controllerId} INTEGER UNIQUE,
    ${name} TEXT)`;

const insert = `
INSERT INTO ${table} 
(${controllerId}, ${name}) 
VALUES (?, ?)`;

const select = `
SELECT ${name}
FROM ${table}
WHERE ${controllerId} = ?`;

const updateName = `UPDATE ${table} SET ${name} = ? WHERE ${controllerId} = ?`;

module.exports = Object.freeze({
    Table: table,
    Id: id,
    ControllerId: controllerId,
    Name: name,
    Create: create,
    Insert: insert,
    Select: select,
    UpdateName: updateName
});