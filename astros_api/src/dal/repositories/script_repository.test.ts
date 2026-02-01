import { describe, it, expect, beforeEach, afterEach } from "vitest";
import SQLite from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import { Database } from "../types.js";
import { migrateToLatest } from "../database.js";
import { ScriptRepository } from "./script_repository.js";
import {
  Script,
  ScriptChannel,
  ScriptEvent,
  GpioModule,
  GpioChannel,
  MaestroModule,
  MaestroChannel,
  ScriptChannelType,
  ModuleChannelTypes,
  ModuleType,
  ModuleSubType,
  MaestroEvent,
  MaestroBoard,
  GpioEvent,
  UartModule,
  UartChannel,
  HumanCyborgRelationsEvent,
  HcrCommand,
  HumanCyborgRelationsCmd,
  HcrCommandCategory,
} from "astros-common";
import { upsertGpioModule } from "./module_repositories/gpio_repository.js";
import { upsertUartModules } from "./module_repositories/uart_repository.js";

import { v4 as uuid } from "uuid";

describe("Script Repository", () => {
  let db: Kysely<Database>;
  let locationId: string;

  beforeEach(async () => {
    const dialect = new SqliteDialect({
      database: new SQLite(":memory:"),
    });

    db = new Kysely<Database>({
      dialect,
    });

    await migrateToLatest(db);

    // Create a test location
    locationId = uuid();
    await db
      .insertInto("locations")
      .values({
        id: locationId,
        name: "Test Location",
        description: "Test Location Description",
        config_fingerprint: "test-fingerprint",
      })
      .execute();
  });

  afterEach(async () => {
    await db.destroy();
  });

  it("should save script", async () => {
    const scriptId = uuid();

    const script = new Script(
      scriptId,
      "Test Script",
      "Test Description",
      new Date(Date.now()),
    );

    const repo = new ScriptRepository(db);

    await repo.upsertScript(script);

    const savedScripts = await repo.getScripts();

    expect(savedScripts.length).toBe(1);
    expect(savedScripts[0].id).toBe(scriptId);
    expect(savedScripts[0].scriptName).toBe("Test Script");
    expect(savedScripts[0].description).toBe("Test Description");
    expect(savedScripts[0].deploymentStatus).toEqual({});
  });

  it("should update script", async () => {
    const scriptId = uuid();

    const script = new Script(
      scriptId,
      "Test Script",
      "Test Description",
      new Date(Date.now()),
    );

    const repo = new ScriptRepository(db);

    await repo.upsertScript(script);

    const savedScripts = await repo.getScripts();

    expect(savedScripts.length).toBe(1);
    expect(savedScripts[0].id).toBe(scriptId);
    expect(savedScripts[0].scriptName).toBe("Test Script");
    expect(savedScripts[0].description).toBe("Test Description");
    expect(savedScripts[0].deploymentStatus).toEqual({});

    script.scriptName = "Updated Script";
    script.description = "Updated Description";

    await repo.upsertScript(script);

    const updatedScripts = await repo.getScripts();

    expect(updatedScripts.length).toBe(1);
    expect(updatedScripts[0].id).toBe(scriptId);
    expect(updatedScripts[0].scriptName).toBe("Updated Script");
    expect(updatedScripts[0].description).toBe("Updated Description");
    expect(updatedScripts[0].deploymentStatus).toEqual({});
  });

  it("should delete script", async () => {
    const scriptId = uuid();

    const script = new Script(
      scriptId,
      "Test Script",
      "Test Description",
      new Date(Date.now()),
    );

    const repo = new ScriptRepository(db);

    await repo.upsertScript(script);

    const savedScripts = await repo.getScripts();

    expect(savedScripts.length).toBe(1);
    expect(savedScripts[0].id).toBe(scriptId);
    expect(savedScripts[0].scriptName).toBe("Test Script");
    expect(savedScripts[0].description).toBe("Test Description");
    expect(savedScripts[0].deploymentStatus).toEqual({});

    await repo.deleteScript(scriptId);

    const updatedScripts = await repo.getScripts();

    expect(updatedScripts.length).toBe(0);
  });

  it("should save and retrieve script with GPIO channel", async () => {
    const scriptId = uuid();
    const channelId = uuid();

    // Create a GPIO channel in the database
    const gpioModule = new GpioModule(locationId);
    const gpioChannel = new GpioChannel(
      channelId,
      locationId,
      0,
      true,
      "Test GPIO Channel",
      false,
    );
    gpioModule.channels.push(gpioChannel);
    await upsertGpioModule(db, gpioModule);

    // Create a script with a GPIO channel
    const script = new Script(
      scriptId,
      "GPIO Test Script",
      "Script with GPIO channel",
      new Date(Date.now()),
    );

    const scriptChannel = new ScriptChannel(
      uuid(),
      scriptId,
      ScriptChannelType.GPIO,
      locationId,
      channelId,
      ModuleChannelTypes.GpioChannel,
      gpioChannel,
      0,
    );

    script.scriptChannels.push(scriptChannel);

    const repo = new ScriptRepository(db);
    await repo.upsertScript(script);

    // Retrieve and verify
    const savedScript = await repo.getScript(scriptId);

    expect(savedScript.scriptChannels.length).toBe(1);
    expect(savedScript.scriptChannels[0].channelType).toBe(
      ScriptChannelType.GPIO,
    );
    expect(savedScript.scriptChannels[0].moduleChannelType).toBe(
      ModuleChannelTypes.GpioChannel,
    );
    expect(savedScript.scriptChannels[0].moduleChannel.channelName).toBe(
      "Test GPIO Channel",
    );
  });

  it("should save and retrieve script with Maestro channel", async () => {
    const scriptId = uuid();
    const maestroModuleId = uuid();
    const maestroChannelId = uuid();

    // Create a Maestro module and channel in the database
    const maestroModule = new MaestroModule();

    maestroModule.boards.push(
      new MaestroBoard(maestroModuleId, locationId, 0, "Test Board", 24),
    );

    const maestroChannel = new MaestroChannel(
      maestroChannelId,
      maestroModuleId,
      "Servo Channel 1",
      true,
      0,
      true,
      500,
      2500,
      1500,
      false,
    );

    maestroModule.boards[0].channels.push(maestroChannel);

    // Wrap the maestro module in a UartModule
    const uartModule = new UartModule(
      0,
      maestroModuleId,
      "Test Maestro",
      locationId,
      ModuleSubType.maestro,
      0,
      9600,
    );
    uartModule.subModule = maestroModule;

    await db.transaction().execute(async (trx) => {
      await upsertUartModules(trx, [uartModule]);
    });

    // Create a script with a Maestro channel
    const script = new Script(
      scriptId,
      "Maestro Test Script",
      "Script with Maestro channel",
      new Date(Date.now()),
    );

    const scriptChannel = new ScriptChannel(
      uuid(),
      scriptId,
      ScriptChannelType.SERVO,
      maestroModuleId,
      maestroChannelId,
      ModuleChannelTypes.MaestroChannel,
      maestroChannel,
      0,
    );

    script.scriptChannels.push(scriptChannel);

    const repo = new ScriptRepository(db);
    await repo.upsertScript(script);

    // Retrieve and verify
    const savedScript = await repo.getScript(scriptId);

    expect(savedScript.scriptChannels.length).toBe(1);
    expect(savedScript.scriptChannels[0].channelType).toBe(
      ScriptChannelType.SERVO,
    );
    expect(savedScript.scriptChannels[0].moduleChannelType).toBe(
      ModuleChannelTypes.MaestroChannel,
    );
    expect(savedScript.scriptChannels[0].moduleChannel.channelName).toBe(
      "Servo Channel 1",
    );
  });

  it("should save and retrieve script with events", async () => {
    const scriptId = uuid();
    const channelId = uuid();
    const eventId = uuid();

    // Create a GPIO channel
    const gpioModule = new GpioModule(locationId);
    const gpioChannel = new GpioChannel(
      channelId,
      locationId,
      0,
      true,
      "Test GPIO",
      false,
    );
    gpioModule.channels.push(gpioChannel);
    await upsertGpioModule(db, gpioModule);

    // Create a script with a channel and event
    const script = new Script(
      scriptId,
      "Event Test Script",
      "Script with events",
      new Date(Date.now()),
    );

    const scriptChannel = new ScriptChannel(
      uuid(),
      scriptId,
      ScriptChannelType.GPIO,
      locationId,
      channelId,
      ModuleChannelTypes.GpioChannel,
      gpioChannel,
      0,
    );

    const scriptEvent = new ScriptEvent(
      eventId,
      scriptChannel.id,
      ModuleType.gpio,
      ModuleSubType.genericGpio,
      5.5,
      new GpioEvent(true),
    );

    scriptChannel.events[eventId] = scriptEvent;
    script.scriptChannels.push(scriptChannel);

    const repo = new ScriptRepository(db);
    await repo.upsertScript(script);

    // Retrieve and verify
    const savedScript = await repo.getScript(scriptId);

    expect(savedScript.scriptChannels.length).toBe(1);
    expect(Object.keys(savedScript.scriptChannels[0].events).length).toBe(1);

    const savedEvent = savedScript.scriptChannels[0].events[eventId];
    expect(savedEvent).toBeDefined();
    expect(savedEvent.time).toBe(5.5);
    expect(savedEvent.moduleType).toBe(ModuleType.gpio);
    expect(savedEvent.moduleSubType).toBe(ModuleSubType.genericGpio);
  });

  it("should update Maestro channel number in events", async () => {
    const scriptId = uuid();
    const maestroModuleId = uuid();
    const maestroChannelId = uuid();
    const eventId = uuid();

    // Create Maestro module and channel
    const maestroModule = new MaestroModule();

    maestroModule.boards.push(
      new MaestroBoard(maestroModuleId, locationId, 0, "Test Board", 24),
    );

    const maestroChannel = new MaestroChannel(
      maestroChannelId,
      maestroModuleId,
      "Servo Channel 5",
      true,
      5, // Channel number
      true, // isServo
      500,
      2500,
      1500,
      false,
    );

    maestroModule.boards[0].channels.push(maestroChannel);
    // Wrap the maestro module in a UartModule
    const uartModule = new UartModule(
      0,
      maestroModuleId,
      "Test Maestro",
      locationId,
      ModuleSubType.maestro,
      0,
      9600,
    );
    uartModule.subModule = maestroModule;

    await db.transaction().execute(async (trx) => {
      await upsertUartModules(trx, [uartModule]);
    });

    // Create script with Maestro event
    const script = new Script(
      scriptId,
      "Maestro Event Test",
      "Test Maestro event channel update",
      new Date(Date.now()),
    );

    const scriptChannel = new ScriptChannel(
      uuid(),
      scriptId,
      ScriptChannelType.SERVO,
      maestroModuleId,
      maestroChannelId,
      ModuleChannelTypes.MaestroChannel,
      maestroChannel,
      0,
    );

    const maestroEvent = new MaestroEvent(0, true, 1500, 0, 0); // Channel is 0 initially
    const scriptEvent = new ScriptEvent(
      eventId,
      scriptChannel.id,
      ModuleType.uart,
      ModuleSubType.maestro,
      2.0,
      maestroEvent,
    );

    scriptChannel.events[eventId] = scriptEvent;
    script.scriptChannels.push(scriptChannel);

    const repo = new ScriptRepository(db);
    await repo.upsertScript(script);

    // Retrieve and verify channel number was updated
    const savedScript = await repo.getScript(scriptId);
    const savedEvent = savedScript.scriptChannels[0].events[
      eventId
    ] as ScriptEvent;

    expect(savedEvent).toBeDefined();
    const savedMaestroEvent = savedEvent.event as MaestroEvent;
    expect(savedMaestroEvent.channel).toBe(5); // Should be updated to match the channel
  });

  it("should save and retrieve script with Human Cyborg Relations channel", async () => {
    const scriptId = uuid();
    const hcrModuleId = uuid();

    // Create an HCR UART module and channel in the database
    // For generic UART channels, the channel ID is the same as the module ID
    const uartChannel = new UartChannel(
      hcrModuleId,
      hcrModuleId,
      "HCR Channel 1",
      ModuleSubType.humanCyborgRelationsSerial,
      true,
    );

    const uartModule = new UartModule(
      0,
      hcrModuleId,
      "Test HCR",
      locationId,
      ModuleSubType.humanCyborgRelationsSerial,
      0,
      9600,
    );

    await db.transaction().execute(async (trx) => {
      await upsertUartModules(trx, [uartModule]);
    });

    // Create a script with an HCR channel
    const script = new Script(
      scriptId,
      "HCR Test Script",
      "Script with HCR channel",
      new Date(Date.now()),
    );

    const scriptChannel = new ScriptChannel(
      uuid(),
      scriptId,
      ScriptChannelType.GENERIC_UART,
      hcrModuleId,
      hcrModuleId,
      ModuleChannelTypes.UartChannel,
      uartChannel,
      0,
    );

    script.scriptChannels.push(scriptChannel);

    const repo = new ScriptRepository(db);
    await repo.upsertScript(script);

    // Retrieve and verify
    const savedScript = await repo.getScript(scriptId);

    expect(savedScript.scriptChannels.length).toBe(1);
    expect(savedScript.scriptChannels[0].channelType).toBe(
      ScriptChannelType.GENERIC_UART,
    );
    expect(savedScript.scriptChannels[0].moduleChannelType).toBe(
      ModuleChannelTypes.UartChannel,
    );
    // For generic UART channels, the channel name comes from the module name
    expect(savedScript.scriptChannels[0].moduleChannel.channelName).toBe(
      "Test HCR",
    );
  });

  it("should save and retrieve script with HCR events", async () => {
    const scriptId = uuid();
    const hcrModuleId = uuid();
    const eventId = uuid();

    // Create an HCR UART module and channel
    // For generic UART channels, the channel ID is the same as the module ID
    const uartChannel = new UartChannel(
      hcrModuleId,
      hcrModuleId,
      "HCR Channel 1",
      ModuleSubType.humanCyborgRelationsSerial,
      true,
    );

    const uartModule = new UartModule(
      0,
      hcrModuleId,
      "Test HCR",
      locationId,
      ModuleSubType.humanCyborgRelationsSerial,
      0,
      9600,
    );

    await db.transaction().execute(async (trx) => {
      await upsertUartModules(trx, [uartModule]);
    });

    // Create a script with an HCR channel and event
    const script = new Script(
      scriptId,
      "HCR Event Test Script",
      "Script with HCR events",
      new Date(Date.now()),
    );

    const scriptChannel = new ScriptChannel(
      uuid(),
      scriptId,
      ScriptChannelType.GENERIC_UART,
      hcrModuleId,
      hcrModuleId,
      ModuleChannelTypes.UartChannel,
      uartChannel,
      0,
    );

    // Create HCR commands
    const hcrCommands = [
      new HcrCommand(
        uuid(),
        HcrCommandCategory.stimuli,
        HumanCyborgRelationsCmd.mildHappy,
        0,
        0,
      ),
      new HcrCommand(
        uuid(),
        HcrCommandCategory.volume,
        HumanCyborgRelationsCmd.vocalizerVolume,
        75,
        0,
      ),
    ];

    const hcrEvent = new HumanCyborgRelationsEvent(hcrCommands);
    const scriptEvent = new ScriptEvent(
      eventId,
      scriptChannel.id,
      ModuleType.uart,
      ModuleSubType.humanCyborgRelationsSerial,
      3.5,
      hcrEvent,
    );

    scriptChannel.events[eventId] = scriptEvent;
    script.scriptChannels.push(scriptChannel);

    const repo = new ScriptRepository(db);
    await repo.upsertScript(script);

    // Retrieve and verify
    const savedScript = await repo.getScript(scriptId);

    expect(savedScript.scriptChannels.length).toBe(1);
    expect(Object.keys(savedScript.scriptChannels[0].events).length).toBe(1);

    const savedEvent = savedScript.scriptChannels[0].events[eventId];
    expect(savedEvent).toBeDefined();
    expect(savedEvent.time).toBe(3.5);
    expect(savedEvent.moduleType).toBe(ModuleType.uart);
    expect(savedEvent.moduleSubType).toBe(
      ModuleSubType.humanCyborgRelationsSerial,
    );

    const savedHcrEvent = savedEvent.event as HumanCyborgRelationsEvent;
    expect(savedHcrEvent.commands).toBeDefined();
    expect(savedHcrEvent.commands.length).toBe(2);
    expect(savedHcrEvent.commands[0].category).toBe(HcrCommandCategory.stimuli);
    expect(savedHcrEvent.commands[0].command).toBe(
      HumanCyborgRelationsCmd.mildHappy,
    );
    expect(savedHcrEvent.commands[1].category).toBe(HcrCommandCategory.volume);
    expect(savedHcrEvent.commands[1].command).toBe(
      HumanCyborgRelationsCmd.vocalizerVolume,
    );
    expect(savedHcrEvent.commands[1].valueA).toBe(75);
  });
});
