import { DataAccess } from "src/dal/data_access";
import { ControlModule, ControllerType, PwmChannel, I2cChannel, UartModule } from "astros-common";
import { ControllersTable } from "src/dal/tables/controllers_table";
import { PwmChannelsTable } from "src/dal/tables/pwm_channels_table";
import { I2cChannelsTable } from "src/dal/tables/i2c_channels_table"; 
import { UartModuleTable } from "../tables/uart_module_table";

export class ControllerRepository {

    dao: DataAccess;

    constructor(dao: DataAccess) {
        this.dao = dao;
        this.dao.connect();
    }

    public async getControllers() : Promise<Array<ControlModule>> {
        const result = new Array<ControlModule>();

        const controllers = [ControllerType.core, ControllerType.dome, ControllerType.body];

        for (const ctl of controllers) {
            
            const controller = new ControlModule(ctl, "");

            await this.dao.get(ControllersTable.select, [ctl.toString()])
            .then((val: any) =>{
                controller.name = val[0].controllerName;
            })
            .catch((err: any) => {
                console.log(err);
                throw 'error';
            });

            await this.dao.get(UartModuleTable.select, [ctl.toString()])
            .then((val: any) =>{
               
                const uart = new UartModule(val[0].uartType, val[0].moduleName, JSON.parse(val[0].moduleJson));
                controller.uartModule = uart;
            })
            .catch((err: any) => {
                console.log(err);
                throw 'error';
            });

            await this.dao.get(PwmChannelsTable.selectAll, [ctl.toString()])
            .then((val: any) =>{
                val.forEach((ch: any) => {
                    controller.pwmModule.channels[ch.channelId] =
                        new PwmChannel(ch.channelId, ch.channelName, ch.type, ch.limit0, ch.limit1);
                });
            })
            .catch((err: any) => {
                console.log(err);
                throw 'error';
            });

            await this.dao.get(I2cChannelsTable.selectAll, [ctl.toString()])
            .then((val: any) =>{
                val.forEach((ch: any) => {
                    controller.i2cModule.channels[ch.channelId] = 
                        new I2cChannel(ch.channelId, ch.channelName);
                });
            })
            .catch((err) => {
                console.log(err);
                throw 'error';
            });

            result.push(controller);
        }

        return result;
    }

    public async saveControllers(controllers: Array<ControlModule>) : Promise<boolean> {

        for (const ctl of controllers) {
          
            await this.dao.run(ControllersTable.updateName, [ctl.name, ctl.id.toString()])
            .catch((err: any) => {
                console.log(err);
                throw 'error';
            });

            await this.dao.run(UartModuleTable.update, [ctl.uartModule.type.toString(),
                 ctl.uartModule.moduleName, JSON.stringify(ctl.uartModule.module), ctl.id.toString()])
                 .catch((err: any) =>{
                     console.log(err);
                     throw 'error';
                 })

            for (const pwm of ctl.pwmModule.channels) {
               
                await this.dao.run(PwmChannelsTable.update, [pwm.channelName, pwm.type.toString(), 
                    pwm.limit0.toString(), pwm.limit1.toString(), pwm.id.toString(), ctl.id.toString()])
                .catch((err: any) => {
                    console.log(err);
                    throw 'error';
                });
    
            }

            for (const i2c of ctl.i2cModule.channels) {
                
                await this.dao.run(I2cChannelsTable.update, [i2c.channelName, i2c.id.toString(), ctl.id.toString()])
                .catch((err: any) => {
                    console.log(err);
                    throw 'error';
                });
    
            }
        
            console.log(`Updated controller ${ctl.id}`);
        }

        return true;
    }
}
