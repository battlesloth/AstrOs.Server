const { Script } = require('../models/script');
const ScriptTable = require('./tables/scripts_table');

class ScriptRepository {
    constructor(dao) {
        this.dao = dao;
        this.dao.connect();
    }

    async getScripts() {
        let result = [];

        await this.dao.get(ScriptTable.SelectAll)
        .then((val) =>{
            val.forEach(scr => {
                result.push(
                    new Script(scr.id, scr.description,
                        scr.uploadedCore, scr.dateTimeCoreUploaded,
                        scr.uploadedDome, scr.dateTimeDomeUploaded,
                        scr.uploadedBody, scr.dateTimeBodyUploaded
                        )
                );
            });
        })
        .catch((err) =>{
            console.log(err);
            throw 'error';
        });

        return result;
    }

    async saveScript(script) {
        if (script.id === 0){
            await this.dao.run(ScriptTable.Insert,
                [script.name, script.])
        }
        else {

        }
        
    }
}