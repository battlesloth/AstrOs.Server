import { ControllersTable } from "./controllers_table";
import { LocationsTable } from "./locations_table";

export class ControllerLocationTable {
    public static readonly table = "controller_location";
    public static readonly locationId = "locationId";
    public static readonly controllerId = "controllerId";

    public static readonly create = `CREATE TABLE IF NOT EXISTS ${this.table} (
        ${this.locationId} INTEGER,
        ${this.controllerId} INTEGER,
        PRIMARY KEY (${this.locationId}, ${this.controllerId}),
        FOREIGN KEY (${this.locationId}) REFERENCES ${LocationsTable.table}(${LocationsTable.id}),
        FOREIGN KEY (${this.controllerId}) REFERENCES ${ControllersTable.table}(${ControllersTable.id}))`;

    public static readonly insert = `INSERT INTO ${this.table} 
    (${this.locationId}, ${this.controllerId}) 
    VALUES (?, ?)`;

    public static readonly selectByLocation = `SELECT ${this.controllerId} 
    FROM ${this.table} 
    WHERE ${this.locationId} = ?`;

    public static readonly selectByController = `SELECT ${this.locationId}
    FROM ${this.table}
    WHERE ${this.controllerId} = ?`;

    public static readonly selectLocationControllers = `SELECT
    l.${LocationsTable.id} as locationId,
    l.${LocationsTable.locationName} as locationName,
    l.${LocationsTable.description} as locationDescription,
    l.${LocationsTable.configFingerprint} as locationFingerprint,
    c.${ControllersTable.id} as controllerId,
    c.${ControllersTable.controllerName} as controllerName,
    c.${ControllersTable.controllerAddress} as controllerAddress
    FROM ${LocationsTable.table} l
    LEFT JOIN ${this.table} cl ON l.${LocationsTable.id} = cl.${this.locationId}
    LEFT JOIN ${ControllersTable.table} c ON c.${ControllersTable.id} = cl.${this.controllerId}`;

    public static readonly selectLocationByController = `SELECT
    l.${LocationsTable.id} as locationId,
    l.${LocationsTable.locationName} as locationName,
    l.${LocationsTable.description} as locationDescription,
    l.${LocationsTable.configFingerprint} as locationFingerprint
    FROM ${LocationsTable.table} l
    JOIN ${this.table} cl ON l.${LocationsTable.id} = cl.${this.locationId}
    WHERE cl.${this.controllerId} = ?`;

    public static readonly selectAll = `SELECT 
    ${this.controllerId}, 
    ${this.locationId} 
    FROM ${this.table}`;

    public static readonly delete = `DELETE FROM ${this.table} 
    WHERE ${this.locationId} = ? 
    AND ${this.controllerId} = ?`;
}