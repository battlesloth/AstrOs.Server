
export class ControlModule{
    name: string;
    id: string;
    ipAddress!: string;

    uartModule: UartModule;
    i2cModule: I2CModule;
    pwmModule: PwmModule;

    constructor(id: string, name: string){
        this.id = id;
        this.name = name;
        this.uartModule = new UartModule();
        this.i2cModule = new I2CModule();
        this.pwmModule = new PwmModule();
    }
}

export enum UartType{
    none,
    kangaroo
}

export class UartModule {
    name: string;
    type: UartType;
    uartContoller: any;

    constructor(){
        this.name = "unnamed";
        this.type = UartType.none;
    }
}


export class KangarooController{
    channelOneName: string;
    channelTwoName: string;

    constructor(){
        this.channelOneName = "channel 1";
        this.channelTwoName = "channel 2";
    }
}

export class I2cChannel {
    id: number;
    name: string;
    
    constructor(id: number, name: string){
        if (name === null){
            this.name = "unnamed";
        } else{
            this.name = name;
        }
        this.id = id;
    }
}

export class I2CModule {
    channels: Array<I2cChannel>;

    constructor(){
        this.channels = new Array<I2cChannel>();
    }
}

export enum PwmType{
    unassigned,
    servo,
    led,
    other
}

export class PwmChannel {
    id: number;
    name: string;
    type: PwmType;

    constructor(id: number, name: string, type: PwmType){
        if (name === null){
            this.name = "unnamed";
        } else{
            this.name = name;
        }
        this.id = id;
        this.type = type;
    }
}

export class PwmModule {
    channels: Array<PwmChannel>;

    constructor(){
        this.channels = new Array<PwmChannel>();
    }
}