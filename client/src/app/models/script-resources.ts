import { ControllerType, ControlModule, UartModule, UartType } from "./control-module";
import { ScriptChannelType } from "./script-channel";


export class ControllerDetails {
    id: ControllerType;
    name: string;
    //type:name
    uart: UartModule

    constructor(id: ControllerType, name: string, uart: UartModule) {
        this.id = id;
        this.name = name;
        this.uart = uart;
    }
}

export class ChannelValue {
    available: boolean;
    channel: any

    constructor(channel: any){
        this.available = true;
        this.channel = channel;
    }
}

export class ScriptResources {
    controllers: Map<ControllerType, ControllerDetails>;

    uartAvailable: Map<ControllerType, boolean>;

    pwmChannels: Map<ControllerType, Array<ChannelValue>>;
    
    i2cChannels: Map<ControllerType, Array<ChannelValue>>;
    
    constructor(controllers: Array<ControlModule>) {
        this.controllers = new Map<ControllerType, ControllerDetails>();
        this.pwmChannels = new Map<ControllerType, Array<any>>();
        this.i2cChannels = new Map<ControllerType, Array<any>>();
        this.uartAvailable = new Map<ControllerType, boolean>();

        this.controllers.set(ControllerType.audio, new ControllerDetails(ControllerType.audio, 'Audio Playback', new UartModule()));

        controllers.forEach( con =>{
            this.uartAvailable.set(con.id, true);

            this.controllers.set(con.id, new ControllerDetails(con.id, con.name, con.uartModule));
            
            this.pwmChannels.set(con.id, con.pwmModule.channels.map( ch => new ChannelValue(ch)));
            this.i2cChannels.set(con.id, con.i2cModule.channels.map( ch => new ChannelValue(ch)));

            this.pwmChannels.get(con.id)?.sort((a, b) => {return a.channel.id - b.channel.id});
            this.i2cChannels.get(con.id)?.sort((a, b) => {return a.channel.id - b.channel.id});
        });
    }

    uartIsAvailable(controller: ControllerType) : boolean{
        var result = this.uartAvailable.get(controller);
        if (result !== undefined){
            return result;
        }
        return false;
    }

    addChannel(controller: ControllerType, type: ScriptChannelType, id: number ) : any {
        
        if (controller === ControllerType.audio){
            this.controllers.delete(ControllerType.audio);
            return undefined;
        }
        
        switch(type){
            case ScriptChannelType.Uart:
                this.uartAvailable.set(controller, false);
                return this.controllers.get(controller)?.uart;
            case ScriptChannelType.Pwm:
                const pwmIdx = this.pwmChannels.get(controller)?.findIndex( x=> x.channel.id === id);
                if (pwmIdx && pwmIdx > -1) {
                    this.pwmChannels.get(controller)![pwmIdx].available = false;
                    return this.pwmChannels.get(controller)![pwmIdx].channel
                }
                break
            case ScriptChannelType.I2c:
                const i2cIdx = this.i2cChannels.get(controller)?.findIndex( x=> x.channel.id === id);
                if (i2cIdx && i2cIdx > -1) {
                    this.i2cChannels.get(controller)![i2cIdx].available = false;
                    return this.pwmChannels.get(controller)![i2cIdx].channel
                }
                break;
        }

        return undefined;
    }

    removeChannel(controller: ControllerType, type: ScriptChannelType, id: number ) : void {
        
        if (controller === ControllerType.audio){
            this.controllers.set(ControllerType.audio, new ControllerDetails(ControllerType.audio,'Audio Playback', new UartModule()))
            return
        }
        
        switch(type){
            case ScriptChannelType.Uart:
                this.uartAvailable.set(controller, true);
                break 
            case ScriptChannelType.Pwm:
                const pwmIdx = this.pwmChannels.get(controller)?.findIndex( x=> x.channel.id === id);
                if (pwmIdx && pwmIdx > -1) {
                    this.pwmChannels.get(controller)![pwmIdx].available = true;
                }
                break;
            case ScriptChannelType.I2c:
                const i2cIdx = this.i2cChannels.get(controller)?.findIndex( x=> x.channel.id === id);
                if (i2cIdx && i2cIdx > -1) {
                    this.i2cChannels.get(controller)![i2cIdx].available = false;
                }
                break;
        }
    }
} 