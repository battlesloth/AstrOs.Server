export class ScriptsTable {

    public static readonly table = 'scripts';
    public static readonly id = 'id';
    public static readonly scriptName = 'scriptName';
    public static readonly description = 'description';
    public static readonly lastSaved = 'lastSaved';
    public static readonly coreUploaded = 'coreUploaded';
    public static readonly domeUploaded = 'domeUploaded';
    public static readonly bodyUploaded = 'bodyUploaded';

    public static readonly create =
    `CREATE TABLE IF NOT EXISTS ${this.table} (
    ${this.id} TEXT PRIMARY KEY,
    ${this.scriptName} TEXT,
    ${this.description} TEXT,
    ${this.lastSaved} TEXT,
    ${this.coreUploaded} TEXT,
    ${this.domeUploaded} TEXT,
    ${this.bodyUploaded} TEXT)`;

    public static readonly insert =
    `INSERT OR REPLACE INTO ${this.table}
    (${this.id}, 
    ${this.scriptName}, 
    ${this.description}, 
    ${this.lastSaved},
    ${this.coreUploaded},
    ${this.domeUploaded},
    ${this.bodyUploaded})
    VALUES (?, 
        ?,
        ?, 
        ?,
        ?,
        ?,
        ?)`;

    public static readonly selectAll =
    `SELECT ${this.id}, 
    ${this.scriptName}, 
    ${this.description},
    ${this.lastSaved},
    ${this.coreUploaded}, 
    ${this.domeUploaded},
    ${this.bodyUploaded}
    FROM ${this.table}`;

    public static readonly select =
    `SELECT ${this.id}, 
    ${this.scriptName}, 
    ${this.description},
    ${this.lastSaved},
    ${this.coreUploaded},
    ${this.domeUploaded},
    ${this.bodyUploaded}
    FROM ${this.table}
    WHERE ${this.id} = ?`;

    public static readonly updateScript =
    `UPDATE ${this.table}
    SET ${this.scriptName}} = ?,
    ${this.description} = ?,
    ${this.lastSaved} = ?,
    ${this.coreUploaded} = ?,
    ${this.domeUploaded} = ?,
    ${this.bodyUploaded} = ?
    WHERE ${this.id} = ?`;

    public static readonly updateScriptCoreUploaded = 
    `UPDATE ${this.table}
    SET ${this.coreUploaded} = ?
    WHERE ${this.id} = ?
    `;

    public static readonly updateScriptDomeUploaded = 
    `UPDATE ${this.table}
    SET ${this.domeUploaded} = ?
    WHERE ${this.id} = ?
    `;

    public static readonly updateScriptBodyUploaded = 
    `UPDATE ${this.table}
    SET ${this.bodyUploaded} = ?
    WHERE ${this.id} = ?
    `;
}