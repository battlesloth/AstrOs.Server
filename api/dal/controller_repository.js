const { Controller, PwmType, PwmChannel, I2cChannel, ControllerId } = require('../models/controller');
const ControllersTable = require('./tables/controllers_table');
const PwmTable = require('./tables/pwm_channels_table');
const I2cTable = require('./tables/i2c_channels_table');

class ControllerRepository {
    constructor(dao) {
        this.dao = dao;
        this.dao.connect();
    }

    async getControllers() {
        let result = [];

        const modules = [ControllerId.CORE, ControllerId.DOME, ControllerId.BODY];

        for (let m = 0; c < modules.length; c++) {
            
            let controllerId = modules[c];

            let controller = new Controller(id,"");

            await this.dao.get(ControllersTable.Select, [controllerId])
            .then((val) =>{
                controller.name = val[0].name;
            })
            .catch((err) => {
                console.log(err);
                throw 'error';
            });

            await this.dao.get(PwmTable.SelectAll, [controllerId])
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

            await this.dao.get(I2cTable.SelectAll, [controllerId])
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

    async saveControllers(controllers) {

        for (let c = 0; c < controllers.length; c++) {
            let con = controllers[c];
            
            await this.dao.run(ModuleTable.UpdateName, [con.name, con.moduleId])
            .catch((err) => {
                console.log(err);
                throw 'error';
            });

            for (let i = 0; i < con.pwmModule.channels.length; i++) {
                let ch = con.pwmModule.channels[i];
                
                await this.dao.run(PwmTable.Update, [ch.name, ch.type, 
                    ch.limit0, ch.limit1, con.id, ch.id])
                .catch((err) => {
                    console.log(err);
                    throw 'error';
                });
    
            }

            for (let i = 0; i < con.i2cModule.channels.length; i++) {
                let ch = con.i2cModule.channels[i];
                
                await this.dao.run(I2cTable.Update, [ch.name, con.id, ch.id])
                .catch((err) => {
                    console.log(err);
                    throw 'error';
                });
    
            }
        
            console.log(`Updated module ${con.id}`);
        }

        return true;
    }
}

module.exports = ControllerRepository;