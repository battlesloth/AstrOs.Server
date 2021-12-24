import { Script } from "../../models/Scripts/script";
import { ScriptsTable } from "../../dal/tables/scripts_table";
import { DataAccess } from "../../dal/data_access";
import { uuid } from "uuidv4";

export class ScriptRepository {

    dao: DataAccess

    constructor(dao: DataAccess) {
        this.dao = dao;
        this.dao.connect();
    }

    async getScripts() : Promise<Array<Script>> {
        const result = new Array<Script>();

        await this.dao.get(ScriptsTable.selectAll)
        .then((val: any) =>{
            val.forEach((scr: any) => {
                result.push(
                    new Script(scr.id, scr.scriptName, 
                        scr.description, scr.lastSaved,
                        DataAccess.fromDbBool(scr.uploadedCore), scr.dateTimeCoreUploaded,
                        DataAccess.fromDbBool(scr.uploadedDome), scr.dateTimeDomeUploaded,
                        DataAccess.fromDbBool(scr.uploadedBody), scr.dateTimeBodyUploaded)
                );
            });
        })
        .catch((err) =>{
            console.log(err);
            throw 'error';
        });

        return result;
    }

    async saveScript(script: Script) {
        if (script.id === ""){
            script.id = uuid();
            await this.dao.run(ScriptsTable.insert,
                [script.id, script.scriptName,
                script.description, script.lastSaved,
                DataAccess.toDbBool(script.coreUploaded), script.dtCoreUploaded,
                DataAccess.toDbBool(script.domeUploaded), script.dtDomeUploaded,
                DataAccess.toDbBool(script.bodyUploaded), script.dtBodyUploaded])
        }
        else {
            await this.dao.run(ScriptsTable.insert,
                [script.scriptName,
                script.description, script.lastSaved,
                DataAccess.toDbBool(script.coreUploaded), script.dtCoreUploaded,
                DataAccess.toDbBool(script.domeUploaded), script.dtDomeUploaded,
                DataAccess.toDbBool(script.bodyUploaded), script.dtBodyUploaded,
                script.id])
        }  
    }
}