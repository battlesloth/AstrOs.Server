const table = 'pwm_channels';
const id = 'id';
const moduleId = 'moduleId';
const channelId = 'channelId';
const name = 'name';
const type = 'type';
const limit0 = 'limit0';
const limit1 = 'limit1';

const create =`
CREATE TABLE IF NOT EXISTS ${table} (
    ${id} INTEGER PRIMARY KEY AUTOINCREMENT,
    ${moduleId} TEXT,
    ${channelId} INTEGER,
    ${name} TEXT,
    ${type} INTEGER,
    ${limit0} INTEGER,
    ${limit1} INTEGER,
    UNIQUE(${moduleId}, ${channelId}) ON CONFLICT REPLACE)`;

const insert = 
`INSERT INTO ${table} 
(${moduleId}, ${channelId}, ${name}, ${type}, ${limit0}, ${limit1}) 
VALUES (?, ?, ?, ?, ?, ?)`;

const select =
`SELECT ${channelId}, ${name}, ${type}, ${limit0}, ${limit1}
WHERE ${moduleId} = ?` ;

const update =
`UPDATE ${table} 
SET ${name} = ?, ${type} = ?, ${limit0} = ?, ${limit1} = ? 
WHERE ${moduleId} = ? AND ${channelId} = ?`;


module.exports = Object.freeze({
    Table: table,
    Id: id,
    ModuleId: moduleId,
    ChannelId: channelId,
    Name: name,
    Type: type,
    Limit0: limit0,
    Limit1: limit1,
    Create: create,
    Select: select,
    Insert: insert,
    Update: update
});