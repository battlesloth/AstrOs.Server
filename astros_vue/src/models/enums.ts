export enum ModuleType {
    none = 0,
    uart = 1,
    i2c = 2,
    gpio = 3,
}

export enum ModuleSubType {
    none = 0,
    // serial subtypes
    genericSerial = 101,
    kangaroo = 102,
    humanCyborgRelationsSerial = 103,
    maestro = 104,

    // i2c subtypes
    genericI2C = 201,
    humanCyborgRelationsI2C = 202,
    pwmBoard = 203,

    // gpio
    genericGpio = 301,
}
