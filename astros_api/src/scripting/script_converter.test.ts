import { describe, expect, it, beforeEach, afterEach, vi, MockInstance } from 'vitest';
import { mock, mockReset } from 'vitest-mock-extended';
import { ScriptConverter, ISingleCommand, CommandType } from './script_converter.js';
import { ScriptRepository } from '../dal/repositories/script_repository.js';
import { logger } from '../logger.js';
import {
  GenericSerialEvent,
  GpioChannel,
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
  MaestroChannel,
  MaestroEvent,
  ModuleChannelTypes,
  ModuleClassType,
  ModuleSubType,
  ModuleType,
  RandomGpioEvent,
  RandomMaestroEvent,
  Script,
  ScriptChannel,
  ScriptChannelType,
  ScriptEvent,
  ScriptEventTypes,
  UartChannel,
  UartModule,
} from '../models/index.js';
import { v4 as uuid } from 'uuid';

const coreLocId = '07e5047a-32b3-4c6a-95c1-a97bebe1b0bd';
const domeLocId = 'e7c35d30-c371-49ac-8553-ec31d7d2f264';
const bodyLocId = '361c5f59-e5ec-4d34-8eae-af4578eebd98';

const coreGenSerialModId = '1f76c970-2d4a-486e-8b8d-af5e13dac8dd';
const coreKangarooModId = 'c6e4e295-1b62-43cf-b430-e2ff0fc91740';
const coreHCRModId = 'ef9ffa30-7486-4aac-80d2-a3096163665b';
const coreMaestroModId = '29521c55-2603-4a70-bb1f-a47a8c938417';
const coreI2cModId = 'f903d2fd-eb59-48de-aeac-55b72d06d1a3';
const coreGpioChannelId = 'a4f5c8e2-3d6b-4f4e-9f1e-2b8f4e5c6d7a';
const coreGpioChannelNumber = 5;

const domeGenSerialModId = '4af17fad-7cca-4d25-a140-667e4ade4ccd';
const domeKangarooModId = 'c4bd126f-7947-4e1c-b501-6788d11c8d65';
const domeHCRModId = '478bab9f-260e-45be-9616-83b3e16764d1';
const domeMaestroModId = 'c195f295-0020-459a-9cde-d2f2a2fd4fd6';
const domeI2cModId = '7a518233-0094-4189-a7a8-65b684ee540e';

const bodyGenSerialModId = 'b7e7cb15-8ece-46f9-a37f-5e6643d2c7dd';
const bodyKangarooModId = '6441276f-5cf8-48fc-9d25-6aafde236a7e';
const bodyHCRModId = '2695ea93-e9ca-4b2e-ab26-7bb9acf300c0';
const bodyMaestroModId = '9650ae5b-5e8a-4f9a-9d9f-57ed1a644b1d';
const bodyI2cModId = 'f2261640-a8ed-4f89-bc07-1c74d4a4296e';

// region Script Conversion
describe('Script Converter Tests', () => {
  const mockRepo = mock<ScriptRepository>();

  beforeEach(() => {
    mockReset(mockRepo);
    mockRepo.getModules.calledWith().mockResolvedValue(getModules());
    mockRepo.getLocationIds.calledWith().mockResolvedValue([coreLocId, domeLocId, bodyLocId]);
  });

  it('basic serial script', async () => {
    const scriptId = 'coreGenericSerial';

    mockRepo.getScript.calledWith(scriptId).mockResolvedValue(generateScript(scriptId));

    const converter = new ScriptConverter(mockRepo);

    const script = await converter.convertScript(scriptId);

    expect(script).toBeDefined();

    const coreScript = script?.get(coreLocId);
    const domeScript = script?.get(domeLocId);
    const bodyScript = script?.get(bodyLocId);

    expect(coreScript).toBeDefined();

    const coreSegs = coreScript?.split(';');

    expect(coreSegs?.length).toBe(3);
    expect(coreSegs?.[0]).toBe('3|1000|1|9600|test 0');
    expect(coreSegs?.[1]).toBe('3|1000|1|9600|test 1');
    expect(coreSegs?.[2]).toBe('3|0|1|9600|test 2');

    // buffer events on dome and body
    expect(domeScript).toBeDefined();
    expect(bodyScript).toBeDefined();

    expect(domeScript).toBe('0|2000|0;0|0|0');
    expect(bodyScript).toBe('0|2000|0;0|0|0');
  });

  it('two channels on one location', async () => {
    const scriptId = 'domeTwoChannelScript';

    mockRepo.getScript.calledWith(scriptId).mockResolvedValue(generateScript(scriptId));

    const converter = new ScriptConverter(mockRepo);

    const script = await converter.convertScript(scriptId);

    expect(script).toBeDefined();

    const coreScript = script?.get(coreLocId);
    const domeScript = script?.get(domeLocId);
    const bodyScript = script?.get(bodyLocId);

    expect(domeScript).toBeDefined();

    const domeSegs = domeScript?.split(';');

    expect(domeSegs?.length).toBe(6);
    expect(domeSegs?.[0]).toBe('3|1000|2|9602|UART 0');
    expect(domeSegs?.[1]).toBe('2|1000|37|I2C 1');
    expect(domeSegs?.[2]).toBe('3|1000|2|9602|UART 2');
    expect(domeSegs?.[3]).toBe('2|1000|37|I2C 3');
    expect(domeSegs?.[4]).toBe('3|1000|2|9602|UART 4');
    expect(domeSegs?.[5]).toBe('2|0|37|I2C 5');

    // buffer events on core and body
    expect(coreScript).toBeDefined();
    expect(bodyScript).toBeDefined();

    expect(coreScript).toBe('0|5000|0;0|0|0');
    expect(bodyScript).toBe('0|5000|0;0|0|0');
  });

  it('dome and core scipt', async () => {
    const scriptId = 'domeAndCoreScript';

    mockRepo.getScript.calledWith(scriptId).mockResolvedValue(generateScript(scriptId));

    const converter = new ScriptConverter(mockRepo);

    const script = await converter.convertScript(scriptId);

    expect(script).toBeDefined();

    const coreScript = script?.get(coreLocId);
    const domeScript = script?.get(domeLocId);
    const bodyScript = script?.get(bodyLocId);

    expect(domeScript).toBeDefined();

    const domeSegs = domeScript?.split(';');

    expect(domeSegs?.length).toBe(6);
    expect(domeSegs?.[0]).toBe('3|1000|2|9602|UART 0');
    expect(domeSegs?.[1]).toBe('2|1000|37|I2C 1');
    expect(domeSegs?.[2]).toBe('3|1000|2|9602|UART 2');
    expect(domeSegs?.[3]).toBe('2|1000|37|I2C 3');
    expect(domeSegs?.[4]).toBe('3|1000|2|9602|UART 4');
    expect(domeSegs?.[5]).toBe('2|0|37|I2C 5');

    expect(coreScript).toBeDefined();

    const coreSegs = coreScript?.split(';');

    expect(coreSegs?.length).toBe(4);
    expect(coreSegs?.[0]).toBe('3|1000|1|9600|test 0');
    expect(coreSegs?.[1]).toBe('3|1000|1|9600|test 1');
    expect(coreSegs?.[2]).toBe('3|3000|1|9600|test 2');
    expect(coreSegs?.[3]).toBe('0|0|0');

    // buffer events on body
    expect(bodyScript).toBeDefined();

    expect(bodyScript).toBe('0|5000|0;0|0|0');
  });

  it('test script times', async () => {
    const scriptId = 'testScriptTimes';

    // events should be ordered by time, not by order in channel
    const evt1Time = 0.5; // 0.5 seconds
    const evt2Time = 1.2; // 1.2 seconds
    const evt3Time = 2.4; // 2.4 seconds
    const evt4Time = 36.2; // 36.2 seconds

    const ttevt1ms = 500; // 0.5 seconds till event 1
    const ttevt2ms = 700; // 0.7 seconds between event 1 and event 2
    const ttevt3ms = 1200; // 1.2 seconds between event 2 and event 3
    const ttevt4ms = 33800; // 34.2 seconds between event 3 and event 4

    const script: Script = {
      id: scriptId,
      scriptName: 'test',
      description: 'test',
      lastSaved: new Date(),
      durationDS: 0,
      playlistCount: 0,
      deploymentStatus: {},
      scriptChannels: [],
    };
    const scriptCh = generateSerialScriptChannel(scriptId);
    const sevt1 = generateCoreScriptSerialEventByDecSec(evt1Time, scriptCh.id);
    const sevt2 = generateCoreScriptSerialEventByDecSec(evt2Time, scriptCh.id);
    const sevt3 = generateCoreScriptSerialEventByDecSec(evt3Time, scriptCh.id);
    const sevt4 = generateCoreScriptSerialEventByDecSec(evt4Time, scriptCh.id);

    scriptCh.events[uuid()] = sevt1;
    scriptCh.events[uuid()] = sevt3;
    scriptCh.events[uuid()] = sevt4;
    scriptCh.events[uuid()] = sevt2;

    script.scriptChannels.push(scriptCh);
    mockRepo.getScript.calledWith(scriptId).mockResolvedValue(script);

    const converter = new ScriptConverter(mockRepo);
    const result = await converter.convertScript(scriptId);

    expect(result).toBeDefined();

    const coreScript = result?.get(coreLocId);
    expect(coreScript).toBeDefined();

    const coreSegs = coreScript?.split(';');
    expect(coreSegs?.length).toBe(5);
    expect(coreSegs?.[0]).toBe(`0|${ttevt1ms}|0`);
    expect(coreSegs?.[1]).toBe(`3|${ttevt2ms}|1|9600|test ${evt1Time}`);
    expect(coreSegs?.[2]).toBe(`3|${ttevt3ms}|1|9600|test ${evt2Time}`);
    expect(coreSegs?.[3]).toBe(`3|${ttevt4ms}|1|9600|test ${evt3Time}`);
    expect(coreSegs?.[4]).toBe(`3|0|1|9600|test ${evt4Time}`);
  });

  it('empty script with no channels should return buffer-only scripts for all locations', async () => {
    const scriptId = 'emptyScript';

    const script: Script = {
      id: scriptId,
      scriptName: 'empty',
      description: 'empty',
      lastSaved: new Date(),
      durationDS: 0,
      playlistCount: 0,
      deploymentStatus: {},
      scriptChannels: [],
    };
    // No channels added
    mockRepo.getScript.calledWith(scriptId).mockResolvedValue(script);

    const converter = new ScriptConverter(mockRepo);
    const result = await converter.convertScript(scriptId);

    expect(result).toBeDefined();
    expect(result.size).toBe(3); // all 3 locations

    // Each location gets a no-op buffer terminator
    for (const [, value] of result) {
      expect(value).toBe('0|0|0');
    }
  });
});

//#endregion
//#region GPIO and random spans

describe('GPIO and random span conversion', () => {
  const mockRepo = mock<ScriptRepository>();
  let warnSpy: MockInstance<typeof logger.warn>;

  beforeEach(() => {
    mockReset(mockRepo);
    mockRepo.getModules.calledWith().mockResolvedValue(getModules());
    mockRepo.getLocationIds.calledWith().mockResolvedValue([coreLocId, domeLocId, bodyLocId]);
    // Keyed by the GPIO channel's own id, as ScriptRepository.getGpioChannelMap keys it.
    mockRepo.getGpioChannelMap
      .calledWith()
      .mockResolvedValue(new Map([[coreGpioChannelId, coreGpioChannelNumber]]));
    warnSpy = vi.spyOn(logger, 'warn');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function convert(...channels: ScriptChannel[]): Promise<Map<string, string>> {
    const scriptId = uuid();
    for (const ch of channels) {
      ch.scriptId = scriptId;
    }
    mockRepo.getScript.calledWith(scriptId).mockResolvedValue(scriptWith(scriptId, channels));
    return new ScriptConverter(mockRepo).convertScript(scriptId);
  }

  it("a gpio point event converts by its channel's moduleChannelId", async () => {
    const gpioCh = coreGpioScriptCh();
    expect(gpioCh.id).not.toBe(gpioCh.moduleChannelId);
    addEvent(gpioCh, 2, null, { setHigh: true } as GpioEvent);

    const result = await convert(gpioCh);

    expect(result.get(coreLocId)).toBe('0|2000|0;5|0|5|1');
    expect(result.get(domeLocId)).toBe('0|2000|0;0|0|0');
    expect(result.get(bodyLocId)).toBe('0|2000|0;0|0|0');
  });

  it('an event without an endTime key converts as a point', async () => {
    const gpioCh = coreGpioScriptCh();
    const evt: Partial<ScriptEvent> = addEvent(gpioCh, 2, null, { setHigh: true } as GpioEvent);
    delete evt.endTime;

    const result = await convert(gpioCh);

    expect(result.get(coreLocId)).toBe('0|2000|0;5|0|5|1');
  });

  it('gpio random span', async () => {
    const gpioCh = coreGpioScriptCh();
    addEvent(gpioCh, 2, 16, { minGapMs: 50, maxGapMs: 400 } as RandomGpioEvent);

    const result = await convert(gpioCh);

    expect(result.get(coreLocId)).toBe('0|2000|0;7|14000|5|14000|50|400;0|0|0');
    expect(result.get(domeLocId)).toBe('0|16000|0;0|0|0');
    expect(result.get(bodyLocId)).toBe('0|16000|0;0|0|0');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('maestro random span', async () => {
    const maestroCh = coreMaestroScriptCh(true);
    addEvent(maestroCh, 0, 14, {
      channel: 4,
      isServo: true,
      minGapMs: 400,
      maxGapMs: 2000,
      minPos: 20,
      maxPos: 100,
      minMove: 15,
      maxMove: 60,
      speed: 0,
      acceleration: 0,
    } as RandomMaestroEvent);

    const result = await convert(maestroCh);

    expect(result.get(coreLocId)).toBe('6|14000|3|4|14000|400|2000|20|100|15|60|0|0;0|0|0');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('maestro random span sends speed and acceleration', async () => {
    const maestroCh = coreMaestroScriptCh(true);
    addEvent(maestroCh, 0, 14, servoSpan({ speed: 30, acceleration: 7 }));

    const result = await convert(maestroCh);

    expect(result.get(coreLocId)).toBe('6|14000|3|4|14000|400|2000|20|100|15|60|30|7;0|0|0');
  });

  it('null maxMove is sent as 0', async () => {
    const maestroCh = coreMaestroScriptCh(true);
    addEvent(maestroCh, 0, 14, servoSpan({ maxMove: null }));

    const result = await convert(maestroCh);

    expect(result.get(coreLocId)).toBe('6|14000|3|4|14000|400|2000|20|100|15|0|0|0;0|0|0');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('a 2.01 s gap is sent as 2010', async () => {
    const gpioCh = coreGpioScriptCh();
    const minGapMs = 2.01 * 1000;
    expect(minGapMs).toBe(2009.9999999999998);
    addEvent(gpioCh, 0, 10, { minGapMs, maxGapMs: 3000 } as RandomGpioEvent);

    const core = (await convert(gpioCh)).get(coreLocId);

    expect(core).toContain('7|10000|5|10000|2010|3000');
    expect(core).not.toContain('.');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('a gpio max gap is rounded too', async () => {
    const gpioCh = coreGpioScriptCh();
    const maxGapMs = 2.03 * 1000;
    expect(maxGapMs).toBe(2029.9999999999998);
    addEvent(gpioCh, 0, 10, { minGapMs: 50, maxGapMs } as RandomGpioEvent);

    const result = await convert(gpioCh);

    expect(result.get(coreLocId)).toBe('7|10000|5|10000|50|2030;0|0|0');
  });

  it('maestro gaps are rounded too', async () => {
    const maestroCh = coreMaestroScriptCh(true);
    addEvent(maestroCh, 0, 14, servoSpan({ minGapMs: 2.01 * 1000, maxGapMs: 2.03 * 1000 }));

    const result = await convert(maestroCh);

    expect(result.get(coreLocId)).toBe('6|14000|3|4|14000|2010|2030|20|100|15|60|0|0;0|0|0');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('a 16.1 → 16.2 s span with a 100 ms min gap is valid', async () => {
    const gpioCh = coreGpioScriptCh();
    expect(16.2 * 1000 - 16.1 * 1000).toBe(99.99999999999818);
    addEvent(gpioCh, 16.1, 16.2, { minGapMs: 100, maxGapMs: 100 } as RandomGpioEvent);

    const result = await convert(gpioCh);

    expect(result.get(coreLocId)).toBe('0|16100|0;7|100|5|100|100|100;0|0|0');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('digital maestro span zeroes the servo fields', async () => {
    const maestroCh = coreMaestroScriptCh(false);
    addEvent(maestroCh, 0, 14, servoSpan({ isServo: false, speed: 30, acceleration: 7 }));

    const result = await convert(maestroCh);

    expect(result.get(coreLocId)).toBe('6|14000|3|4|14000|400|2000|0|0|0|0|0|0;0|0|0');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("a span's end extends every location's end buffer", async () => {
    const domeCh = domeSerialScriptCh();
    addEvent(domeCh, 5, null, { value: 'dome 5' } as GenericSerialEvent);
    const gpioCh = coreGpioScriptCh();
    addEvent(gpioCh, 0, 20, { minGapMs: 50, maxGapMs: 400 } as RandomGpioEvent);

    const result = await convert(domeCh, gpioCh);

    expect(result.get(domeLocId)).toBe('0|5000|0;3|15000|2|9602|dome 5;0|0|0');
    expect(result.get(coreLocId)).toBe('7|20000|5|20000|50|400;0|0|0');
    expect(result.get(bodyLocId)).toBe('0|20000|0;0|0|0');
  });

  // A core Maestro span at 4.0 → 9.0 s that breaks minMove ≤ range / 2 (45 on
  // 20–100), between GPIO points at 1.0 and 6.0 s on a second core channel.
  function invalidSpanBetweenGpioPoints() {
    const maestroCh = coreMaestroScriptCh(true);
    const span = addEvent(maestroCh, 4, 9, servoSpan({ minMove: 45 }));
    const gpioCh = coreGpioScriptCh();
    addEvent(gpioCh, 1, null, { setHigh: true } as GpioEvent);
    addEvent(gpioCh, 6, null, { setHigh: false } as GpioEvent);
    return { channels: [maestroCh, gpioCh], span };
  }

  it('an invalid span becomes a buffer that keeps the delay chain', async () => {
    const { channels, span } = invalidSpanBetweenGpioPoints();

    const result = await convert(...channels);

    expect(result.get(coreLocId)).toBe('0|1000|0;5|3000|5|1;0|2000|0;5|3000|5|0;0|0|0');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(span.id));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('minMove 45'));
  });

  it('an invalid span still extends the script to its end time', async () => {
    const { channels } = invalidSpanBetweenGpioPoints();

    const result = await convert(...channels);

    expect(result.get(domeLocId)).toBe('0|9000|0;0|0|0');
    expect(result.get(bodyLocId)).toBe('0|9000|0;0|0|0');
  });

  it('a span whose gpio channel mapping is missing is skipped, not thrown', async () => {
    mockRepo.getGpioChannelMap.calledWith().mockResolvedValue(new Map());
    const gpioCh = coreGpioScriptCh();
    const span = addEvent(gpioCh, 2, 16, { minGapMs: 50, maxGapMs: 400 } as RandomGpioEvent);
    const domeCh = domeSerialScriptCh();
    addEvent(domeCh, 5, null, { value: 'dome 5' } as GenericSerialEvent);

    const result = await convert(gpioCh, domeCh);

    expect(result.get(coreLocId)).toBe('0|2000|0;0|14000|0;0|0|0');
    expect(result.get(domeLocId)).toBe('0|5000|0;3|11000|2|9602|dome 5;0|0|0');
    expect(result.get(bodyLocId)).toBe('0|16000|0;0|0|0');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(span.id));
  });

  it('a span whose gpio channel number is negative is skipped', async () => {
    mockRepo.getGpioChannelMap.calledWith().mockResolvedValue(new Map([[coreGpioChannelId, -1]]));
    const gpioCh = coreGpioScriptCh();
    const span = addEvent(gpioCh, 2, 16, { minGapMs: 50, maxGapMs: 400 } as RandomGpioEvent);

    const result = await convert(gpioCh);

    expect(result.get(coreLocId)).toBe('0|2000|0;0|14000|0;0|0|0');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(span.id));
  });

  it('a maestro span whose uart idx is negative is skipped', async () => {
    const modules = getModules();
    (modules.get(coreMaestroModId) as UartModule).idx = -1;
    mockRepo.getModules.calledWith().mockResolvedValue(modules);
    const maestroCh = coreMaestroScriptCh(true);
    const span = addEvent(maestroCh, 0, 14, servoSpan());

    const result = await convert(maestroCh);

    expect(result.get(coreLocId)).toBe('0|14000|0;0|0|0');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(span.id));
  });

  it('a maestro span with no uart module is skipped, not thrown', async () => {
    // Parented to the core I2C module, so the UART lookup finds nothing.
    const maestroCh = { ...coreMaestroScriptCh(true), parentModuleId: coreI2cModId };
    const span = addEvent(maestroCh, 0, 14, servoSpan());

    const result = await convert(maestroCh);

    expect(result.get(coreLocId)).toBe('0|14000|0;0|0|0');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(span.id));
  });

  it('a maestro span whose channel has no servo/digital setting is skipped', async () => {
    const maestroCh = {
      ...coreMaestroScriptCh(true),
      moduleChannel: new UartChannel(uuid(), coreMaestroModId, '', ModuleSubType.maestro, true),
    };
    const span = addEvent(maestroCh, 0, 14, servoSpan());

    const result = await convert(maestroCh);

    expect(result.get(coreLocId)).toBe('0|14000|0;0|0|0');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(span.id));
  });

  it('a span whose payload is not an object is skipped, not thrown', async () => {
    const gpioCh = coreGpioScriptCh();
    const nullSpan = addEvent(gpioCh, 2, 4, null as unknown as RandomGpioEvent);
    const maestroCh = coreMaestroScriptCh(true);
    const stringSpan = addEvent(maestroCh, 6, 8, 'junk' as unknown as RandomMaestroEvent);
    const domeCh = domeSerialScriptCh();
    addEvent(domeCh, 5, null, { value: 'dome 5' } as GenericSerialEvent);

    const result = await convert(gpioCh, maestroCh, domeCh);

    expect(result.get(coreLocId)).toBe('0|2000|0;0|4000|0;0|2000|0;0|0|0');
    expect(result.get(domeLocId)).toBe('0|5000|0;3|3000|2|9602|dome 5;0|0|0');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(nullSpan.id));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(stringSpan.id));
  });

  it('a span whose end is before its start ends the script at its start', async () => {
    const gpioCh = coreGpioScriptCh();
    addEvent(gpioCh, 10, 5, { minGapMs: 50, maxGapMs: 400 } as RandomGpioEvent);

    const result = await convert(gpioCh);

    expect(result.get(coreLocId)).toBe('0|10000|0;0|0|0');
    expect(result.get(domeLocId)).toBe('0|10000|0;0|0|0');
  });

  it.each([NaN, Infinity])('a span ending at %s does not move the end buffers', async (end) => {
    const gpioCh = coreGpioScriptCh();
    addEvent(gpioCh, 2, end, { minGapMs: 50, maxGapMs: 400 } as RandomGpioEvent);
    const domeCh = domeSerialScriptCh();
    addEvent(domeCh, 5, null, { value: 'dome 5' } as GenericSerialEvent);

    const result = await convert(gpioCh, domeCh);

    expect(result.get(coreLocId)).toBe('0|2000|0;0|3000|0;0|0|0');
    expect(result.get(domeLocId)).toBe('0|5000|0;3|0|2|9602|dome 5');
    expect(result.get(bodyLocId)).toBe('0|5000|0;0|0|0');
  });

  it('a span whose gpio channel number is not an integer is skipped', async () => {
    mockRepo.getGpioChannelMap.calledWith().mockResolvedValue(new Map([[coreGpioChannelId, 2.5]]));
    const gpioCh = coreGpioScriptCh();
    const span = addEvent(gpioCh, 2, 16, { minGapMs: 50, maxGapMs: 400 } as RandomGpioEvent);

    const result = await convert(gpioCh);

    expect(result.get(coreLocId)).toBe('0|2000|0;0|14000|0;0|0|0');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(span.id));
  });

  it('a maestro span whose uart idx is not an integer is skipped', async () => {
    const modules = getModules();
    (modules.get(coreMaestroModId) as UartModule).idx = 1.5;
    mockRepo.getModules.calledWith().mockResolvedValue(modules);
    const maestroCh = coreMaestroScriptCh(true);
    const span = addEvent(maestroCh, 0, 14, servoSpan());

    const result = await convert(maestroCh);

    expect(result.get(coreLocId)).toBe('0|14000|0;0|0|0');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(span.id));
  });

  it("a maestro span sends its payload's channel, not the module channel's number", async () => {
    // saveScriptChannel copies the module channel's number into the payload;
    // the converter sends the payload's copy, as the point path does.
    const maestroCh = coreMaestroScriptCh(true, 7);
    addEvent(maestroCh, 0, 14, servoSpan({ channel: 4 }));

    const result = await convert(maestroCh);

    expect(result.get(coreLocId)).toBe('6|14000|3|4|14000|400|2000|20|100|15|60|0|0;0|0|0');
  });

  it('a span on a sub-type without a span payload is skipped', async () => {
    const domeCh = domeSerialScriptCh();
    const span = addEvent(domeCh, 1, 3, { value: 'not a span' } as GenericSerialEvent);

    const result = await convert(domeCh);

    expect(result.get(domeLocId)).toBe('0|1000|0;0|2000|0;0|0|0');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(span.id));
  });

  it("a maestro span follows the channel's servo/digital setting, not the payload's", async () => {
    const maestroCh = coreMaestroScriptCh(false);
    addEvent(maestroCh, 0, 14, servoSpan({ isServo: true, speed: 30, acceleration: 7 }));

    const result = await convert(maestroCh);

    expect(result.get(coreLocId)).toBe('6|14000|3|4|14000|400|2000|0|0|0|0|0|0;0|0|0');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('a digital payload on a servo channel is validated as servo', async () => {
    const maestroCh = coreMaestroScriptCh(true);
    const span = addEvent(maestroCh, 0, 14, {
      channel: 4,
      isServo: false,
      minGapMs: 400,
      maxGapMs: 2000,
    } as RandomMaestroEvent);

    const result = await convert(maestroCh);

    expect(result.get(coreLocId)).toBe('0|14000|0;0|0|0');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(span.id));
  });

  it('a maestro span with no channel in its payload is skipped', async () => {
    const maestroCh = coreMaestroScriptCh(true);
    const payload: Partial<RandomMaestroEvent> = servoSpan();
    delete payload.channel;
    const span = addEvent(maestroCh, 0, 14, payload as RandomMaestroEvent);

    const result = await convert(maestroCh);

    expect(result.get(coreLocId)).toBe('0|14000|0;0|0|0');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(span.id));
  });

  it('a maestro point without a numeric position is skipped', async () => {
    const maestroCh = coreMaestroScriptCh(true);
    const point = addEvent(maestroCh, 1, null, servoSpan());
    const gpioCh = coreGpioScriptCh();
    addEvent(gpioCh, 3, null, { setHigh: true } as GpioEvent);

    const result = await convert(maestroCh, gpioCh);

    expect(result.get(coreLocId)).toBe('0|1000|0;0|2000|0;5|0|5|1');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(point.id));
  });

  it('a maestro span whose channel is still -1 is skipped', async () => {
    const maestroCh = coreMaestroScriptCh(true);
    const span = addEvent(maestroCh, 1, 5, servoSpan({ channel: -1 }));
    const gpioCh = coreGpioScriptCh();
    addEvent(gpioCh, 3, null, { setHigh: true } as GpioEvent);

    const result = await convert(maestroCh, gpioCh);

    expect(result.get(coreLocId)).toBe('0|1000|0;0|2000|0;5|2000|5|1;0|0|0');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(span.id));
  });
});

//#endregion
//#region Commands

describe('script commands', () => {
  const mockRepo = mock<ScriptRepository>();

  beforeEach(() => {
    mockReset(mockRepo);
    mockRepo.getModules.calledWith().mockResolvedValue(getModules());
  });

  it('should create generic serial command', async () => {
    const event = { value: 'test val' } as GenericSerialEvent;
    const cmd = {
      controllerId: coreLocId,
      moduleId: coreGenSerialModId,
      moduleType: ModuleType.uart,
      moduleSubType: ModuleSubType.genericSerial,
      channelId: uuid(),
      event: event,
    } as ISingleCommand;

    const converter = new ScriptConverter(mockRepo);
    const result = await converter.convertCommand(cmd);

    expect(result).toBeDefined();

    const parts = result.split('|');

    expect(parts.length).toBe(5);
    expect(parts[0]).toBe(CommandType.genericSerial.toString());
    expect(parts[1]).toBe('0');
    expect(parts[2]).toBe('1');
    expect(parts[3]).toBe('9600');
    expect(parts[4]).toBe(event.value);
  });

  it('should create HCR command', async () => {
    const commands = Array<HcrCommand>(3);
    commands[0] = {
      id: uuid(),
      category: HcrCommandCategory.sdWav,
      command: HumanCyborgRelationsCmd.playWavOnA,
      valueA: 5,
      valueB: 0,
    } as HcrCommand;

    commands[1] = {
      id: uuid(),
      category: HcrCommandCategory.stimuli,
      command: HumanCyborgRelationsCmd.extremeHappy,
      valueA: 0,
      valueB: 0,
    } as HcrCommand;

    commands[2] = {
      id: uuid(),
      category: HcrCommandCategory.volume,
      command: HumanCyborgRelationsCmd.vocalizerVolume,
      valueA: 8,
      valueB: 0,
    } as HcrCommand;

    const event = { commands } as HumanCyborgRelationsEvent;
    const cmd = {
      controllerId: coreLocId,
      moduleId: coreHCRModId,
      moduleType: ModuleType.uart,
      moduleSubType: ModuleSubType.humanCyborgRelationsSerial,
      channelId: uuid(),
      event: event,
    } as ISingleCommand;

    const converter = new ScriptConverter(mockRepo);
    const result = await converter.convertCommand(cmd);

    expect(result).toBeDefined();

    const parts = result.split('|');

    expect(parts.length).toBe(5);
    expect(parts[0]).toBe(CommandType.genericSerial.toString());
    expect(parts[1]).toBe('0');
    expect(parts[2]).toBe('1');
    expect(parts[3]).toBe('38400');
    expect(parts[4]).toBe('<CA0005,SH1,PVV8>');
  });

  it('should create Kangaroo X2 command', async () => {
    const event = {
      ch1Action: KangarooAction.start,
      ch1Speed: 0,
      ch1Position: 0,
      ch2Action: KangarooAction.position,
      ch2Speed: 5,
      ch2Position: 10,
    } as KangarooEvent;

    const cmd = {
      controllerId: coreLocId,
      moduleId: coreKangarooModId,
      moduleType: ModuleType.uart,
      moduleSubType: ModuleSubType.kangaroo,
      channelId: uuid(),
      event: event,
    } as ISingleCommand;

    const converter = new ScriptConverter(mockRepo);
    const result = await converter.convertCommand(cmd);

    expect(result).toBeDefined();

    const cmds = result.split(';');

    expect(cmds.length).toBe(2);

    const cmd1Parts = cmds[0].split('|');

    expect(cmd1Parts.length).toBe(8);
    expect(cmd1Parts[0]).toBe(CommandType.kangaroo.toString());
    expect(cmd1Parts[1]).toBe('0');
    expect(cmd1Parts[2]).toBe('1');
    expect(cmd1Parts[3]).toBe('19600');
    expect(cmd1Parts[4]).toBe('1');
    expect(cmd1Parts[5]).toBe(KangarooAction.start.toString());
    expect(cmd1Parts[6]).toBe('0');
    expect(cmd1Parts[7]).toBe('0');

    const cmd2Parts = cmds[1].split('|');

    expect(cmd2Parts.length).toBe(8);
    expect(cmd2Parts[0]).toBe(CommandType.kangaroo.toString());
    expect(cmd2Parts[1]).toBe('0');
    expect(cmd2Parts[2]).toBe('1');
    expect(cmd2Parts[3]).toBe('19600');
    expect(cmd2Parts[4]).toBe('2');
    expect(cmd2Parts[5]).toBe(KangarooAction.position.toString());
    expect(cmd2Parts[6]).toBe('5');
    expect(cmd2Parts[7]).toBe('10');
  });

  it('should create Maestro command', async () => {
    const event = {
      channel: 5,
      isServo: false,
      position: 1000,
      speed: 5,
      acceleration: 10,
    } as MaestroEvent;
    const cmd = {
      controllerId: coreLocId,
      moduleId: coreMaestroModId,
      moduleType: ModuleType.uart,
      moduleSubType: ModuleSubType.maestro,
      channelId: uuid(),
      event: event,
    } as ISingleCommand;

    const converter = new ScriptConverter(mockRepo);
    const result = await converter.convertCommand(cmd);

    expect(result).toBeDefined();

    const parts = result.split('|');

    expect(parts.length).toBe(7);
    expect(parts[0]).toBe(CommandType.maestro.toString());
    expect(parts[1]).toBe('0');
    expect(parts[2]).toBe('3');
    expect(parts[3]).toBe(event.channel.toString());
    expect(parts[4]).toBe(event.position.toString());
    expect(parts[5]).toBe(event.speed.toString());
    expect(parts[6]).toBe(event.acceleration.toString());
  });

  it('should create generic I2C command', async () => {
    const event = { message: 'test val' } as I2cEvent;
    const cmd = {
      controllerId: coreLocId,
      moduleId: coreI2cModId,
      moduleType: ModuleType.i2c,
      moduleSubType: ModuleSubType.genericI2C,
      channelId: uuid(),
      event: event,
    } as ISingleCommand;

    const converter = new ScriptConverter(mockRepo);
    const result = await converter.convertCommand(cmd);

    expect(result).toBeDefined();

    const parts = result.split('|');

    expect(parts.length).toBe(4);
    expect(parts[0]).toBe(CommandType.i2c.toString());
    expect(parts[1]).toBe('0');
    expect(parts[2]).toBe('27');
    expect(parts[3]).toBe(event.message);
  });

  it('should create generic GPIO command', async () => {
    const event = { setHigh: true } as GpioEvent;
    const cmd = {
      controllerId: coreLocId,
      moduleId: coreLocId,
      moduleType: ModuleType.gpio,
      moduleSubType: ModuleSubType.genericGpio,
      channelId: coreGpioChannelId,
      event: event,
    } as ISingleCommand;

    const converter = new ScriptConverter(mockRepo);
    const result = await converter.convertCommand(cmd);

    expect(result).toBeDefined();

    const parts = result.split('|');

    expect(parts.length).toBe(4);
    expect(parts[0]).toBe(CommandType.gpio.toString());
    expect(parts[1]).toBe('0');
    expect(parts[2]).toBe('5');
    expect(parts[3]).toBe('1');
  });
});

//#region Helpers

function scriptWith(id: string, scriptChannels: ScriptChannel[]): Script {
  return {
    id,
    scriptName: 'test',
    description: 'test',
    lastSaved: new Date(),
    durationDS: 0,
    playlistCount: 0,
    deploymentStatus: {},
    scriptChannels,
  };
}

// A script channel has its own id; it never equals the GPIO channel's id.
function coreGpioScriptCh(): ScriptChannel {
  const gpioChannel = new GpioChannel(
    coreGpioChannelId,
    coreLocId,
    coreGpioChannelNumber,
    true,
    'GPIO 5',
    false,
  );

  return {
    id: uuid(),
    scriptId: '',
    channelType: ScriptChannelType.GPIO,
    parentModuleId: coreLocId,
    moduleChannelId: gpioChannel.id,
    moduleChannelType: ModuleChannelTypes.GpioChannel,
    moduleChannel: gpioChannel,
    maxDuration: 0,
    events: {},
  };
}

function coreMaestroScriptCh(isServo: boolean, channelNumber = 4): ScriptChannel {
  const maestroChannel = new MaestroChannel(
    uuid(),
    coreMaestroModId,
    `Maestro ${channelNumber}`,
    true,
    channelNumber,
    isServo,
    500,
    2500,
    1500,
    false,
  );

  return {
    id: uuid(),
    scriptId: '',
    channelType: isServo ? ScriptChannelType.SERVO : ScriptChannelType.GPIO,
    parentModuleId: coreMaestroModId,
    moduleChannelId: maestroChannel.id,
    moduleChannelType: ModuleChannelTypes.MaestroChannel,
    moduleChannel: maestroChannel,
    maxDuration: 0,
    events: {},
  };
}

function domeSerialScriptCh(): ScriptChannel {
  const uartChannel = new UartChannel(
    uuid(),
    domeGenSerialModId,
    '',
    ModuleSubType.genericSerial,
    true,
  );

  return {
    id: uuid(),
    scriptId: '',
    channelType: ScriptChannelType.GENERIC_UART,
    parentModuleId: domeGenSerialModId,
    moduleChannelId: uartChannel.id,
    moduleChannelType: ModuleChannelTypes.UartChannel,
    moduleChannel: uartChannel,
    maxDuration: 0,
    events: {},
  };
}

// A valid servo span payload on Maestro channel 4.
function servoSpan(overrides: Partial<RandomMaestroEvent> = {}): RandomMaestroEvent {
  return {
    channel: 4,
    isServo: true,
    minGapMs: 400,
    maxGapMs: 2000,
    minPos: 20,
    maxPos: 100,
    minMove: 15,
    maxMove: 60,
    speed: 0,
    acceleration: 0,
    ...overrides,
  };
}

// Times in seconds, as the scripter stores them.
function addEvent(
  ch: ScriptChannel,
  time: number,
  endTime: number | null,
  event: ScriptEventTypes,
): ScriptEvent {
  const evt: ScriptEvent = {
    id: uuid(),
    scriptChannel: ch.id,
    moduleType: ch.moduleChannel.moduleType,
    moduleSubType: ch.moduleChannel.moduleSubType,
    time,
    endTime,
    event,
  };
  ch.events[evt.id] = evt;
  return evt;
}

function generateScript(id: string): Script {
  const script: Script = {
    id,
    scriptName: 'test',
    description: 'test',
    lastSaved: new Date(),
    durationDS: 0,
    playlistCount: 0,
    deploymentStatus: {},
    scriptChannels: [],
  };

  switch (id) {
    case 'coreGenericSerial': {
      script.scriptChannels.push(coreGenericSeriaScriptCh(id));
      return script;
    }
    case 'domeTwoChannelScript': {
      script.scriptChannels.push(domeGenericSerialScriptCh(id));
      script.scriptChannels.push(domeI2cScriptCh(id));
      return script;
    }
    case 'domeAndCoreScript': {
      script.scriptChannels.push(coreGenericSeriaScriptCh(id));
      script.scriptChannels.push(domeGenericSerialScriptCh(id));
      script.scriptChannels.push(domeI2cScriptCh(id));
      return script;
    }
    default:
      return script;
  }
}

function generateSerialScriptChannel(scriptId: string): ScriptChannel {
  const uartChannel = new UartChannel(
    uuid(),
    coreGenSerialModId,
    '',
    ModuleSubType.genericSerial,
    true,
  );

  const scriptCh: ScriptChannel = {
    id: uuid(),
    scriptId,
    channelType: ScriptChannelType.GENERIC_UART,
    parentModuleId: coreGenSerialModId,
    moduleChannelId: uartChannel.id,
    moduleChannelType: ModuleChannelTypes.UartChannel,
    moduleChannel: uartChannel,
    maxDuration: 3000,
    events: {},
  };

  return scriptCh;
}

function generateCoreScriptSerialEventByDecSec(tenthOfSeconds: number, chId: string): ScriptEvent {
  const evt = { value: `test ${tenthOfSeconds}` } as GenericSerialEvent;

  const sevt: ScriptEvent = {
    id: uuid(),
    scriptChannel: chId,
    moduleType: ModuleType.uart,
    moduleSubType: ModuleSubType.genericSerial,
    time: tenthOfSeconds,
    endTime: null,
    event: evt,
  };

  return sevt;
}

function coreGenericSeriaScriptCh(scriptId: string): ScriptChannel {
  const uartChannel = new UartChannel(
    uuid(),
    coreGenSerialModId,
    '',
    ModuleSubType.genericSerial,
    true,
  );

  const scriptCh: ScriptChannel = {
    id: uuid(),
    scriptId,
    channelType: ScriptChannelType.GENERIC_UART,
    parentModuleId: coreGenSerialModId,
    moduleChannelId: uartChannel.id,
    moduleChannelType: ModuleChannelTypes.UartChannel,
    moduleChannel: uartChannel,
    maxDuration: 3000,
    events: {},
  };

  for (let i = 0; i < 3; i++) {
    const evt = { value: `test ${i}` } as GenericSerialEvent;
    const sevt: ScriptEvent = {
      id: uuid(),
      scriptChannel: scriptCh.id,
      moduleType: ModuleType.uart,
      moduleSubType: ModuleSubType.genericSerial,
      time: i,
      endTime: null,
      event: evt,
    };
    scriptCh.events[uuid()] = sevt;
  }

  return scriptCh;
}

function domeGenericSerialScriptCh(scriptId: string): ScriptChannel {
  const uartChannel = new UartChannel(
    uuid(),
    domeGenSerialModId,
    '',
    ModuleSubType.genericSerial,
    true,
  );

  const scriptCh: ScriptChannel = {
    id: uuid(),
    scriptId,
    channelType: ScriptChannelType.GENERIC_UART,
    parentModuleId: domeGenSerialModId,
    moduleChannelId: uartChannel.id,
    moduleChannelType: ModuleChannelTypes.UartChannel,
    moduleChannel: uartChannel,
    maxDuration: 3000,
    events: {},
  };

  for (let i = 0; i < 6; i++) {
    if (i % 2 === 0) {
      const evt = { value: `UART ${i}` } as GenericSerialEvent;
      const sevt: ScriptEvent = {
        id: uuid(),
        scriptChannel: scriptCh.id,
        moduleType: ModuleType.uart,
        moduleSubType: ModuleSubType.genericSerial,
        time: i,
        endTime: null,
        event: evt,
      };
      scriptCh.events[uuid()] = sevt;
    }
  }

  return scriptCh;
}

function domeI2cScriptCh(scriptId: string): ScriptChannel {
  const i2cChannel = new I2cChannel(uuid(), domeI2cModId, '', true);

  const scriptCh: ScriptChannel = {
    id: uuid(),
    scriptId,
    channelType: ScriptChannelType.GENERIC_I2C,
    parentModuleId: domeI2cModId,
    moduleChannelId: i2cChannel.id,
    moduleChannelType: ModuleChannelTypes.I2cChannel,
    moduleChannel: i2cChannel,
    maxDuration: 3000,
    events: {},
  };

  for (let i = 0; i < 6; i++) {
    if (i % 2 !== 0) {
      const evt = { message: `I2C ${i}` } as I2cEvent;
      const sevt: ScriptEvent = {
        id: uuid(),
        scriptChannel: scriptCh.id,
        moduleType: ModuleType.i2c,
        moduleSubType: ModuleSubType.genericI2C,
        time: i,
        endTime: null,
        event: evt,
      };
      scriptCh.events[uuid()] = sevt;
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
      'Core Gen Serial',
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
      'Core Kangaroo',
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
      'Core HCR',
      coreLocId,
      ModuleSubType.humanCyborgRelationsSerial,
      1,
      38400,
    ),
  );
  map.set(
    coreMaestroModId,
    new UartModule(3, coreMaestroModId, 'Core Maestro', coreLocId, ModuleSubType.maestro, 1, 57600),
  );
  map.set(
    coreI2cModId,
    new I2cModule(0, coreI2cModId, 'Core I2C', coreLocId, 27, ModuleSubType.genericI2C),
  );
  const coreGpioModule = new GpioModule(coreLocId);

  coreGpioModule.channels.push(
    new GpioChannel(coreGpioChannelId, coreLocId, coreGpioChannelNumber, true, 'GPIO 5', false),
  );
  map.set(coreLocId, coreGpioModule);

  // dome
  map.set(
    domeGenSerialModId,
    new UartModule(
      0,
      domeGenSerialModId,
      'Dome Gen Serial',
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
      'Dome Kangaroo',
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
      'Dome HCR',
      domeLocId,
      ModuleSubType.humanCyborgRelationsSerial,
      2,
      38402,
    ),
  );
  map.set(
    domeMaestroModId,
    new UartModule(3, domeMaestroModId, 'Dome Maestro', domeLocId, ModuleSubType.maestro, 2, 57602),
  );
  map.set(
    domeI2cModId,
    new I2cModule(0, domeI2cModId, 'Dome I2C', domeLocId, 37, ModuleSubType.genericI2C),
  );
  const domeGpioModule = new GpioModule(domeLocId);
  map.set(domeLocId, domeGpioModule);

  // body
  map.set(
    bodyGenSerialModId,
    new UartModule(
      0,
      bodyGenSerialModId,
      'Body Gen Serial',
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
      'Body Kangaroo',
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
      'Body HCR',
      bodyLocId,
      ModuleSubType.humanCyborgRelationsSerial,
      3,
      38403,
    ),
  );
  map.set(
    bodyMaestroModId,
    new UartModule(3, bodyMaestroModId, 'Body Maestro', bodyLocId, ModuleSubType.maestro, 3, 57603),
  );
  map.set(
    bodyI2cModId,
    new I2cModule(0, bodyI2cModId, 'Body I2C', bodyLocId, 47, ModuleSubType.genericI2C),
  );
  const bodyGpioModule = new GpioModule(bodyLocId);
  map.set(bodyLocId, bodyGpioModule);

  return map;
}
