const table = 'scripts';
const id = 'id';
const name = 'name';
const description = 'description';
const dateTimeCoreUploaded = 'dateTimeUploaded';
const uploadedCore = false;
const dateTimeDomeUploaded = 'dateTimeUploaded';
const uploadedDome = false;
const dateTimeBodyUploaded = 'dateTimeUploaded';
const uploadedBody = false;

const create = `
CREATE TABLE IF NOT EXISTS ${table} (
    ${id} INTEGER PRIMARY KEY AUTOINCREMENT,
    ${name} TEXT),
    ${description} TEXT,
    ${uploadedCore} INTEGER,
    ${dateTimeCoreUploaded} TEXT,
    ${uploadedDome} INTEGER,
    ${dateTimeDomeUploaded} TEXT,
    ${uploadedBody} INTEGER,
    ${dateTimeBodyUploaded} TEXT,`;

const insert = `
INSERT INTO ${table} 
(${name}, ${description}, 
    ${uploadedCore}, ${dateTimeCoreUploaded},
    ${uploadedDome}, ${dateTimeDomeUploaded},
    ${uploadedBody}, ${dateTimeBodyUploaded}) 
VALUES (?, ?, 
    0, '1970-01-01 00:00:00.000', 
    0, '1970-01-01 00:00:00.000', 
    0, '1970-01-01 00:00:00.000')`;

const selectAll = `
    SELECT ${id}, ${name}, ${description}, 
    ${uploadedCore}, ${dateTimeCoreUploaded},
    ${uploadedDome}, ${dateTimeDomeUploaded}, 
    ${uploadedBody}, ${dateTimeBodyUploaded}
    FROM ${table}
    WHERE ${id} = ?`;

const select = `
SELECT ${id}, ${name}, ${description}, 
${uploadedCore}, ${dateTimeCoreUploaded},
${uploadedDome}, ${dateTimeDomeUploaded}, 
${uploadedBody}, ${dateTimeBodyUploaded}
FROM ${table}
WHERE ${id} = ?`;

const updateScript = `
UPDATE ${table} 
SET ${name} = ?,
${description} = ?,
${uploadedCore} = ?,
${dateTimeCoreUploaded} = ?,
${uploadedDome} = ?,
${dateTimeDomeUploaded} = ?,
${uploadedBody} = ?, 
${dateTimeBodyUploaded} = ?
WHERE ${id} = ?`;

module.exports = Object.freeze({
    Table: table,
    Id: id,
    Name: name,
    UploadedCore: uploadedCore,
    DateTimeCoreUploaded: dateTimeCoreUploaded,
    UploadedDome: uploadedDome,
    DateTimeDomeUploaded: dateTimeCoreUploaded,
    UploadedBody: uploadedBody,
    DateTimeBodyUploaded: dateTimeCoreUploaded,
    Create: create,
    Insert: insert,
    SelectAll: selectAll,
    Select: select,
    UpdateScript: updateScript
});