
export enum UartType{
    none,
    kangaroo
}

export enum PwmType{
    unassigned,
    continuous_servo,
    positional_servo,
    linear_servo,
    led,
    high_low
}

export class ControlModule{
    id: string;
    name: string;
    ipAddress!: string;

    uartModule: UartModule;
    pwmModule: PwmModule;
    i2cModule: I2cModule;

    constructor(id: string, name: string){
        this.id = id;
        this.name = name;
        this.uartModule = new UartModule();
        this.pwmModule = new PwmModule();
        this.i2cModule = new I2cModule(); 
    }
}


export class UartModule {
    name: string;
    type: UartType;
    module: any;

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

export class PwmModule {
    channels: Array<PwmChannel>;

    constructor(){
        this.channels = new Array<PwmChannel>();
    }
}


export class PwmChannel {
    id: number;
    name: string;
    type: PwmType;
    limit0: number;
    limit1: number;

    constructor(id: number, name: string, type: PwmType, limit0: number, limit1: number){
        this.name = name;
        this.id = id;
        this.type = type;
        this.limit0 = limit0;
        this.limit1 = limit1;
    }
}


export class I2cModule {
    channels: Array<I2cChannel>;

    constructor(){
        this.channels = new Array<I2cChannel>();
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




