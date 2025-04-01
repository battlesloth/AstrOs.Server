import { describe, expect, it, beforeEach } from "vitest";
import { mock, mockReset } from "vitest-mock-extended";
import { ScriptConverter } from "../src/script_converter.js";
import { ScriptRepository } from "./dal/repositories/script_repository.js";
import {
  GenericSerialEvent,
  GpioModule,
  I2cChannel,
  I2cEvent,
  I2cModule,
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
      .mockResolvedValue(coreGenericSerialScript());

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
      .mockResolvedValue(domeTwoChannelScript());

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

    // buffer events on dome and body
    expect(coreScript).toBeDefined();
    expect(bodyScript).toBeDefined();

    expect(coreScript).toBe("0|5000|0;0|0|0");
    expect(bodyScript).toBe("0|5000|0;0|0|0");
  });
});

function coreGenericSerialScript(): Script {
  const script = new Script("coreGenericSerial", "test", "test", new Date());

  const uartChannel = new UartChannel(
    uuid(),
    coreGenSerialModId,
    "",
    ModuleSubType.genericSerial,
    true,
  );

  const scriptCh = new ScriptChannel(
    uuid(),
    script.id,
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
    scriptCh.eventsKvpArray.push({ key: i * 1000, value: sevt });
  }
  script.scriptChannels.push(scriptCh);

  return script;
}

function domeTwoChannelScript(): Script {
  const script = new Script("domeTwoChannelScript", "test", "test", new Date());
  const uartChannel = new UartChannel(
    uuid(),
    domeGenSerialModId,
    "",
    ModuleSubType.genericSerial,
    true,
  );
  const i2cChannel = new I2cChannel(uuid(), domeI2cModId, "", true);

  const scriptCh1 = new ScriptChannel(
    uuid(),
    script.id,
    ScriptChannelType.GENERIC_UART,
    domeGenSerialModId,
    uartChannel.id,
    ModuleChannelTypes.UartChannel,
    uartChannel,
    3000,
  );

  const scriptCh2 = new ScriptChannel(
    uuid(),
    script.id,
    ScriptChannelType.GENERIC_I2C,
    domeI2cModId,
    i2cChannel.id,
    ModuleChannelTypes.I2cChannel,
    i2cChannel,
    3000,
  );

  for (let i = 0; i < 6; i++) {
    if (i % 2 === 0) {
      const evt = new GenericSerialEvent(`UART ${i}`);
      const sevt = new ScriptEvent(
        scriptCh1.id,
        ModuleType.uart,
        ModuleSubType.genericSerial,
        i * 10,
        evt,
      );
      scriptCh1.eventsKvpArray.push({ key: i * 1000, value: sevt });
    } else {
      const evt = new I2cEvent(`I2C ${i}`);
      const sevt = new ScriptEvent(
        scriptCh2.id,
        ModuleType.i2c,
        ModuleSubType.genericI2C,
        i * 10,
        evt,
      );
      scriptCh2.eventsKvpArray.push({ key: i * 1000, value: sevt });
    }
  }
  script.scriptChannels.push(scriptCh1);
  script.scriptChannels.push(scriptCh2);

  return script;
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
//import {
//    ChannelType, KangarooController, KangarooAction, KangarooEvent,
//    Script, ScriptChannel, ScriptEvent, ServoEvent, ChannelSubType, ServoChannel,
//    UartChannel, HumanCyborgRelationsCmd, HumanCyborgRelationsEvent, HcrCommand, HcrCommandCategory,
//    GpioEvent,
//    GpioChannel,
//} from "astros-common";
//
//import { ScriptConverter, CommandType } from '../src/script_converter.js';
//
//
//const generateKangarooEvent = (time: number, ch1Action: KangarooAction, ch1Speed: number, ch1Position: number,
//    ch2Action: KangarooAction, ch2Speed: number, ch2Position: number) => {
//
//    const data = new KangarooEvent(1, ch1Action, ch1Speed, ch1Position, ch2Action, ch2Speed, ch2Position)
//
//    return { key: time, value: new ScriptEvent("", ChannelType.uart, ChannelSubType.kangaroo, time, JSON.stringify(data)) };
//};
//
//const generateServoEvent = (time: number, channel: number, position: number, speed: number, acceleration: number) => {
//
//    const data = new ServoEvent(channel, position, speed, acceleration);
//
//    return { key: time, value: new ScriptEvent("", ChannelType.servo, ChannelSubType.none, time, JSON.stringify(data)) };
//};
//
//const generateHcrEvent = (time: number, channel: number, commands: HcrCommand[]) => {
//
//    const data = new HumanCyborgRelationsEvent(channel, commands);
//
//    return { key: time, value: new ScriptEvent("", ChannelType.uart, ChannelSubType.humanCyborgRelations, time, JSON.stringify(data)) };
//};
//
//const generateGpioEvent = (time: number, channel: number, state: boolean) => {
//
//    const data = new GpioEvent(channel, state);
//
//    return { key: time, value: new ScriptEvent("", ChannelType.gpio, ChannelSubType.none, time, JSON.stringify(data)) };
//};
//
//const _type = 0;
//const _time = 1;
//
//// kangaroo command
//// |___|_________|__________|___|____|____|____;
////  evt time_till serial ch  ch  cmd  spd  pos
//
//const _uartChannel = 2;
//const _kChannel = 3;
//const _kCommand = 4;
//const _kSpd = 5;
//const _kPos = 6;
//
//// hcr command
//// |___|_________|__________|___;
////  evt time_till serial ch  val
//const _val = 3;
//
//// servo command
//// |___|_________|__________|____|____|____;
////  evt time_till servo ch   pos  spd  acc
//const _servoChannel = 2;
//const _servoPosition = 3;
//const _servoSpeed = 4;
//const _servoAcc = 5;
//
//// gpio command
//// |___|_________|__________|____;
////  evt time_till gpio ch   state
//const _gpioChannel = 2;
//const _gpioState = 3;
//
//describe("Script Converter Tests", () => {
//    it("kanagroo test", () => {
//        const script = new Script("1234", "test1",
//            "desc1", new Date());
//
//        const controllerId = 1;
//
//        const kanagrooCh = new UartChannel(1, UartType.kangaroo, "Periscope", new KangarooController({ channelOneName: "ch1 test", channelTwoName: "ch2 test" }));
//
//        const channelOne = new ScriptChannel("ABCD", "ABCD", controllerId, ChannelType.servo, ChannelSubType.none, 0, kanagrooCh, 3000);
//
//        channelOne.eventsKvpArray.push(generateKangarooEvent(0, KangarooAction.start, 0, 0, KangarooAction.start, 0, 0,));
//
//        channelOne.eventsKvpArray.push(generateKangarooEvent(10, KangarooAction.home, 0, 0, KangarooAction.home, 0, 0));
//
//        channelOne.eventsKvpArray.push(generateKangarooEvent(20, KangarooAction.position, 100, 1000, KangarooAction.speed, 200, 0));
//
//        channelOne.eventsKvpArray.push(generateKangarooEvent(30, KangarooAction.none, 0, 0, KangarooAction.position, 300, 500));
//
//        channelOne.eventsKvpArray.push(generateKangarooEvent(40, KangarooAction.speed, 400, 0, KangarooAction.none, 0, 0));
//
//
//        script.scriptChannels = new Array<ScriptChannel>(channelOne);
//
//        const cvtr = new ScriptConverter();
//
//        const result = cvtr.convertScript(script);
//
//        expect(result?.size).toBe(1);
//        expect(result?.get(controllerId)?.length).toBeGreaterThan(0);
//
//        const ctlId = result?.get(controllerId);
//
//        const evts = Array<Array<string>>();
//
//        const segs = ctlId?.slice(0, -1).split(';');
//
//        segs?.forEach(e => {
//            evts.push(e.split('|'));
//        });
//
//        expect(evts.length).toBe(8);
//
//        let evt = 0;
//
//        expect(parseInt(evts[evt][_type])).toBe(CommandType.kangaroo);
//        expect(parseInt(evts[evt][_time])).toBe(0);
//        expect(parseInt(evts[evt][_uartChannel])).toBe(1);
//        expect(parseInt(evts[evt][_kChannel])).toBe(1);
//        expect(parseInt(evts[evt][_kCommand])).toBe(KangarooAction.start);
//        expect(parseInt(evts[evt][_kSpd])).toBe(0);
//        expect(parseInt(evts[evt][_kPos])).toBe(0);
//
//        evt++;
//
//        expect(parseInt(evts[evt][_type])).toBe(CommandType.kangaroo);
//        expect(parseInt(evts[evt][_time])).toBe(1000);
//        expect(parseInt(evts[evt][_uartChannel])).toBe(1);
//        expect(parseInt(evts[evt][_kChannel])).toBe(2);
//        expect(parseInt(evts[evt][_kCommand])).toBe(KangarooAction.start);
//        expect(parseInt(evts[evt][_kSpd])).toBe(0);
//        expect(parseInt(evts[evt][_kPos])).toBe(0);
//
//        evt++;
//
//        expect(parseInt(evts[evt][_type])).toBe(CommandType.kangaroo);
//        expect(parseInt(evts[evt][_time])).toBe(0);
//        expect(parseInt(evts[evt][_uartChannel])).toBe(1);
//        expect(parseInt(evts[evt][_kChannel])).toBe(1);
//        expect(parseInt(evts[evt][_kCommand])).toBe(KangarooAction.home);
//        expect(parseInt(evts[evt][_kSpd])).toBe(0);
//        expect(parseInt(evts[evt][_kPos])).toBe(0);
//
//        evt++;
//
//        expect(parseInt(evts[evt][_type])).toBe(CommandType.kangaroo);
//        expect(parseInt(evts[evt][_time])).toBe(1000);
//        expect(parseInt(evts[evt][_uartChannel])).toBe(1);
//        expect(parseInt(evts[evt][_kChannel])).toBe(2);
//        expect(parseInt(evts[evt][_kCommand])).toBe(KangarooAction.home);
//        expect(parseInt(evts[evt][_kSpd])).toBe(0);
//        expect(parseInt(evts[evt][_kPos])).toBe(0);
//
//        evt++;
//
//        expect(parseInt(evts[evt][_type])).toBe(CommandType.kangaroo);
//        expect(parseInt(evts[evt][_time])).toBe(0);
//        expect(parseInt(evts[evt][_uartChannel])).toBe(1);
//        expect(parseInt(evts[evt][_kChannel])).toBe(1);
//        expect(parseInt(evts[evt][_kCommand])).toBe(KangarooAction.position);
//        expect(parseInt(evts[evt][_kSpd])).toBe(100);
//        expect(parseInt(evts[evt][_kPos])).toBe(1000);
//
//        evt++;
//
//        expect(parseInt(evts[evt][_type])).toBe(CommandType.kangaroo);
//        expect(parseInt(evts[evt][_time])).toBe(1000);
//        expect(parseInt(evts[evt][_uartChannel])).toBe(1);
//        expect(parseInt(evts[evt][_kChannel])).toBe(2);
//        expect(parseInt(evts[evt][_kCommand])).toBe(KangarooAction.speed);
//        expect(parseInt(evts[evt][_kSpd])).toBe(200);
//        expect(parseInt(evts[evt][_kPos])).toBe(0);
//
//        evt++;
//
//        expect(parseInt(evts[evt][_type])).toBe(CommandType.kangaroo);
//        expect(parseInt(evts[evt][_time])).toBe(1000);
//        expect(parseInt(evts[evt][_uartChannel])).toBe(1);
//        expect(parseInt(evts[evt][_kChannel])).toBe(2);
//        expect(parseInt(evts[evt][_kCommand])).toBe(KangarooAction.position);
//        expect(parseInt(evts[evt][_kSpd])).toBe(300);
//        expect(parseInt(evts[evt][_kPos])).toBe(500);
//
//        evt++;
//
//        expect(parseInt(evts[evt][_type])).toBe(CommandType.kangaroo);
//        expect(parseInt(evts[evt][_time])).toBe(0);
//        expect(parseInt(evts[evt][_uartChannel])).toBe(1);
//        expect(parseInt(evts[evt][_kChannel])).toBe(1);
//        expect(parseInt(evts[evt][_kCommand])).toBe(KangarooAction.speed);
//        expect(parseInt(evts[evt][_kSpd])).toBe(400);
//        expect(parseInt(evts[evt][_kPos])).toBe(0);
//
//    });
//    it("human cyborg relations test", () => {
//
//        const script = new Script("1234", "test1",
//            "desc1", new Date());
//
//        const controllerId = 2;
//
//        const hcrChannel = new UartChannel(UartType.humanCyborgRelations, 2, "", {});
//
//        const channelOne = new ScriptChannel("ABCD", "ABCD", controllerId, ChannelType.uart, ChannelSubType.humanCyborgRelations, 0, hcrChannel, 3000);
//
//        const cmds = new Array<HcrCommand>()
//
//
//        cmds.push(
//            new HcrCommand("1", HcrCommandCategory.stimuli, HumanCyborgRelationsCmd.extremeAngry, 0, 0),
//        );
//
//        channelOne.eventsKvpArray.push(generateHcrEvent(5, 2, cmds));
//
//        cmds.splice(0);
//
//        cmds.push(
//            new HcrCommand("1", HcrCommandCategory.volume, HumanCyborgRelationsCmd.vocalizerVolume, 5, 0),
//            new HcrCommand("1", HcrCommandCategory.volume, HumanCyborgRelationsCmd.wavAVolume, 7, 0),
//            new HcrCommand("1", HcrCommandCategory.sdWav, HumanCyborgRelationsCmd.playSdRandomOnA, 100, 200)
//        );
//
//        channelOne.eventsKvpArray.push(generateHcrEvent(10, 2, cmds));
//
//        script.scriptChannels = new Array<ScriptChannel>(channelOne);
//
//        const cvtr = new ScriptConverter();
//
//        const result = cvtr.convertScript(script);
//
//        expect(result?.size).toBe(1);
//        expect(result?.get(controllerId)?.length).toBeGreaterThan(0);
//
//        const ctlId = result?.get(controllerId);
//
//        const evts = Array<Array<string>>();
//
//        const segs = ctlId?.slice(0, -1).split(';');
//
//        segs?.forEach(e => {
//            evts.push(e.split('|'));
//        });
//
//        expect(evts.length).toBe(2);
//
//        let evt = 0;
//
//        expect(parseInt(evts[evt][_type])).toBe(CommandType.genericSerial);
//        expect(parseInt(evts[evt][_time])).toBe(500);
//        expect(parseInt(evts[evt][_uartChannel])).toBe(2);
//        expect(evts[evt][_val]).toBe("<SM1>");
//
//        evt++;
//
//        expect(parseInt(evts[evt][_type])).toBe(CommandType.genericSerial);
//        expect(parseInt(evts[evt][_time])).toBe(0);
//        expect(parseInt(evts[evt][_uartChannel])).toBe(2);
//        expect(evts[evt][_val]).toBe("<PVV5,PVA7,CA100C200>");
//
//    });
//    it("multi channel test", () => {
//
//        const script = new Script("1234", "test1",
//            "desc1", new Date());
//
//        const controllerId = 3;
//
//        const servoCh0 = new ServoChannel(0, "ch0", true, 500, 2500, 500, false);
//        const servoCh10 = new ServoChannel(10, "ch10", true, 500, 2500, 500, false);
//        const servoCh20 = new ServoChannel(20, "ch20", true, 500, 2500, 500, false);
//
//        const channelOne = new ScriptChannel("one", "ABCD", controllerId, ChannelType.servo, ChannelSubType.none, 0, servoCh0, 3000);
//        const channelTen = new ScriptChannel("two", "ABCD", controllerId, ChannelType.servo, ChannelSubType.none, 0, servoCh10, 3000);
//        const channelTwenty = new ScriptChannel("three", "ABCD", controllerId, ChannelType.servo, ChannelSubType.none, 0, servoCh20, 3000);
//
//
//        // move to 50, speed 1, at same time, then delay 1 second
//        channelOne.eventsKvpArray.push(generateServoEvent(0, 0, 50, 1, 0));
//        channelTen.eventsKvpArray.push(generateServoEvent(0, 10, 50, 1, 0));
//        channelTwenty.eventsKvpArray.push(generateServoEvent(0, 20, 50, 1, 0));
//
//        // move to 100, speed 3, with a 1 second delay
//        channelOne.eventsKvpArray.push(generateServoEvent(10, 0, 100, 3, 1));
//        channelTen.eventsKvpArray.push(generateServoEvent(20, 10, 100, 3, 1));
//        channelTwenty.eventsKvpArray.push(generateServoEvent(30, 20, 100, 3, 1));
//
//        // move to 0 speed 5, at the same time
//        channelOne.eventsKvpArray.push(generateServoEvent(40, 0, 0, 5, 255));
//        channelTen.eventsKvpArray.push(generateServoEvent(40, 10, 0, 5, 255));
//        channelTwenty.eventsKvpArray.push(generateServoEvent(40, 20, 0, 5, 255));
//
//        script.scriptChannels = new Array<ScriptChannel>(channelOne, channelTen, channelTwenty);
//
//        const cvtr = new ScriptConverter();
//
//        const result = cvtr.convertScript(script);
//
//        expect(result?.size).toBe(1);
//        expect(result?.get(controllerId)?.length).toBeGreaterThan(0);
//
//        const ctlVal = result?.get(controllerId);
//
//        const evts = Array<Array<string>>();
//
//        const segs = ctlVal?.slice(0, -1).split(';');
//
//        segs?.forEach(e => {
//            evts.push(e.split('|'));
//        });
//
//
//        const channels = new Array<string>('0', '10', '20');
//
//        //expect(coreVal).toBe('1|0|0|50|1;1|0|10|50|1;1|1000|20|50|1;1|1000|0|100|3;1|1000|10|100|3;1|1000|20|100|3;1|0|0|0|5;1|0|10|0|5;1|0|20|0|5;');
//
//        expect(evts.length).toBe(9);
//
//        let evt = 0;
//
//        expect(parseInt(evts[evt][_type])).toBe(CommandType.servo);
//        expect(parseInt(evts[evt][_time])).toBe(0);
//        expect(channels.findIndex(x => x === evts[evt][_servoChannel])).toBeGreaterThan(-1);
//        expect(parseInt(evts[evt][_servoPosition])).toBe(50);
//        expect(parseInt(evts[evt][_servoSpeed])).toBe(1);
//        expect(parseInt(evts[evt][_servoAcc])).toBe(0);
//
//        evt++;
//
//        expect(parseInt(evts[evt][_type])).toBe(CommandType.servo);
//        expect(parseInt(evts[evt][_time])).toBe(0);
//        expect(channels.findIndex(x => x === evts[evt][_servoChannel])).toBeGreaterThan(-1);
//        expect(parseInt(evts[evt][_servoPosition])).toBe(50);
//        expect(parseInt(evts[evt][_servoSpeed])).toBe(1);
//        expect(parseInt(evts[evt][_servoAcc])).toBe(0)
//
//        evt++;
//
//        expect(parseInt(evts[evt][_type])).toBe(CommandType.servo);
//        expect(parseInt(evts[evt][_time])).toBe(1000);
//        expect(channels.findIndex(x => x === evts[evt][_servoChannel])).toBeGreaterThan(-1);
//        expect(parseInt(evts[evt][_servoPosition])).toBe(50);
//        expect(parseInt(evts[evt][_servoSpeed])).toBe(1);
//        expect(parseInt(evts[evt][_servoAcc])).toBe(0)
//
//        evt++;
//
//        expect(parseInt(evts[evt][_type])).toBe(CommandType.servo);
//        expect(parseInt(evts[evt][_time])).toBe(1000);
//        expect(parseInt(evts[evt][_servoChannel])).toBe(0);
//        expect(parseInt(evts[evt][_servoPosition])).toBe(100);
//        expect(parseInt(evts[evt][_servoSpeed])).toBe(3);
//        expect(parseInt(evts[evt][_servoAcc])).toBe(1);
//        evt++;
//
//        expect(parseInt(evts[evt][_type])).toBe(CommandType.servo);
//        expect(parseInt(evts[evt][_time])).toBe(1000);
//        expect(parseInt(evts[evt][_servoChannel])).toBe(10);
//        expect(parseInt(evts[evt][_servoPosition])).toBe(100);
//        expect(parseInt(evts[evt][_servoSpeed])).toBe(3);
//        expect(parseInt(evts[evt][_servoAcc])).toBe(1);
//
//        evt++;
//
//        expect(parseInt(evts[evt][_type])).toBe(CommandType.servo);
//        expect(parseInt(evts[evt][_time])).toBe(1000);
//        expect(parseInt(evts[evt][_servoChannel])).toBe(20);
//        expect(parseInt(evts[evt][_servoPosition])).toBe(100);
//        expect(parseInt(evts[evt][_servoSpeed])).toBe(3);
//        expect(parseInt(evts[evt][_servoAcc])).toBe(1);
//
//        evt++;
//
//        expect(parseInt(evts[evt][_type])).toBe(CommandType.servo);
//        expect(parseInt(evts[evt][_time])).toBe(0);
//        expect(channels.findIndex(x => x === evts[evt][_servoChannel])).toBeGreaterThan(-1);
//        expect(parseInt(evts[evt][_servoPosition])).toBe(0);
//        expect(parseInt(evts[evt][_servoSpeed])).toBe(5);
//        expect(parseInt(evts[evt][_servoAcc])).toBe(255);
//
//        evt++;
//
//        expect(parseInt(evts[evt][_type])).toBe(CommandType.servo);
//        expect(parseInt(evts[evt][_time])).toBe(0);
//        expect(channels.findIndex(x => x === evts[evt][_servoChannel])).toBeGreaterThan(-1);
//        expect(parseInt(evts[evt][_servoPosition])).toBe(0);
//        expect(parseInt(evts[evt][_servoSpeed])).toBe(5);
//        expect(parseInt(evts[evt][_servoAcc])).toBe(255);
//
//        evt++;
//
//        expect(parseInt(evts[evt][_type])).toBe(CommandType.servo);
//        expect(parseInt(evts[evt][_time])).toBe(0);
//        expect(channels.findIndex(x => x === evts[evt][_servoChannel])).toBeGreaterThan(-1);
//        expect(parseInt(evts[evt][_servoPosition])).toBe(0);
//        expect(parseInt(evts[evt][_servoSpeed])).toBe(5);
//        expect(parseInt(evts[evt][_servoAcc])).toBe(255);
//    });
//
//    it("gpio test", () => {
//        const script = new Script("1234", "test1",
//            "desc1", new Date());
//
//        const controllerId = 3;
//
//        const gpioCh = new GpioChannel(5, "gpio5", false, true);
//
//        const channelOne = new ScriptChannel("one", "ABCD", controllerId, ChannelType.gpio, ChannelSubType.none, 0, gpioCh, 3000);
//
//
//        channelOne.eventsKvpArray.push(generateGpioEvent(0, 5, true));
//
//        channelOne.eventsKvpArray.push(generateGpioEvent(10, 5, false));
//
//        script.scriptChannels = new Array<ScriptChannel>(channelOne);
//
//        const cvtr = new ScriptConverter();
//
//        const result = cvtr.convertScript(script);
//
//        expect(result?.size).toBe(1);
//        expect(result?.get(controllerId)?.length).toBeGreaterThan(0);
//
//        const ctlVal = result?.get(controllerId);
//
//        const evts = Array<Array<string>>();
//
//        const segs = ctlVal?.slice(0, -1).split(';');
//
//        segs?.forEach(e => {
//            evts.push(e.split('|'));
//        });
//
//        expect(evts.length).toBe(2);
//
//        let evt = 0;
//
//        expect(parseInt(evts[evt][_type])).toBe(CommandType.gpio);
//        expect(parseInt(evts[evt][_time])).toBe(1000);
//        expect(parseInt(evts[evt][_gpioChannel])).toBe(5);
//        expect(parseInt(evts[evt][_gpioState])).toBe(1);
//
//        evt++;
//
//        expect(parseInt(evts[evt][_type])).toBe(CommandType.gpio);
//        expect(parseInt(evts[evt][_time])).toBe(0);
//        expect(parseInt(evts[evt][_gpioChannel])).toBe(5);
//        expect(parseInt(evts[evt][_gpioState])).toBe(0);
//
//    });
//});
