import { describe, expect, it, beforeEach } from "vitest";
import { mock, mockReset } from "vitest-mock-extended";
import {
  ScriptConverter,
  ISingleCommand,
  CommandType,
} from "../src/script_converter.js";
import { ScriptRepository } from "./dal/repositories/script_repository.js";
import {
  GenericSerialEvent,
  GpioEvent,
  GpioModule,
  HcrCommand,
  HcrCommandCategory,
  HumanCyborgRelationsCmd,
  HumanCyborgRelationsEvent,
  I2cChannel,
  I2cEvent,
  I2cModule,
  KangarooAction,
  KangarooEvent,
  MaestroEvent,
  ModuleChannelTypes,
  ModuleClassType,
  ModuleSubType,
  ModuleType,
  Script,
  ScriptChannel,
  ScriptChannelType,
  ScriptEvent,
  UartChannel,
  UartModule,
} from "astros-common";
import { v4 as uuid } from "uuid";

const coreLocId = "07e5047a-32b3-4c6a-95c1-a97bebe1b0bd";
const domeLocId = "e7c35d30-c371-49ac-8553-ec31d7d2f264";
const bodyLocId = "361c5f59-e5ec-4d34-8eae-af4578eebd98";

const coreGenSerialModId = "1f76c970-2d4a-486e-8b8d-af5e13dac8dd";
const coreKangarooModId = "c6e4e295-1b62-43cf-b430-e2ff0fc91740";
const coreHCRModId = "ef9ffa30-7486-4aac-80d2-a3096163665b";
const coreMaestroModId = "29521c55-2603-4a70-bb1f-a47a8c938417";
const coreI2cModId = "f903d2fd-eb59-48de-aeac-55b72d06d1a3";

const domeGenSerialModId = "4af17fad-7cca-4d25-a140-667e4ade4ccd";
const domeKangarooModId = "c4bd126f-7947-4e1c-b501-6788d11c8d65";
const domeHCRModId = "478bab9f-260e-45be-9616-83b3e16764d1";
const domeMaestroModId = "c195f295-0020-459a-9cde-d2f2a2fd4fd6";
const domeI2cModId = "7a518233-0094-4189-a7a8-65b684ee540e";

const bodyGenSerialModId = "b7e7cb15-8ece-46f9-a37f-5e6643d2c7dd";
const bodyKangarooModId = "6441276f-5cf8-48fc-9d25-6aafde236a7e";
const bodyHCRModId = "2695ea93-e9ca-4b2e-ab26-7bb9acf300c0";
const bodyMaestroModId = "9650ae5b-5e8a-4f9a-9d9f-57ed1a644b1d";
const bodyI2cModId = "f2261640-a8ed-4f89-bc07-1c74d4a4296e";

// region Script Conversion
describe("Script Converter Tests", () => {
  const mockRepo = mock<ScriptRepository>();

  beforeEach(() => {
    mockReset(mockRepo);
    mockRepo.getModules.calledWith().mockResolvedValue(getModules());
    mockRepo.getLocationIds
      .calledWith()
      .mockResolvedValue([coreLocId, domeLocId, bodyLocId]);
  });

  it("basic serial script", async () => {
    const scriptId = "coreGenericSerial";

    mockRepo.getScript
      .calledWith(scriptId)
      .mockResolvedValue(generateScript(scriptId));

    const converter = new ScriptConverter(mockRepo);

    const script = await converter.convertScript(scriptId);

    expect(script).toBeDefined();

    const coreScript = script?.get(coreLocId);
    const domeScript = script?.get(domeLocId);
    const bodyScript = script?.get(bodyLocId);

    expect(coreScript).toBeDefined();

    const coreSegs = coreScript?.split(";");

    expect(coreSegs?.length).toBe(3);
    expect(coreSegs?.[0]).toBe("3|1000|1|9600|test 0");
    expect(coreSegs?.[1]).toBe("3|1000|1|9600|test 1");
    expect(coreSegs?.[2]).toBe("3|0|1|9600|test 2");

    // buffer events on dome and body
    expect(domeScript).toBeDefined();
    expect(bodyScript).toBeDefined();

    expect(domeScript).toBe("0|2000|0;0|0|0");
    expect(bodyScript).toBe("0|2000|0;0|0|0");
  });

  it("two channels on one location", async () => {
    const scriptId = "domeTwoChannelScript";

    mockRepo.getScript
      .calledWith(scriptId)
      .mockResolvedValue(generateScript(scriptId));

    const converter = new ScriptConverter(mockRepo);

    const script = await converter.convertScript(scriptId);

    expect(script).toBeDefined();

    const coreScript = script?.get(coreLocId);
    const domeScript = script?.get(domeLocId);
    const bodyScript = script?.get(bodyLocId);

    expect(domeScript).toBeDefined();

    const domeSegs = domeScript?.split(";");

    expect(domeSegs?.length).toBe(6);
    expect(domeSegs?.[0]).toBe("3|1000|2|9602|UART 0");
    expect(domeSegs?.[1]).toBe("2|1000|37|I2C 1");
    expect(domeSegs?.[2]).toBe("3|1000|2|9602|UART 2");
    expect(domeSegs?.[3]).toBe("2|1000|37|I2C 3");
    expect(domeSegs?.[4]).toBe("3|1000|2|9602|UART 4");
    expect(domeSegs?.[5]).toBe("2|0|37|I2C 5");

    // buffer events on core and body
    expect(coreScript).toBeDefined();
    expect(bodyScript).toBeDefined();

    expect(coreScript).toBe("0|5000|0;0|0|0");
    expect(bodyScript).toBe("0|5000|0;0|0|0");
  });

  it("dome and core scipt", async () => {
    const scriptId = "domeAndCoreScript";

    mockRepo.getScript
      .calledWith(scriptId)
      .mockResolvedValue(generateScript(scriptId));

    const converter = new ScriptConverter(mockRepo);

    const script = await converter.convertScript(scriptId);

    expect(script).toBeDefined();

    const coreScript = script?.get(coreLocId);
    const domeScript = script?.get(domeLocId);
    const bodyScript = script?.get(bodyLocId);

    expect(domeScript).toBeDefined();

    const domeSegs = domeScript?.split(";");

    expect(domeSegs?.length).toBe(6);
    expect(domeSegs?.[0]).toBe("3|1000|2|9602|UART 0");
    expect(domeSegs?.[1]).toBe("2|1000|37|I2C 1");
    expect(domeSegs?.[2]).toBe("3|1000|2|9602|UART 2");
    expect(domeSegs?.[3]).toBe("2|1000|37|I2C 3");
    expect(domeSegs?.[4]).toBe("3|1000|2|9602|UART 4");
    expect(domeSegs?.[5]).toBe("2|0|37|I2C 5");

    expect(coreScript).toBeDefined();

    const coreSegs = coreScript?.split(";");

    expect(coreSegs?.length).toBe(4);
    expect(coreSegs?.[0]).toBe("3|1000|1|9600|test 0");
    expect(coreSegs?.[1]).toBe("3|1000|1|9600|test 1");
    expect(coreSegs?.[2]).toBe("3|3000|1|9600|test 2");
    expect(coreSegs?.[3]).toBe("0|0|0");

    // buffer events on body
    expect(bodyScript).toBeDefined();

    expect(bodyScript).toBe("0|5000|0;0|0|0");
  });
});

//#endregion
//#region Commands

describe("script commands", () => {
  it("should create generic serial command", () => {
    const event = new GenericSerialEvent("test val");
    const cmd = {
      moduleSubType: ModuleSubType.genericSerial,
      event: event,
      channel: 1,
      baud: 9600,
    } as ISingleCommand;

    const result = ScriptConverter.convertCommand(cmd);

    expect(result).toBeDefined();

    const parts = result.split("|");

    expect(parts.length).toBe(5);
    expect(parts[0]).toBe(CommandType.genericSerial.toString());
    expect(parts[1]).toBe("0");
    expect(parts[2]).toBe(cmd.channel.toString());
    expect(parts[3]).toBe(cmd.baud.toString());
    expect(parts[4]).toBe(event.value);
  });

  it("should create HCR command", () => {
    const commands = Array<HcrCommand>(3);
    commands[0] = new HcrCommand(
      uuid(),
      HcrCommandCategory.sdWav,
      HumanCyborgRelationsCmd.playWavOnA,
      5,
      0,
    );

    commands[1] = new HcrCommand(
      uuid(),
      HcrCommandCategory.stimuli,
      HumanCyborgRelationsCmd.extremeHappy,
      0,
      0,
    );

    commands[2] = new HcrCommand(
      uuid(),
      HcrCommandCategory.volume,
      HumanCyborgRelationsCmd.vocalizerVolume,
      8,
      0,
    );

    const event = new HumanCyborgRelationsEvent(commands);
    const cmd = {
      moduleSubType: ModuleSubType.humanCyborgRelationsSerial,
      event: event,
      channel: 2,
      baud: 115200,
    } as ISingleCommand;

    const result = ScriptConverter.convertCommand(cmd);

    expect(result).toBeDefined();

    const parts = result.split("|");

    expect(parts.length).toBe(5);
    expect(parts[0]).toBe(CommandType.genericSerial.toString());
    expect(parts[1]).toBe("0");
    expect(parts[2]).toBe(cmd.channel.toString());
    expect(parts[3]).toBe(cmd.baud.toString());
    expect(parts[4]).toBe("<CA5,SH1,PVV8>");
  });

  it("should create Kangaroo X2 command", () => {
    const event = new KangarooEvent(
      KangarooAction.start,
      0,
      0,
      KangarooAction.position,
      5,
      10,
    );

    const cmd = {
      moduleSubType: ModuleSubType.kangaroo,
      event: event,
      channel: 1,
      baud: 9600,
    } as ISingleCommand;

    const result = ScriptConverter.convertCommand(cmd);

    expect(result).toBeDefined();

    const cmds = result.split(";");

    expect(cmds.length).toBe(2);

    const cmd1Parts = cmds[0].split("|");

    expect(cmd1Parts.length).toBe(8);
    expect(cmd1Parts[0]).toBe(CommandType.kangaroo.toString());
    expect(cmd1Parts[1]).toBe("0");
    expect(cmd1Parts[2]).toBe(cmd.channel.toString());
    expect(cmd1Parts[3]).toBe(cmd.baud.toString());
    expect(cmd1Parts[4]).toBe("1");
    expect(cmd1Parts[5]).toBe(KangarooAction.start.toString());
    expect(cmd1Parts[6]).toBe("0");
    expect(cmd1Parts[7]).toBe("0");

    const cmd2Parts = cmds[1].split("|");

    expect(cmd2Parts.length).toBe(8);
    expect(cmd2Parts[0]).toBe(CommandType.kangaroo.toString());
    expect(cmd2Parts[1]).toBe("0");
    expect(cmd2Parts[2]).toBe(cmd.channel.toString());
    expect(cmd2Parts[3]).toBe(cmd.baud.toString());
    expect(cmd2Parts[4]).toBe("2");
    expect(cmd2Parts[5]).toBe(KangarooAction.position.toString());
    expect(cmd2Parts[6]).toBe("5");
    expect(cmd2Parts[7]).toBe("10");
  });

  it("should create Maestro command", () => {
    const event = new MaestroEvent(5, false, 1000, 5, 10);
    const cmd = {
      moduleSubType: ModuleSubType.maestro,
      event: event,
      channel: 4,
      baud: 0,
    } as ISingleCommand;

    const result = ScriptConverter.convertCommand(cmd);

    expect(result).toBeDefined();

    const parts = result.split("|");

    expect(parts.length).toBe(7);
    expect(parts[0]).toBe(CommandType.maestro.toString());
    expect(parts[1]).toBe("0");
    expect(parts[2]).toBe(cmd.channel.toString());
    expect(parts[3]).toBe(event.channel.toString());
    expect(parts[4]).toBe(event.position.toString());
    expect(parts[5]).toBe(event.speed.toString());
    expect(parts[6]).toBe(event.acceleration.toString());
  });

  it("should create generic I2C command", () => {
    const event = new I2cEvent("test val");
    const cmd = {
      moduleSubType: ModuleSubType.genericI2C,
      event: event,
      channel: 27,
      baud: 0,
    } as ISingleCommand;

    const result = ScriptConverter.convertCommand(cmd);

    expect(result).toBeDefined();

    const parts = result.split("|");

    expect(parts.length).toBe(4);
    expect(parts[0]).toBe(CommandType.i2c.toString());
    expect(parts[1]).toBe("0");
    expect(parts[2]).toBe(cmd.channel.toString());
    expect(parts[3]).toBe(event.message);
  });

  it("should create generic GPIO command", () => {
    const event = new GpioEvent(true);
    const cmd = {
      moduleSubType: ModuleSubType.genericGpio,
      event: event,
      channel: 5,
      baud: 0,
    } as ISingleCommand;

    const result = ScriptConverter.convertCommand(cmd);

    expect(result).toBeDefined();

    const parts = result.split("|");

    expect(parts.length).toBe(4);
    expect(parts[0]).toBe(CommandType.gpio.toString());
    expect(parts[1]).toBe("0");
    expect(parts[2]).toBe(cmd.channel.toString());
    expect(parts[3]).toBe("1");
  });
});

//#region Helpers

function generateScript(id: string): Script {
  const script = new Script(id, "test", "test", new Date());

  switch (id) {
    case "coreGenericSerial": {
      script.scriptChannels.push(coreGenericSeriaScriptCh(id));
      return script;
    }
    case "domeTwoChannelScript": {
      script.scriptChannels.push(domeGenericSerialScriptCh(id));
      script.scriptChannels.push(domeI2cScriptCh(id));
      return script;
    }
    case "domeAndCoreScript": {
      script.scriptChannels.push(coreGenericSeriaScriptCh(id));
      script.scriptChannels.push(domeGenericSerialScriptCh(id));
      script.scriptChannels.push(domeI2cScriptCh(id));
      return script;
    }
    default:
      return script;
  }
}

function coreGenericSeriaScriptCh(scriptId: string): ScriptChannel {
  const uartChannel = new UartChannel(
    uuid(),
    coreGenSerialModId,
    "",
    ModuleSubType.genericSerial,
    true,
  );

  const scriptCh = new ScriptChannel(
    uuid(),
    scriptId,
    ScriptChannelType.GENERIC_UART,
    coreGenSerialModId,
    uartChannel.id,
    ModuleChannelTypes.UartChannel,
    uartChannel,
    3000,
  );

  for (let i = 0; i < 3; i++) {
    const evt = new GenericSerialEvent(`test ${i}`);
    const sevt = new ScriptEvent(
      scriptCh.id,
      ModuleType.uart,
      ModuleSubType.genericSerial,
      i * 10,
      evt,
    );
    scriptCh.events[i * 1000] = sevt;
  }

  return scriptCh;
}

function domeGenericSerialScriptCh(scriptId: string): ScriptChannel {
  const uartChannel = new UartChannel(
    uuid(),
    domeGenSerialModId,
    "",
    ModuleSubType.genericSerial,
    true,
  );

  const scriptCh = new ScriptChannel(
    uuid(),
    scriptId,
    ScriptChannelType.GENERIC_UART,
    domeGenSerialModId,
    uartChannel.id,
    ModuleChannelTypes.UartChannel,
    uartChannel,
    3000,
  );

  for (let i = 0; i < 6; i++) {
    if (i % 2 === 0) {
      const evt = new GenericSerialEvent(`UART ${i}`);
      const sevt = new ScriptEvent(
        scriptCh.id,
        ModuleType.uart,
        ModuleSubType.genericSerial,
        i * 10,
        evt,
      );
      scriptCh.events[i * 1000] = sevt;
    }
  }

  return scriptCh;
}

function domeI2cScriptCh(scriptId: string): ScriptChannel {
  const i2cChannel = new I2cChannel(uuid(), domeI2cModId, "", true);

  const scriptCh = new ScriptChannel(
    uuid(),
    scriptId,
    ScriptChannelType.GENERIC_I2C,
    domeI2cModId,
    i2cChannel.id,
    ModuleChannelTypes.I2cChannel,
    i2cChannel,
    3000,
  );

  for (let i = 0; i < 6; i++) {
    if (i % 2 !== 0) {
      const evt = new I2cEvent(`I2C ${i}`);
      const sevt = new ScriptEvent(
        scriptCh.id,
        ModuleType.i2c,
        ModuleSubType.genericI2C,
        i * 10,
        evt,
      );
      scriptCh.events[i * 1000] = sevt;
    }
  }

  return scriptCh;
}

function getModules() {
  const map = new Map<string, ModuleClassType>();

  // core
  map.set(
    coreGenSerialModId,
    new UartModule(
      0,
      coreGenSerialModId,
      "Core Gen Serial",
      coreLocId,
      ModuleSubType.genericSerial,
      1,
      9600,
    ),
  );
  map.set(
    coreKangarooModId,
    new UartModule(
      0,
      coreKangarooModId,
      "Core Kangaroo",
      coreLocId,
      ModuleSubType.kangaroo,
      1,
      19600,
    ),
  );
  map.set(
    coreHCRModId,
    new UartModule(
      0,
      coreHCRModId,
      "Core HCR",
      coreLocId,
      ModuleSubType.humanCyborgRelationsSerial,
      1,
      38400,
    ),
  );
  map.set(
    coreMaestroModId,
    new UartModule(
      3,
      coreMaestroModId,
      "Core Maestro",
      coreLocId,
      ModuleSubType.maestro,
      1,
      57600,
    ),
  );
  map.set(
    coreI2cModId,
    new I2cModule(
      0,
      coreI2cModId,
      "Core I2C",
      coreLocId,
      27,
      ModuleSubType.genericI2C,
    ),
  );
  map.set(coreLocId, new GpioModule(coreLocId));

  // dome
  map.set(
    domeGenSerialModId,
    new UartModule(
      0,
      domeGenSerialModId,
      "Dome Gen Serial",
      domeLocId,
      ModuleSubType.genericSerial,
      2,
      9602,
    ),
  );
  map.set(
    domeKangarooModId,
    new UartModule(
      0,
      domeKangarooModId,
      "Dome Kangaroo",
      domeLocId,
      ModuleSubType.kangaroo,
      2,
      19602,
    ),
  );
  map.set(
    domeHCRModId,
    new UartModule(
      0,
      domeHCRModId,
      "Dome HCR",
      domeLocId,
      ModuleSubType.humanCyborgRelationsSerial,
      2,
      38402,
    ),
  );
  map.set(
    domeMaestroModId,
    new UartModule(
      3,
      domeMaestroModId,
      "Dome Maestro",
      domeLocId,
      ModuleSubType.maestro,
      2,
      57602,
    ),
  );
  map.set(
    domeI2cModId,
    new I2cModule(
      0,
      domeI2cModId,
      "Dome I2C",
      domeLocId,
      37,
      ModuleSubType.genericI2C,
    ),
  );
  map.set(domeLocId, new GpioModule(domeLocId));

  // body
  map.set(
    bodyGenSerialModId,
    new UartModule(
      0,
      bodyGenSerialModId,
      "Body Gen Serial",
      bodyLocId,
      ModuleSubType.genericSerial,
      3,
      9603,
    ),
  );
  map.set(
    bodyKangarooModId,
    new UartModule(
      0,
      bodyKangarooModId,
      "Body Kangaroo",
      bodyLocId,
      ModuleSubType.kangaroo,
      3,
      19603,
    ),
  );
  map.set(
    bodyHCRModId,
    new UartModule(
      0,
      bodyHCRModId,
      "Body HCR",
      bodyLocId,
      ModuleSubType.humanCyborgRelationsSerial,
      3,
      38403,
    ),
  );
  map.set(
    bodyMaestroModId,
    new UartModule(
      3,
      bodyMaestroModId,
      "Body Maestro",
      bodyLocId,
      ModuleSubType.maestro,
      3,
      57603,
    ),
  );
  map.set(
    bodyI2cModId,
    new I2cModule(
      0,
      bodyI2cModId,
      "Body I2C",
      bodyLocId,
      47,
      ModuleSubType.genericI2C,
    ),
  );
  map.set(bodyLocId, new GpioModule(bodyLocId));

  return map;
}
