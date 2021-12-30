export class ScriptsTable {

    public static readonly table = 'scripts';
    public static readonly id = 'id';
    public static readonly scriptName = 'scriptName';
    public static readonly description = 'description';
    public static readonly lastSaved = 'lastSaved';
    public static readonly dtCoreUploaded = 'dateTimeCoreUploaded';
    public static readonly uploadedCore = 'uploadedCore';
    public static readonly dtDomeUploaded = 'dateTimeDomeUploaded';
    public static readonly uploadedDome = 'uploadedDome';
    public static readonly dtBodyUploaded = 'dateTimeBodyUploaded';
    public static readonly uploadedBody = 'uploadedBody';

    public static readonly create =
    `CREATE TABLE IF NOT EXISTS ${this.table} (
    ${this.id} TEXT PRIMARY KEY,
    ${this.scriptName} TEXT,
    ${this.description} TEXT,
    ${this.lastSaved} TEXT,
    ${this.uploadedCore} INTEGER,
    ${this.dtCoreUploaded} TEXT,
    ${this.uploadedDome} INTEGER,
    ${this.dtDomeUploaded} TEXT,
    ${this.uploadedBody} INTEGER,
    ${this.dtBodyUploaded} TEXT)`;

    public static readonly insert =
    `INSERT OR REPLACE INTO ${this.table}
    (${this.id}, ${this.scriptName}, 
    ${this.description}, ${this.lastSaved},
    ${this.uploadedCore}, ${this.dtCoreUploaded},
    ${this.uploadedDome}, ${this.dtDomeUploaded},
    ${this.uploadedBody}, ${this.dtBodyUploaded})
    VALUES (?, ?, ?,
    0, '1970-01-01 00:00:00.000',
    0, '1970-01-01 00:00:00.000',
    0, '1970-01-01 00:00:00.000')`;

    public static readonly selectAll =
    `SELECT ${this.id}, 
    ${this.scriptName}, 
    ${this.description},
    ${this.lastSaved},
    ${this.uploadedCore}, 
    ${this.dtCoreUploaded},
    ${this.uploadedDome}, 
    ${this.dtDomeUploaded},
    ${this.uploadedBody}, 
    ${this.dtBodyUploaded}
    FROM ${this.table}
    WHERE ${this.id} = ?`;

    public static readonly select =
    `SELECT ${this.id}, 
    ${this.scriptName}, 
    ${this.description},
    ${this.lastSaved},
    ${this.uploadedCore}, 
    ${this.dtCoreUploaded},
    ${this.uploadedDome}, 
    ${this.dtDomeUploaded},
    ${this.uploadedBody}, 
    ${this.dtBodyUploaded}
    FROM ${this.table}
    WHERE ${this.id} = ?`;

    public static readonly updateScript =
    `UPDATE ${this.table}
    SET ${this.scriptName}} = ?,
    ${this.description} = ?,
    ${this.lastSaved} = ?,
    ${this.uploadedCore} = ?,
    ${this.dtCoreUploaded} = ?,
    ${this.uploadedDome} = ?,
    ${this.dtDomeUploaded} = ?,
    ${this.uploadedBody} = ?,
    ${this.dtBodyUploaded} = ?
    WHERE ${this.id} = ?`;
}