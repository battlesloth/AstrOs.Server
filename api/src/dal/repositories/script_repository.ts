import { DataAccess } from "src/dal/data_access";
import { ScriptsTable } from "src/dal/tables/scripts_table";
import { ScriptChannelsTable } from "src/dal/tables/script_channels_table";
import { ScriptEventsTable } from "src/dal/tables/script_events_table";
import { Script } from "src/models/scripts/script";
import { ScriptChannel} from "src/models/scripts/script_channel"
import { ScriptEvent } from "src/models/scripts/script_event";


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

    async getScript(id: string) : Promise<any> {
        await this.dao.get(ScriptsTable.select, [id])
        .then(async (val: any) =>{
            
            const script = val[0];

            const result = new Script(script.id, script.scriptName, 
                script.description, script.lastSaved, 
                script.coreUploaded, script.dtCoreUploaded,
                script.domeUploaded, script.dtDomeUploaded,
                script.bodyUploaded, script.dtBodyUploaded);

            await this.dao.get(ScriptChannelsTable.selectAllForScript, [id])
            .then((val: any) =>{
                val.forEach((ch: any) => {
                    const channel = new ScriptChannel(ch.id, ch.controllerType,
                        ch.controllerName, ch.type, null, 0);

                    script.scriptChannels.push(channel);
                });
            }).catch((err) =>{
                console.log(err);
                throw 'error'
            });

            script.scriptChannels.forEach(async (ch: ScriptChannel) => {
                await this.dao.get(ScriptEventsTable.selectForChannel, [ch.id])
                .then((val: any) =>{
                    val.forEach((evt: any) => {
                        const event = new ScriptEvent(evt.id, evt.scriptChannel,
                            evt.time, evt.dataJson);
                            ch.events.push(event);
                    });
                }).catch((err) =>{
                    console.log(err);
                    throw 'error'
                });
            });

            return result;
        })
        .catch((err) =>{
            console.log(err);
            throw 'error';
        });
    }
    

    async saveScript(script: Script) : Promise<boolean> {
        
        await this.dao.run(ScriptsTable.insert,
                [script.scriptName,
                script.description, script.lastSaved,
                DataAccess.toDbBool(script.coreUploaded), script.dtCoreUploaded,
                DataAccess.toDbBool(script.domeUploaded), script.dtDomeUploaded,
                DataAccess.toDbBool(script.bodyUploaded), script.dtBodyUploaded,
                script.id]);

        await this.dao.run(ScriptChannelsTable.deleteAllForScript, [script.id]);
        await this.dao.run(ScriptEventsTable.deleteAllForScript, [script.id]);
 
        script.scriptChannels.forEach(async (ch: ScriptChannel) => {
            await this.dao.run(ScriptChannelsTable.insert, [ch.id, 
                script.id, ch.controllerType.toString(), ch.type.toString()]);

            ch.events.forEach(async (evt: ScriptEvent) => {
                await this.dao.run(ScriptEventsTable.insert, [evt.id,
                script.id, evt.scriptChannel, evt.time.toString(), evt.dataJson])
            })
        });

        return true;
    }
}