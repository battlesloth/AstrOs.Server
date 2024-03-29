
import { ContentObserver } from "@angular/cdk/observers";
import { ChannelType, ControllerType, ControlModule, 
    I2cChannel, ServoChannel, UartModule, 
    UartType, Script, UartChannel } from "astros-common";

export class ControllerDetails {
    id: ControllerType;
    name: string;
    //type:name

    constructor(id: ControllerType, name: string) {
        this.id = id;
        this.name = name;
    }
}

export class ChannelValue {
    available: boolean;
    channel: any

    constructor(channel: any, available: boolean) {
        this.available = available;
        this.channel = channel;
    }
}

export class ScriptResources {

    private loaded = false;

    controllers: Map<ControllerType, ControllerDetails>;
    
    uartChannels: Map<ControllerType, Array<ChannelValue>>;

    servoChannels: Map<ControllerType, Array<ChannelValue>>;

    i2cChannels: Map<ControllerType, Array<ChannelValue>>;

    constructor(controllers: Array<ControlModule>) {
        this.controllers = new Map<ControllerType, ControllerDetails>();
        this.servoChannels = new Map<ControllerType, Array<any>>();
        this.i2cChannels = new Map<ControllerType, Array<any>>();
        this.uartChannels = new Map<ControllerType, Array<any>>();

        this.controllers.set(ControllerType.audio, new ControllerDetails(ControllerType.audio, 'Audio Playback'));

        controllers.forEach(con => {
  

            this.controllers.set(con.id, new ControllerDetails(con.id, con.name));

            this.uartChannels.set(con.id, con.uartModule.channels.map((ch: UartChannel) => new ChannelValue(ch, ch.type != UartType.none)))
            this.servoChannels.set(con.id, con.servoModule.channels.map((ch: ServoChannel) => new ChannelValue(ch, ch.enabled)));
            this.i2cChannels.set(con.id, con.i2cModule.channels.map((ch: I2cChannel) => new ChannelValue(ch, ch.enabled)));

            this.uartChannels.get(con.id)?.sort((a, b) => { return a.channel.id - b.channel.id });
            this.servoChannels.get(con.id)?.sort((a, b) => { return a.channel.id - b.channel.id });
            this.i2cChannels.get(con.id)?.sort((a, b) => { return a.channel.id - b.channel.id });
        });
    }

    applyScript(script: Script): void {

        script.scriptChannels.forEach(ch => {
            switch (ch.type) {
                case ChannelType.uart:
                    const uartIdx = this.uartChannels.get(ch.controllerType)?.findIndex(x => x.channel.id === ch.channel.id);
                    if (uartIdx != undefined && uartIdx > -1) {
                        this.uartChannels.get(ch.controllerType)![uartIdx].available = false;
                    }
                    break;
                case ChannelType.servo:
                    this.servoChannels.get(ch.controllerType)![ch.channel.id].available = false;
                    break;
                case ChannelType.i2c:
                    this.i2cChannels.get(ch.controllerType)![ch.channel.id].available = false;
                    break;
                case ChannelType.audio:
                    this.controllers.delete(ControllerType.audio);
                    break;
            }
        });
    }

    getAvailableModules(): Map<ControllerType, Map<ChannelType, string>> {
        const result = new Map<ControllerType, Map<ChannelType, string>>();

        for (const ctrl of this.controllers.keys()) {
            if (ctrl === ControllerType.audio || ctrl === ControllerType.none){
                continue;
            }
                    
            result.set(ctrl, this.setModuleValues(ctrl));
        }

        return result;
    }

    getAvailableChannels(): Map<ControllerType, Map<ChannelType, Array<ChannelValue>>> {
        const result = new Map<ControllerType, Map<ChannelType, any>>()

        for (const ctrl of this.controllers.keys()){
            if (ctrl === ControllerType.audio || ctrl === ControllerType.none){
                continue;
            }

            var vals = new Map<ChannelType, any>();

            vals.set(ChannelType.servo, this.servoChannels.get(ctrl));
            vals.set(ChannelType.i2c, this.i2cChannels.get(ctrl));
            vals.set(ChannelType.uart, this.uartChannels.get(ctrl));
    
            result.set(ctrl, vals);
        }

        return result;
    }

    private setModuleValues(controler: ControllerType): Map<ChannelType, string> {
        const vals = new Map<ChannelType, string>();

        vals.set(ChannelType.servo, "Servo");
        vals.set(ChannelType.i2c, "I2C");
        vals.set(ChannelType.uart, "Serial");
        
        return vals;
    }

    addChannel(controller: ControllerType, type: ChannelType, id: number): any {

        if (controller === ControllerType.audio) {
            this.controllers.delete(ControllerType.audio);
            return undefined;
        }

        switch (type) {
            case ChannelType.uart:
                const uartIdx = this.uartChannels.get(controller)?.findIndex(x => x.channel.id === id);
                if (uartIdx != undefined && uartIdx > -1) {
                    this.uartChannels.get(controller)![uartIdx].available = false;
                    return this.uartChannels.get(controller)![uartIdx].channel
                }
                break;
            case ChannelType.servo:
                const servoIdx = this.servoChannels.get(controller)?.findIndex(x => x.channel.id === id);
                if (servoIdx != undefined && servoIdx > -1) {
                    this.servoChannels.get(controller)![servoIdx].available = false;
                    return this.servoChannels.get(controller)![servoIdx].channel
                }
                break
            case ChannelType.i2c:
                const i2cIdx = this.i2cChannels.get(controller)?.findIndex(x => x.channel.id === id);
                if (i2cIdx != undefined && i2cIdx > -1) {
                    this.i2cChannels.get(controller)![i2cIdx].available = false;
                    return this.i2cChannels.get(controller)![i2cIdx].channel
                }
                break;
        }

        return undefined;
    }

    removeChannel(controller: ControllerType, type: ChannelType, id: number): void {

        if (controller === ControllerType.audio) {
            this.controllers.set(ControllerType.audio, new ControllerDetails(ControllerType.audio, 'Audio Playback'))
            return
        }

        switch (type) {
            case ChannelType.uart:
                const uartIdx = this.uartChannels.get(controller)?.findIndex(x => x.channel.id === id);
                if (uartIdx !== undefined && uartIdx > -1) {
                    this.uartChannels.get(controller)![uartIdx].available = true;
                }
                break;
            case ChannelType.servo:
                const servoIdx = this.servoChannels.get(controller)?.findIndex(x => x.channel.id === id);
                if (servoIdx !== undefined && servoIdx > -1) {
                    this.servoChannels.get(controller)![servoIdx].available = true;
                }
                break;
            case ChannelType.i2c:
                const i2cIdx = this.i2cChannels.get(controller)?.findIndex(x => x.channel.id === id);
                if (i2cIdx !== undefined && i2cIdx > -1) {
                    this.i2cChannels.get(controller)![i2cIdx].available = false;
                }
                break;
        }
    }
} 