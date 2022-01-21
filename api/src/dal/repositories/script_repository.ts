import { DataAccess } from "src/dal/data_access";
import { ScriptsTable } from "src/dal/tables/scripts_table";
import { ScriptChannelsTable } from "src/dal/tables/script_channels_table";
import { ScriptEventsTable } from "src/dal/tables/script_events_table";
import { ChannelType, ControllerType } from "src/models/control_module/control_module";
import { I2cChannel } from "src/models/control_module/i2c_channel";
import { PwmChannel } from "src/models/control_module/pwm_channel";
import { UartModule } from "src/models/control_module/uart_module";
import { Script } from "src/models/scripts/script";
import { ScriptChannel } from "src/models/scripts/script_channel"
import { ScriptEvent } from "src/models/scripts/script_event";
import { I2cChannelsTable } from "../tables/i2c_channels_table";
import { PwmChannelsTable } from "../tables/pwm_channels_table";
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
                            DataAccess.fromDbBool(scr.coreUploaded), scr.dtCoreUploaded,
                            DataAccess.fromDbBool(scr.domeUploaded), scr.dtDomeUploaded,
                            DataAccess.fromDbBool(scr.bodyUploaded), scr.dtBodyUploaded)
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
                    DataAccess.fromDbBool(scr.coreUploaded), scr.dtCoreUploaded,
                    DataAccess.fromDbBool(scr.domeUploaded), scr.dtDomeUploaded,
                    DataAccess.fromDbBool(scr.bodyUploaded), scr.dtBodyUploaded);
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
                        ch.controllerName, ch.type, ch.channelNumber, null, 0)

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
                        const event = new ScriptEvent(evt.scriptChannel, evt.channelType, evt.time, evt.dataJson);
                        ch.eventsKvpArray.push({key: event.time, value: event});
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
            case ChannelType.pwm:
                channel.channel = await this.getChannelForScriptChannel(ChannelType.pwm, channel.channelNumber, channel.controllerType)
                break;
            case ChannelType.uart:
                channel.channel = await this.getUartModule(channel.controllerType);
                break;
        }

        return channel;
    }

    private async getUartModule(controller: ControllerType): Promise<UartModule  | null> {
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
            case ChannelType.pwm:
                sql = PwmChannelsTable.select;
                break;
            default:
                return;
        }

        await this.dao.get(sql, [chId.toString(), controller.toString()])
            .then((val: any) => {
                try {
                    switch (type) {
                        case ChannelType.i2c:
                            result = new I2cChannel(val[0].channelId, val[0].channelName);
                            break;
                        case ChannelType.pwm:
                            result = new PwmChannel(val[0].channelId, val[0].channelName,
                                val[0].type, val[0].limit0, val[0].limit1);
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

    async saveScript(script: Script): Promise<boolean> {

        await this.dao.run(ScriptsTable.insert,
            [script.id, script.scriptName,
            script.description, script.lastSaved,
            DataAccess.toDbBool(script.coreUploaded), script.dtCoreUploaded,
            DataAccess.toDbBool(script.domeUploaded), script.dtDomeUploaded,
            DataAccess.toDbBool(script.bodyUploaded), script.dtBodyUploaded])
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


        for (const ch of script.scriptChannels){

            await this.dao.run(ScriptChannelsTable.insert, [ch.id,
            script.id, ch.controllerType.toString(), ch.type.toString(), ch.channelNumber.toString()])
                .then((val: any) => {
                    if (val) { console.log(val); }
                });

            for (const kvp of ch.eventsKvpArray) {
                const evt = kvp.value;

                if (evt) {
                    await this.dao.run(ScriptEventsTable.insert,
                        [script.id, evt.scriptChannel, evt.channelType.toString(), evt.time.toString(), evt.dataJson])
                        .then((val: any) => {
                            if (val) { console.log(val); }
                        });
                }
            }
        }

        return true;
    }
}