import { KeyValue } from "@angular/common";
import { ChannelType, ControllerType, ControlModule, UartType } from "./control-module";


export class ControllerDetails {
    id: ControllerType;
    name: string;
    //type:name
    uart: KeyValue<UartType, string>

    constructor(id: ControllerType, name: string, uartType: UartType, uartName: string) {
        this.id = id;
        this.name = name;
        this.uart = {key: uartType, value: uartName};
    }

}

export class ScriptResources {
    controllers: Map<ControllerType, ControllerDetails>;

    uartAvailable: Map<ControllerType, boolean>;

    unusedPwm: Map<ControllerType, Array<number>>;
    usedPwm: Map<ControllerType, Array<number>>;

    unusedI2c: Map<ControllerType, Array<number>>;
    usedI2c: Map<ControllerType, Array<number>>;
    
    constructor(controllers: Array<ControlModule>) {
        this.controllers = new Map<ControllerType, ControllerDetails>();
        this.unusedPwm = new Map<ControllerType, Array<number>>();
        this.usedPwm = new Map<ControllerType, Array<number>>();
        this.unusedI2c = new Map<ControllerType, Array<number>>();
        this.usedI2c = new Map<ControllerType, Array<number>>();

        this.uartAvailable = new Map<ControllerType, boolean>();

        this.controllers.set(ControllerType.audio, new ControllerDetails(ControllerType.audio,'Audio Playback', UartType.none, ''))

        controllers.forEach( con =>{
            this.uartAvailable.set(con.id, true);

            this.controllers.set(con.id, new ControllerDetails(con.id, con.name, con.uartModule.type, con.uartModule.name));
            this.unusedPwm.set(con.id,
                Array.from({ length: con.pwmModule.channels.length }, (_, i) => i ));
            this.unusedI2c.set(con.id,
                Array.from({ length: con.i2cModule.channels.length }, (_, i) => i ));
        });
    }

    uartIsAvailable(controller: ControllerType) : boolean{
        var result = this.uartAvailable.get(controller);
        if (result !== undefined){
            return result;
        }
        return false;
    }

    addChannel(controller: ControllerType, type: ChannelType, id: number ) : void {
        
        if (controller === ControllerType.audio){
            this.controllers.delete(ControllerType.audio);
            return
        }
        
        switch(type){
            case ChannelType.uart:
                this.uartAvailable.set(controller, false);
                break 
            case ChannelType.pwm:
                this.usedPwm.get(controller)?.push(id);
                const pwmIdx = this.unusedPwm.get(controller)?.indexOf(id, 0);
                if (pwmIdx && pwmIdx > -1) {
                    this.unusedPwm.get(controller)?.splice(pwmIdx, 1);
                }
                break;
            case ChannelType.i2c:
                this.usedI2c.get(controller)?.push(id);
                const i2cIdx = this.unusedI2c.get(controller)?.indexOf(id, 0);
                if (i2cIdx && i2cIdx > -1) {
                    this.unusedI2c.get(controller)?.splice(i2cIdx, 1);
                }    
                break;
        }
    }

    removeChannel(controller: ControllerType, type: ChannelType, id: number ) : void {
        
        if (controller === ControllerType.audio){
            this.controllers.set(ControllerType.audio, new ControllerDetails(ControllerType.audio,'Audio Playback', UartType.none, ''))
            return
        }
        
        switch(type){
            case ChannelType.uart:
                this.uartAvailable.set(controller, true);
                break
            case ChannelType.pwm:
                this.unusedPwm.get(controller)?.push(id);
                this.unusedPwm.get(controller)?.sort();
                const pwmIdx = this.usedPwm.get(controller)?.indexOf(id, 0);
                if (pwmIdx && pwmIdx > -1) {
                    this.usedPwm.get(controller)?.splice(pwmIdx, 1);
                }
                break;
            case ChannelType.i2c:
                this.unusedI2c.get(controller)?.push(id);
                this.unusedI2c.get(controller)?.sort();
                const i2cIdx = this.usedI2c.get(controller)?.indexOf(id, 0);
                if (i2cIdx && i2cIdx > -1) {
                    this.usedI2c.get(controller)?.splice(i2cIdx, 1);
                }    
                break;
        }
    }
} 