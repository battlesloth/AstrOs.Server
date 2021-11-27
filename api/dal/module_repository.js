const { ModuleId, Module, PwmType, PwmChannel, I2cChannel } = require('../models/module');
const ModuleTable = require('./tables/modules_table');
const PwmTable = require('./tables/pwm_channels_table');
const I2cTable = require('./tables/i2c_channels_table');

class ModuleRepository {
    constructor(dao) {
        this.dao = dao;
        this.dao.connect();
    }

    async getModules() {
        let result = [];

        const modules = [ModuleId.CORE, ModuleId.DOME, ModuleId.BODY];

        for (let m = 0; m < modules.length; m++) {
            
            let moduleId = modules[m];

            let module = new Module(moduleId,"");

            await this.dao.get(ModuleTable.Select, [moduleId])
            .then((val) =>{
                module.name = val[0].name;
            })
            .catch((err) => {
                console.log(err);
                throw 'error';
            });

            await this.dao.get(PwmTable.SelectAll, [moduleId])
            .then((val) =>{
                val.forEach(ch => {
                    module.pwmModule.channels[ch.channelId] =
                        new PwmChannel(ch.channelId, ch.name, ch.type, ch.limit0, ch.limit1);
                });
            })
            .catch((err) => {
                console.log(err);
                throw 'error';
            });

            await this.dao.get(I2cTable.SelectAll, [moduleId])
            .then((val) =>{
                val.forEach(ch => {
                    module.i2cModule.channels[ch.channelId] = 
                        new I2cChannel(ch.channelId, ch.name);
                });
            })
            .catch((err) => {
                console.log(err);
                throw 'error';
            });

            result.push(module);
        }

        return result;
    }

    async saveModules(modules) {

        for (let m = 0; m < modules.length; m++) {
            let mod = modules[m].value;
            
            await this.dao.run(ModuleTable.UpdateName, [mod.name, mod.moduleId])
            .catch((err) => {
                console.log(err);
                throw 'error';
            });

            for (let i = 0; i < mod.pwmModule.channels.length; i++) {
                let ch = mod.pwmModule.channels[i];
                
                await this.dao.run(PwmTable.Update, [ch.name, ch.type, 
                    ch.limit0, ch.limit1, mod.id, ch.id])
                .catch((err) => {
                    console.log(err);
                    throw 'error';
                });
    
            }

            for (let i = 0; i < mod.i2cModule.channels.length; i++) {
                let ch = mod.i2cModule.channels[i];
                
                await this.dao.run(I2cTable.Update, [ch.name, mod.id, ch.id])
                .catch((err) => {
                    console.log(err);
                    throw 'error';
                });
    
            }
        
            console.log(`Updated module ${mod.id}`);
        }

        return true;
    }
}

module.exports = ModuleRepository;