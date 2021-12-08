const table = 'i2c_channels';
const id = 'id';
const controllerId = 'controllerId';
const channelId = 'channelId';
const name = 'name';

const create =`
CREATE TABLE IF NOT EXISTS ${table} (
    ${id} INTEGER PRIMARY KEY AUTOINCREMENT,
    ${controllerId} INTEGER,
    ${channelId} INTEGER,
    ${name} TEXT,
    UNIQUE(${controllerId}, ${channelId}) ON CONFLICT REPLACE)`;

const insert = 
`INSERT INTO ${table} 
(${controllerId}, ${channelId}, ${name}) 
VALUES (?, ?, ?)`;

const selectAll =
`SELECT ${channelId}, ${name} 
FROM ${table}
WHERE ${controllerId} = ?` ;

const update =
`UPDATE ${table} 
SET ${name} = ? 
WHERE ${controllerId} = ? AND ${channelId} = ?`;


module.exports = Object.freeze({
    Table: table,
    Id: id,
    ControllerId: controllerId,
    ChannelId: channelId,
    Name: name,
    Create: create,
    SelectAll: selectAll,
    Insert: insert,
    Update: update
});