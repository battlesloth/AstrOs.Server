const table = 'i2c_channels';
const id = 'id';
const moduleId = 'moduleId';
const channelId = 'channelId';
const name = 'name';

const create =`
CREATE TABLE IF NOT EXISTS ${table} (
    ${id} INTEGER PRIMARY KEY AUTOINCREMENT,
    ${moduleId} TEXT,
    ${channelId} INTEGER,
    ${name} TEXT,
    UNIQUE(${moduleId}, ${channelId}) ON CONFLICT REPLACE)`;

const insert = 
`INSERT INTO ${table} 
(${moduleId}, ${channelId}, ${name}) 
VALUES (?, ?, ?)`;

const selectAll =
`SELECT ${channelId}, ${name} 
FROM ${table}
WHERE ${moduleId} = ?` ;

const update =
`UPDATE ${table} 
SET ${name} = ? 
WHERE ${moduleId} = ? AND ${channelId} = ?`;


module.exports = Object.freeze({
    Table: table,
    Id: id,
    ModuleId: moduleId,
    ChannelId: channelId,
    Name: name,
    Create: create,
    SelectAll: selectAll,
    Insert: insert,
    Update: update
});