const table = 'pwm_channels';
const id = 'id';
const controllerId = 'controllerId';
const channelId = 'channelId';
const name = 'name';
const type = 'type';
const limit0 = 'limit0';
const limit1 = 'limit1';

const create =`
CREATE TABLE IF NOT EXISTS ${table} (
    ${id} INTEGER PRIMARY KEY AUTOINCREMENT,
    ${controllerId} INTEGER,
    ${channelId} INTEGER,
    ${name} TEXT,
    ${type} INTEGER,
    ${limit0} INTEGER,
    ${limit1} INTEGER,
    UNIQUE(${controllerId}, ${channelId}) ON CONFLICT REPLACE)`;

const insert = 
`INSERT INTO ${table} 
(${controllerId}, ${channelId}, ${name}, ${type}, ${limit0}, ${limit1}) 
VALUES (?, ?, ?, ?, ?, ?)`;

const selectAll =
`SELECT ${channelId}, ${name}, ${type}, ${limit0}, ${limit1}
FROM ${table}
WHERE ${controllerId} = ?` ;

const update =
`UPDATE ${table} 
SET ${name} = ?, ${type} = ?, ${limit0} = ?, ${limit1} = ? 
WHERE ${controllerId} = ? AND ${channelId} = ?`;


module.exports = Object.freeze({
    Table: table,
    Id: id,
    ControllerId: controllerId,
    ChannelId: channelId,
    Name: name,
    Type: type,
    Limit0: limit0,
    Limit1: limit1,
    Create: create,
    SelectAll: selectAll,
    Insert: insert,
    Update: update
});