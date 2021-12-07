import { KeyValue } from "@angular/common";
import { KeyValueDiffers } from "@angular/core";
import { ChannelType, ControlModule, UartType } from "./control-module";


export class ModuleDetails {
    id: string;
    name: string;
    //type:name
    uart: KeyValue<string, UartType>

    constructor(module: ControlModule) {
        this.id = module.id;
        this.name = module.name;
        this.uart = {key: module.uartModule.name, value: module.uartModule.type};
    }
}

export class ScriptResources {
    modules: Map<string, ModuleDetails>;

    unusedPwm: Map<string, Array<number>>;
    usedPwm: Map<string, Array<number>>;

    unusedI2c: Map<string, Array<number>>;
    usedI2c: Map<string, Array<number>>;
    
    constructor(modules: Array<ControlModule>) {
        this.modules = new Map<string, ModuleDetails>();
        this.unusedPwm = new Map<string, Array<number>>();
        this.usedPwm = new Map<string, Array<number>>();
        this.unusedI2c = new Map<string, Array<number>>();
        this.usedI2c = new Map<string, Array<number>>();

        modules.forEach( mod =>{
            this.modules.set(mod.id, new ModuleDetails(mod));
            this.unusedPwm.set(mod.id,
                Array.from({ length: mod.pwmModule.channels.length }, (_, i) => i + 1));
            this.unusedI2c.set(mod.id,
                Array.from({ length: mod.i2cModule.channels.length }, (_, i) => i + 1));
        });
    }

    addChannel(module:string, type: ChannelType, id: number ) : void {
        switch(type){
            case ChannelType.Pwm:
                this.usedPwm.get(module)?.push(id);
                const pwmIdx = this.unusedPwm.get(module)?.indexOf(id, 0);
                if (pwmIdx && pwmIdx > -1) {
                    this.unusedPwm.get(module)?.splice(pwmIdx, 1);
                }
                break;
            case ChannelType.I2c:
                this.usedI2c.get(module)?.push(id);
                const i2cIdx = this.unusedI2c.get(module)?.indexOf(id, 0);
                if (i2cIdx && i2cIdx > -1) {
                    this.unusedI2c.get(module)?.splice(i2cIdx, 1);
                }    
                break;
        }
    }

    removeChannel(module:string, type: ChannelType, id: number ) : void {
        switch(type){
            case ChannelType.Pwm:
                this.unusedPwm.get(module)?.push(id);
                this.unusedPwm.get(module)?.sort();
                const pwmIdx = this.usedPwm.get(module)?.indexOf(id, 0);
                if (pwmIdx && pwmIdx > -1) {
                    this.usedPwm.get(module)?.splice(pwmIdx, 1);
                }
                break;
            case ChannelType.I2c:
                this.unusedI2c.get(module)?.push(id);
                this.unusedI2c.get(module)?.sort();
                const i2cIdx = this.usedI2c.get(module)?.indexOf(id, 0);
                if (i2cIdx && i2cIdx > -1) {
                    this.usedI2c.get(module)?.splice(i2cIdx, 1);
                }    
                break;
        }
    }


} 