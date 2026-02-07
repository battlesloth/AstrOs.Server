export enum ModuleSubType {
  NONE = 0,
  // serial subtypes
  GENERIC_SERIAL = 101,
  KANGAROO = 102,
  HUMAN_CYBORG_RELATIONS_SERIAL = 103,
  MAESTRO = 104,

  // i2c subtypes
  GENERIC_I2C = 201,
  HUMAN_CYBORG_RELATIONS_I2C = 202,
  PWM_BOARD = 203,

  // gpio
  GENERIC_GPIO = 301,
}
