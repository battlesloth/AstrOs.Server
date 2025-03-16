import { 
    describe, 
    it, 
    expect, 
    beforeEach, 
    afterEach 
} from "vitest";
import SQLite from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import { Database } from "../types.js";
import { migrateToLatest } from '../database.js';
import { ScriptRepository } from './script_repository.js';
import { LocationsRepository } from './locations_repository.js';
import { ControllerLocation, GpioChannel, I2cChannel, I2cModule, KangarooX2, KangarooX2Channel, MaestroBoard, MaestroChannel, MaestroModule, ModuleChannelTypes, ModuleSubType, Script, ScriptChannel, ScriptChannelType, UartChannel, UartModule } from "astros-common";

 import { v4 as uuid } from "uuid";
import { logger } from "../../logger.js";

describe('I2cRepository', () => {

    let db: Kysely<Database>;
   
    beforeEach(async () => {
        const dialect = new SqliteDialect({
            database: new SQLite(":memory:"),
        });
    
        db = new Kysely<Database>({
            dialect
        });

        await migrateToLatest(db);
    });

    afterEach(async () => {
        await db.destroy();
    });

    it('should save script', async () => {

        const scriptId = uuid();

        const script = new Script(
            scriptId,
            "Test Script",
            "Test Description",
            new Date(Date.now())
        );

        const repo = new ScriptRepository(db);

        await repo.upsertScript(script);

        const savedScripts = await repo.getScripts();
        
        expect(savedScripts.length).toBe(1);
        expect(savedScripts[0].id).toBe(scriptId);
        expect(savedScripts[0].scriptName).toBe("Test Script");
        expect(savedScripts[0].description).toBe("Test Description");
        expect(savedScripts[0].deploymentStatusKvp.length).toBe(0);
    });

    it('should update script', async () => {

        const scriptId = uuid();

        const script = new Script(
            scriptId,
            "Test Script",
            "Test Description",
            new Date(Date.now())
        );

        const repo = new ScriptRepository(db);

        await repo.upsertScript(script);

        const savedScripts = await repo.getScripts();
        
        expect(savedScripts.length).toBe(1);
        expect(savedScripts[0].id).toBe(scriptId);
        expect(savedScripts[0].scriptName).toBe("Test Script");
        expect(savedScripts[0].description).toBe("Test Description");
        expect(savedScripts[0].deploymentStatusKvp.length).toBe(0);

        script.scriptName = "Updated Script";
        script.description = "Updated Description";

        await repo.upsertScript(script);

        const updatedScripts = await repo.getScripts();
        
        expect(updatedScripts.length).toBe(1);
        expect(updatedScripts[0].id).toBe(scriptId);
        expect(updatedScripts[0].scriptName).toBe("Updated Script");
        expect(updatedScripts[0].description).toBe("Updated Description");
        expect(updatedScripts[0].deploymentStatusKvp.length).toBe(0);
    });

    it('should delete script', async () => {
        
        const scriptId = uuid();

        const script = new Script(
            scriptId,
            "Test Script",
            "Test Description",
            new Date(Date.now())
        );

        const repo = new ScriptRepository(db);

        await repo.upsertScript(script);

        const savedScripts = await repo.getScripts();
        
        expect(savedScripts.length).toBe(1);
        expect(savedScripts[0].id).toBe(scriptId);
        expect(savedScripts[0].scriptName).toBe("Test Script");
        expect(savedScripts[0].description).toBe("Test Description");
        expect(savedScripts[0].deploymentStatusKvp.length).toBe(0);

        await repo.deleteScript(scriptId);

        const updatedScripts = await repo.getScripts();
        
        expect(updatedScripts.length).toBe(0);
    });

    it('should save script with script events', async () => {


        const conn = db.case();

        const location = await populateDatabase(db);

        const scriptId = uuid();

        const script = new Script(
            scriptId,
            "Test Script",
            "Test Description",
            new Date(Date.now())
        );

        populateScriptEvents(script, location);

        const repo = new ScriptRepository(db);

        await repo.upsertScript(script);

        const savedScripts = await repo.getScripts();
        
        expect(savedScripts.length).toBe(1);
        expect(savedScripts[0].id).toBe(scriptId);
        expect(savedScripts[0].scriptName).toBe("Test Script");
        expect(savedScripts[0].description).toBe("Test Description");
        expect(savedScripts[0].deploymentStatusKvp.length).toBe(0);
        expect(savedScripts[0].scriptChannels.length).toBe(5);
        
        const i2cIdx = savedScripts[0].scriptChannels
        .findIndex(c => c.channelType === ScriptChannelType.GENERIC_I2C);

        expect(i2cIdx).toBeGreaterThan(-1);
        expect(savedScripts[0].scriptChannels[i2cIdx].channelType).toBe(ScriptChannelType.GENERIC_I2C);
        
        const gpioIdx = savedScripts[0].scriptChannels
        .findIndex(c => c.channelType === ScriptChannelType.GPIO);

        expect(gpioIdx).toBeGreaterThan(-1);
        expect(savedScripts[0].scriptChannels[gpioIdx].channelType).toBe(ScriptChannelType.GPIO);

        const uartIdx = savedScripts[0].scriptChannels
        .findIndex(c => c.channelType === ScriptChannelType.GENERIC_UART);

        expect(uartIdx).toBeGreaterThan(-1);
        expect(savedScripts[0].scriptChannels[uartIdx].channelType).toBe(ScriptChannelType.GENERIC_UART);

        const kangarooIdx = savedScripts[0].scriptChannels
        .findIndex(c => c.channelType === ScriptChannelType.KANGAROO);

        expect(kangarooIdx).toBeGreaterThan(-1);
        expect(savedScripts[0].scriptChannels[kangarooIdx].channelType).toBe(ScriptChannelType.KANGAROO);

        const maestroServoIdx = savedScripts[0].scriptChannels
        .findIndex(c => c.channelType === ScriptChannelType.SERVO && c.moduleChannelType === ModuleChannelTypes.MaestroChannel);

        expect(maestroServoIdx).toBeGreaterThan(-1);
        expect(savedScripts[0].scriptChannels[maestroServoIdx].channelType).toBe(ScriptChannelType.SERVO);

        const maestroGpioIdx = savedScripts[0].scriptChannels
        .findIndex(c => c.channelType === ScriptChannelType.GPIO && c.moduleChannelType === ModuleChannelTypes.MaestroChannel);

        expect(maestroGpioIdx).toBeGreaterThan(-1);
        expect(savedScripts[0].scriptChannels[maestroGpioIdx].channelType).toBe(ScriptChannelType.GPIO);
    });

});


async function populateDatabase(
    db: Kysely<Database>
): Promise<ControllerLocation> {

    const repo = new LocationsRepository(db);

    const locations = await repo.loadLocations();

    const location = locations[0];

    const i2cModule = new I2cModule(
        uuid(),
        "I2C Mod",
        location.id,
        42,
        ModuleSubType.genericI2C
    )

    location.i2cModules.push(i2cModule);

    const genericUartModule = new UartModule(
        uuid(),
        "Generic Uart Mod",
        location.id,
        ModuleSubType.genericSerial,
        1,
        9600
    );

    location.uartModules.push(genericUartModule);

    const kangarooModule = new UartModule(
        uuid(),
        "Kangaroo Mod",
        location.id,
        ModuleSubType.kangaroo,
        1,
        19200
    );
    
    kangarooModule.subModule = new KangarooX2(
        kangarooModule.id,
        "channe1 1",
        "channel 2"
    )
    
    location.uartModules.push(kangarooModule);

    const maestroModule = new UartModule(
        uuid(),
        "Maestro Mod",
        location.id,
        ModuleSubType.maestro,
        1,
        115200
    );

    const maestroSubModule = new MaestroModule();

    maestroSubModule.boards.push( new MaestroBoard(
        uuid(),
        maestroModule.id,
        0,
        "Board 0",
        24
    ));

    for (let i = 0; i < 24; i++) {
        maestroSubModule.boards[0].channels.push(new MaestroChannel(
            uuid(),
            maestroModule.id,
            `Channel ${i}`,
            true,
            i,
            i % 2 !== 0,
            500,
            2500,
            1250,
            false
        ));
    }
    
    maestroModule.subModule = maestroSubModule;

    logger.info(JSON.stringify(db.connection))


    repo.updateLocation(location);

    return location;
}



function populateScriptEvents(script: Script, location: ControllerLocation) {
    script.scriptChannels.push(createI2cChannel(script.id, location));
    script.scriptChannels.push(createGpioChannel(script.id, location));
    script.scriptChannels.push(createUartChannel(script.id, location));
    script.scriptChannels.push(createKangarooChannel(script.id, location));
    script.scriptChannels.push(createMaestroServoChannel(script.id, location));
    script.scriptChannels.push(createMaestroGpioChannel(script.id, location));
}

function createI2cChannel(scriptId: string, location: ControllerLocation) {
    
    const i2cModule = location.i2cModules[0];
    
    const channel = new I2cChannel(
        uuid(),
        i2cModule.id,
        i2cModule.name,
        true,
    );

    const scriptChannel = new ScriptChannel(
        uuid(),
        scriptId,
        ScriptChannelType.GENERIC_I2C,
        channel.id,
        ModuleChannelTypes.I2cChannel,
        channel,
        3000
    );

    return scriptChannel;
}

function createGpioChannel(scriptId: string, location: ControllerLocation) {

    const channel = new GpioChannel(
        uuid(),
        location.id,
        1,
        true,
        "GPIO Channel 1",
        true
    );

    const scriptChannel = new ScriptChannel(
        uuid(),
        scriptId,
        ScriptChannelType.GPIO,
        channel.id,
        ModuleChannelTypes.GpioChannel,
        channel,
        3000
    );

    return scriptChannel;
}

function createUartChannel(scriptId: string, location: ControllerLocation) {

    const idx = location.uartModules
    .findIndex(m => 
        m.moduleSubType === ModuleSubType.genericSerial
    );

    const uartModule = location.uartModules[idx];

    const channel = new UartChannel(
        uartModule.id,
        uartModule.id,
        uartModule.name,
        ModuleSubType.genericSerial,
        true
    );

    const scriptChannel = new ScriptChannel(
        uuid(),
        scriptId,
        ScriptChannelType.GENERIC_UART,
        channel.id,
        ModuleChannelTypes.UartChannel,
        channel,
        3000
    );

    return scriptChannel;
}

function createKangarooChannel(scriptId: string, location: ControllerLocation) {

    const idx = location.uartModules
    .findIndex(m => 
        m.moduleSubType === ModuleSubType.kangaroo
    );

    const uartModule = location.uartModules[idx];
    const subModule = uartModule.subModule as KangarooX2;

    const channel = new KangarooX2Channel(
        subModule.id,
        uartModule.id,
        uartModule.name,
        subModule.ch1Name,
        subModule.ch2Name
    );

    const scriptChannel = new ScriptChannel(
        uuid(),
        scriptId,
        ScriptChannelType.KANGAROO,
        channel.id,
        ModuleChannelTypes.KangarooX2Channel,
        channel,
        3000
    );

    return scriptChannel;
}

function createMaestroServoChannel(scriptId: string, location: ControllerLocation) {

    const idx = location.uartModules
    .findIndex(m => 
        m.moduleSubType === ModuleSubType.maestro
    );

    const uartModule = location.uartModules[idx];
    const subModule = uartModule.subModule as MaestroModule;

    const channel = subModule.boards[0].channels[0];

    const scriptChannel = new ScriptChannel(
        uuid(),
        scriptId,
        ScriptChannelType.SERVO,
        channel.id,
        ModuleChannelTypes.MaestroChannel,
        channel,
        3000
    );

    return scriptChannel;
}

function createMaestroGpioChannel(scriptId: string, location: ControllerLocation) {

    const idx = location.uartModules
    .findIndex(m => 
        m.moduleSubType === ModuleSubType.maestro
    );

    const uartModule = location.uartModules[idx];
    const subModule = uartModule.subModule as MaestroModule;

    const channel = subModule.boards[0].channels[1];

    const scriptChannel = new ScriptChannel(
        uuid(),
        scriptId,
        ScriptChannelType.GPIO,
        channel.id,
        ModuleChannelTypes.MaestroChannel,
        channel,
        3000
    );

    return scriptChannel;
}