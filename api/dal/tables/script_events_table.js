const table = 'script_events';
const id = 'id';
const scriptId = 'scriptId';
const dataJson = dataJson;

const create = `
CREATE TABLE IF NOT EXISTS ${table} (
    ${id} INTEGER PRIMARY KEY AUTOINCREMENT,
    ${scriptId} INTEGER),
    ${dataJson} TEXT`;

const insert = `
INSERT INTO ${table} 
(${scriptId}, ${dataJson}) 
VALUES (?, ?)`;

const select = `
SELECT ${id}, ${scriptId}, ${dataJson}
FROM ${table}
WHERE ${id} = ?`;

const updateName = `
UPDATE ${table} 
SET ${scriptId} = ?,
${dataJson} = ?, 
WHERE ${id} = ?`;

const deleteAllForScript =`
DELETE FROM ${table}
WHERE ${scriptId} = ?`

module.exports = Object.freeze({
    Table: table,
    Id: id,
    ScriptId: scriptId,
    DataJson: dataJson,
    Create: create,
    Insert: insert,
    Select: select,
    UpdateName: updateName,
    DeleteAllForScript: deleteAllForScript
});