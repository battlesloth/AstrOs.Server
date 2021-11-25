
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
    UNASSIGNED: "unassigned",
    SERVO: "servo",
    LED: "led",
    OTHER: "other"
}

class Module{
    constructor(id, name){
        this.id = id;  
        this.name = name;
        this.uartModule = new UartModule();
        this.PwmModule = new PwmModule();
        this.I2cModule = new I2cModule();
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
    constructor(id, name, type){
        this.id = id;
        this.name = name;
        this.type = type;
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