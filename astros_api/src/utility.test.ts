import { describe, expect, it } from 'vitest';
import {
  Script,
  ScriptChannel,
  ScriptChannelType,
  ScriptEvent,
  UartChannel,
  ModuleSubType,
  ModuleType,
  ModuleChannelTypes,
  GenericSerialEvent,
} from 'astros-common';
import { calculateLengthDS } from './utility.js';
import { v4 as uuid } from 'uuid';

describe('Utility functions', () => {
  it('should calculate the correct length in DS', () => {
    const scriptId = 'testScriptTimes';

    const evt1Time = 5; // 0.5 seconds
    const evt2Time = 12; // 1.2 seconds
    const evt3Time = 24; // 2.4 seconds
    const evt4Time = 362; // 36.2 seconds

    const script = new Script(scriptId, 'test', 'test', new Date(), 362);
    const scriptCh1 = generateSerialScriptChannel(scriptId);
    const sevt1 = generateCoreScriptSerialEventByDecSec(evt1Time, scriptCh1.id);
    const sevt2 = generateCoreScriptSerialEventByDecSec(evt2Time, scriptCh1.id);
    const scriptCh2 = generateSerialScriptChannel(scriptId);
    const sevt3 = generateCoreScriptSerialEventByDecSec(evt3Time, scriptCh2.id);
    const sevt4 = generateCoreScriptSerialEventByDecSec(evt4Time, scriptCh2.id);

    scriptCh1.events[uuid()] = sevt1;
    scriptCh1.events[uuid()] = sevt2;
    scriptCh2.events[uuid()] = sevt3;
    scriptCh2.events[uuid()] = sevt4;

    script.scriptChannels.push(scriptCh1);
    script.scriptChannels.push(scriptCh2);

    const lengthDS = calculateLengthDS(script);

    // The length in DS should be the max time among all events
    expect(lengthDS).toBe(evt4Time);
  });
});

function generateSerialScriptChannel(scriptId: string): ScriptChannel {
  const moduleId = uuid();

  const uartChannel = new UartChannel(uuid(), moduleId, '', ModuleSubType.genericSerial, true);

  const scriptCh = new ScriptChannel(
    uuid(),
    scriptId,
    ScriptChannelType.GENERIC_UART,
    moduleId,
    uartChannel.id,
    ModuleChannelTypes.UartChannel,
    uartChannel,
    3000,
  );

  return scriptCh;
}

function generateCoreScriptSerialEventByDecSec(tenthOfSeconds: number, chId: string): ScriptEvent {
  const evt = new GenericSerialEvent(`test ${tenthOfSeconds}`);

  const sevt = new ScriptEvent(
    uuid(),
    chId,
    ModuleType.uart,
    ModuleSubType.genericSerial,
    tenthOfSeconds,
    evt,
  );

  return sevt;
}
