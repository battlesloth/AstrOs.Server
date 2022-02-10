export class ScriptsTable {

    public static readonly table = 'scripts';
    public static readonly id = 'id';
    public static readonly scriptName = 'scriptName';
    public static readonly description = 'description';
    public static readonly lastSaved = 'lastSaved';
    public static readonly dtCoreUploaded = 'dtCoreUploaded';
    public static readonly coreUploaded = 'coreUploaded';
    public static readonly dtDomeUploaded = 'dtDomeUploaded';
    public static readonly domeUploaded = 'domeUploaded';
    public static readonly dtBodyUploaded = 'dtBodyUploaded';
    public static readonly bodyUploaded = 'bodyUploaded';

    public static readonly create =
    `CREATE TABLE IF NOT EXISTS ${this.table} (
    ${this.id} TEXT PRIMARY KEY,
    ${this.scriptName} TEXT,
    ${this.description} TEXT,
    ${this.lastSaved} TEXT,
    ${this.coreUploaded} INTEGER,
    ${this.dtCoreUploaded} TEXT,
    ${this.domeUploaded} INTEGER,
    ${this.dtDomeUploaded} TEXT,
    ${this.bodyUploaded} INTEGER,
    ${this.dtBodyUploaded} TEXT)`;

    public static readonly insert =
    `INSERT OR REPLACE INTO ${this.table}
    (${this.id}, ${this.scriptName}, 
    ${this.description}, ${this.lastSaved},
    ${this.coreUploaded}, ${this.dtCoreUploaded},
    ${this.domeUploaded}, ${this.dtDomeUploaded},
    ${this.bodyUploaded}, ${this.dtBodyUploaded})
    VALUES (?, ?,
    ?, ?,
    ?, ?,
    ?, ?,
    ?, ?)`;

    public static readonly selectAll =
    `SELECT ${this.id}, 
    ${this.scriptName}, 
    ${this.description},
    ${this.lastSaved},
    ${this.coreUploaded}, 
    ${this.dtCoreUploaded},
    ${this.domeUploaded}, 
    ${this.dtDomeUploaded},
    ${this.bodyUploaded}, 
    ${this.dtBodyUploaded}
    FROM ${this.table}`;

    public static readonly select =
    `SELECT ${this.id}, 
    ${this.scriptName}, 
    ${this.description},
    ${this.lastSaved},
    ${this.coreUploaded}, 
    ${this.dtCoreUploaded},
    ${this.domeUploaded}, 
    ${this.dtDomeUploaded},
    ${this.bodyUploaded}, 
    ${this.dtBodyUploaded}
    FROM ${this.table}
    WHERE ${this.id} = ?`;

    public static readonly updateScript =
    `UPDATE ${this.table}
    SET ${this.scriptName}} = ?,
    ${this.description} = ?,
    ${this.lastSaved} = ?,
    ${this.coreUploaded} = ?,
    ${this.dtCoreUploaded} = ?,
    ${this.domeUploaded} = ?,
    ${this.dtDomeUploaded} = ?,
    ${this.bodyUploaded} = ?,
    ${this.dtBodyUploaded} = ?
    WHERE ${this.id} = ?`;
}