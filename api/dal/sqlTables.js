module.exports = Object.freeze({

SettingsTable: 'settings',
UsersTable: 'users',
ModulesTable: 'modules',
PwmChannelsTable: 'pwm_channels',
I2cChannelsTable: 'i2c_channels',

CreateSettingsTable : `
CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE,
    value TEXT)`,

CreateUsersTable: `
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user TEXT UNIQUE,
    hash TEXT,
    salt TEXT)`,

CreateModulesTable: `
CREATE TABLE IF NOT EXISTS modules (
    id PRIMARY KEY AUTOINCREMENT,
    moduleId TEXT UNIQUE,
    name TEXT)`,

CreatePwmChTable: `
CREATE TABLE IF NOT EXISTS pwm_channels (
    id PRIMARY KEY AUTOINCREMENT,
    moduleId TEXT,
    channelId INTEGER,
    name TEXT,
    type TEXT,
    UNIQUE(moduleId, channelId) ON CONFLICT REPLACE)`,

CreateI2cChTable: `
CREATE TABLE IF NOT EXISTS i2c_channels (
    id PRIMARY KEY AUTOINCREMENT,
    moduleId TEXT,
    channelId INTEGER,
    name TEXT,
    UNIQUE(moduleId, channelId) ON CONFLICT REPLACE)`

});