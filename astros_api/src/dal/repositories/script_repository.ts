import { DataAccess } from "src/dal/data_access";
import { ScriptsTable } from "src/dal/tables/scripts_table";
import { ScriptChannelsTable } from "src/dal/tables/script_channels_table";
import { ScriptEventsTable } from "src/dal/tables/script_events_table";
import { ChannelType, ControllerType, I2cChannel, ServoChannel, UartModule, Script, ScriptChannel, ScriptEvent } from "astros-common";
import { I2cChannelsTable } from "../tables/i2c_channels_table";
import { ServoChannelsTable } from "../tables/servo_channels_table";
import { UartModuleTable } from "../tables/uart_module_table";


export class ScriptRepository {

    dao: DataAccess

    constructor(dao: DataAccess) {
        this.dao = dao;
        this.dao.connect();
    }

    async getScripts(): Promise<Array<Script>> {
        const result = new Array<Script>();

        await this.dao.get(ScriptsTable.selectAll)
            .then((val: any) => {
                val.forEach((scr: any) => {
                    result.push(
                        new Script(scr.id, scr.scriptName,
                            scr.description, scr.lastSaved,
                            scr.coreUploaded,
                            scr.domeUploaded,
                            scr.bodyUploaded)
                    );
                });
            })
            .catch((err) => {
                console.log(err);
                throw 'error';
            });

        return result;
    }

    async getScript(id: string): Promise<any> {

        let result = Script.prototype;

        await this.dao.get(ScriptsTable.select, [id])
            .then(async (val: any) => {

                const scr = val[0];

                result = new Script(scr.id, scr.scriptName,
                    scr.description, scr.lastSaved,
                    scr.coreUploaded,
                    scr.domeUploaded,
                    scr.bodyUploaded);
            })
            .catch((err) => {
                console.log(err);
                throw 'error';
            });

        const channels = new Array<ScriptChannel>();

        await this.dao.get(ScriptChannelsTable.selectAllForScript, [id])
            .then((val: any) => {
                val.forEach((ch: any) => {

                    const channel = new ScriptChannel(ch.id, ch.controllerType,
                        ch.controllerName, ch.type, ch.subType, ch.channelNumber, null, 0)

                    if (channel.controllerType == ControllerType.audio) {
                        channel.controllerName = 'Audio Playback';
                    }

                    channels.push(channel);
                });
            }).catch((err) => {
                console.log(err);
                throw 'error'
            });

        for (const ch of channels) {
            const channel = await this.configScriptChannel(id, ch)
            result.scriptChannels.push(channel);
        }

        for (const ch of result.scriptChannels) {

            await this.dao.get(ScriptEventsTable.selectForChannel, [result.id, ch.id])
                .then((val: any) => {
                    val.forEach((evt: any) => {
                        const event = new ScriptEvent(evt.scriptChannel, evt.channelType, evt.channelSubType, evt.time, evt.dataJson);
                        ch.eventsKvpArray.push({ key: event.time, value: event });
                    });
                }).catch((err) => {
                    console.log(err);
                    throw 'error'
                });
        }

        return result;
    }


    private async configScriptChannel(scriptId: string, channel: ScriptChannel): Promise<ScriptChannel> {

        switch (channel.type) {
            case ChannelType.i2c:
                channel.channel = await this.getChannelForScriptChannel(ChannelType.i2c, channel.channelNumber, channel.controllerType)
                break;
            case ChannelType.servo:
                channel.channel = await this.getChannelForScriptChannel(ChannelType.servo, channel.channelNumber, channel.controllerType)
                break;
            case ChannelType.uart:
                channel.channel = await this.getUartModule(channel.controllerType);
                break;
        }

        return channel;
    }

    private async getUartModule(controller: ControllerType): Promise<UartModule | null> {
        let result: any = null;

        await this.dao.get(UartModuleTable.select, [controller.toString()])
            .then((val: any) => {
                result = new UartModule(val[0].uartType, val[0].moduleName, JSON.parse(val[0].moduleJson));
            }).catch((err) => {
                console.log(err);
                throw 'error'
            });

        return result;
    }

    private async getChannelForScriptChannel(type: ChannelType, chId: number, controller: ControllerType): Promise<any> {

        let result = {};

        let sql = '';

        switch (type) {
            case ChannelType.i2c:
                sql = I2cChannelsTable.select;
                break;
            case ChannelType.servo:
                sql = ServoChannelsTable.select;
                break;
            default:
                return;
        }

        await this.dao.get(sql, [chId.toString(), controller.toString()])
            .then((val: any) => {
                try {
                    switch (type) {
                        case ChannelType.i2c:
                            result = new I2cChannel(val[0].channelId, val[0].channelName, val[0].enabled);
                            break;
                        case ChannelType.servo:
                            result = new ServoChannel(val[0].channelId, val[0].channelName,
                                val[0].enabled, val[0].limit0, val[0].limit1);
                            break;
                    }
                } catch (error) {
                    console.log(error);
                }
            }).catch((err) => {
                console.log(err);
                throw 'error'
            });

        return result;
    }

    async updateScriptControllerUploaded(id: string, controller: ControllerType, dateTime: string): Promise<boolean> {

        let success = true;
        let sql = '';

        switch (controller) {
            case ControllerType.core:
                sql = ScriptsTable.updateScriptCoreUploaded;
                break;
            case ControllerType.dome:
                sql = ScriptsTable.updateScriptDomeUploaded;
                break;
            case ControllerType.body:
                sql = ScriptsTable.updateScriptBodyUploaded;
                break;
        }

        if (sql === ''){
            console.log('invalid controller type to update script!');
            return false;
        }

        await this.dao.run(sql, [dateTime, id])
            .catch((err: any) =>{
                console.log(`Exception updating script upload for controller: ${controller} => ${err}`);
                success = false;
            });

        return success;
    }

    async saveScript(script: Script): Promise<boolean> {

        const options: Intl.DateTimeFormatOptions = {
            day: "numeric", month: "numeric", year: "numeric",
            hour: "2-digit", minute: "2-digit", second: "2-digit"
        };

        const date = (new Date()).toLocaleString('en-US', options);

        await this.dao.run(ScriptsTable.insert,
            [script.id, script.scriptName,
            script.description, 
            date,
            script.coreUploaded,
            script.domeUploaded,
            script.bodyUploaded])
            .then((val: any) => {
                if (val) { console.log(val); }
            });

        await this.dao.run(ScriptChannelsTable.deleteAllForScript, [script.id])
            .then((val: any) => {
                if (val) { console.log(val); }
            });
        await this.dao.run(ScriptEventsTable.deleteAllForScript, [script.id])
            .then((val: any) => {
                if (val) { console.log(val); }
            });


        for (const ch of script.scriptChannels) {

            await this.dao.run(ScriptChannelsTable.insert, [ch.id,
            script.id, ch.controllerType.toString(), ch.type.toString(), ch.subType.toString(), ch.channelNumber.toString()])
                .then((val: any) => {
                    if (val) { console.log(val); }
                });

            for (const kvp of ch.eventsKvpArray) {
                const evt = kvp.value;

                if (evt) {
                    await this.dao.run(ScriptEventsTable.insert,
                        [script.id, evt.scriptChannel, evt.channelType.toString(), evt.channelSubType, evt.time.toString(), evt.dataJson])
                        .then((val: any) => {
                            if (val) { console.log(val); }
                        });
                }
            }
        }

        return true;
    }

    async deleteScript(id: string): Promise<boolean> {

        let success = true;
        const sql = ScriptsTable.disableScript;

        await this.dao.run(sql, [id])
            .catch((err: any) =>{
                console.log(`Exception disabling script for ${id} => ${err}`);
                success = false;
            });

        return success;
    }
}