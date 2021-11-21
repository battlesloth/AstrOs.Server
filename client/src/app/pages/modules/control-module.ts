
export class ControlModule{
    name: string;
    id: string;
    ipAddress!: string;

    uartModule: UartModule;
    i2cModule: I2CModule;
    pwmModule: PWMModule;

    constructor(id: string, name: string){
        this.id = id;
        this.name = name;
        this.uartModule = new UartModule();
        this.i2cModule = new I2CModule();
        this.pwmModule = new PWMModule();
    }
}

enum UartType{
    None,
    Kangaroo
}

export class UartModule {
    name: string;
    type: UartType;
    uartContoller: any;

    constructor(){
        this.name = "unnamed";
        this.type = UartType.None;
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

export class I2CChannel {
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
    channels: Array<I2CChannel>;

    constructor(){
        this.channels = new Array<I2CChannel>();
        for (let i = 0; i < 128; i++) {
            this.channels.push(new I2CChannel(i, "unnamed"));
        }
    }
}

enum PWMType{
    Servo,
    Led,
    Other
}

export class PWMChannel {
    id: number;
    name: string;
    type: PWMType;

    constructor(id: number, name: string, type: PWMType){
        if (name === null){
            this.name = "unnamed";
        } else{
            this.name = name;
        }
        this.id = id;
        this.type = type;
    }
}

export class PWMModule {
    channels: Array<PWMChannel>;

    constructor(){
        this.channels = new Array<PWMChannel>();
        for (let i = 1; i < 37; i++) {
            this.channels.push(
                new PWMChannel(i, "unnamed", PWMType.Servo));
        }
    }
}