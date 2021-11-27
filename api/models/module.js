
const ModuleId = {
    CORE: "core",
    DOME: "dome",
    BODY: "body"
}

const UartType = {
    NONE: "none",
    KANGAROO: "kangaroo"
}

const PwmType = {
    UNASSIGNED: 0,
    // no limit
    CONTINUOUS_SERVO: 1,
    // limit0
    POSITIONAL_SERVO: 2,
    // limit0 and limit1
    LINEAR_SERVO: 3,
    LED: 4,
    HIGH_LOW: 5
}

class Module{
    constructor(id, name){
        this.id = id;  
        this.name = name;
        this.uartModule = new UartModule();
        this.pwmModule = new PwmModule();
        this.i2cModule = new I2cModule();
    }
}

class UartModule{
    constructor(){
        this.name = "unnamed";
        this.type = UartType.NONE;
        this.module = null;
    }
}

class PwmModule{
    constructor(){
        this.channels = [];
        for (let i = 0; i < 36; i++) {
            this.channels[i] = new PwmChannel(i, "unnamed", PwmType.UNASSIGNED);
        }
    }
}

class PwmChannel {
    constructor(id, name, type, limit0, limit1){
        this.id = id;
        this.name = name;
        this.type = type;
        this.limit0 = limit0;
        this.limit1 = limit1;
    }
}

class I2cModule{
    constructor(){
        this.channels = [];
        for (let i = 0; i < 128; i++) {
            this.channels[i] = new I2cChannel(i, "unnamed");
        }
    }
}

class I2cChannel{
    constructor(id, name){
        this.id = id;
        this.name = name;
    }
}


module.exports = {
    ModuleId : ModuleId,
    UartType : UartType,
    PwmType: PwmType,
    Module : Module,
    UartModule : UartModule,
    PwmModule : PwmModule,
    PwmChannel : PwmChannel,
    I2cModule : I2cModule,
    I2cChannel : I2cChannel
}