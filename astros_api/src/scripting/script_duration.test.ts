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
} from '../models/index.js';
import { calculateLengthDS } from './script_duration.js';
import { v4 as uuid } from 'uuid';

describe('calculateLengthDS', () => {
  // ScriptEvent.time is in seconds (the scripter rounds to 0.1 s; the DB stores
  // it x10). The result must be deciseconds — the unit every consumer of
  // scripts.duration_ds assumes.
  it('returns the latest event time across all channels, in deciseconds', () => {
    const script = generateScript('testScriptTimes');
    const scriptCh1 = generateSerialScriptChannel(script.id);
    const scriptCh2 = generateSerialScriptChannel(script.id);
    const scriptCh3 = generateSerialScriptChannel(script.id);
    // Latest event mid-way through the middle channel, so first/last-event and
    // first/last-channel-only implementations all fail.
    addEvent(scriptCh1, generateCoreScriptSerialEvent(0.5, scriptCh1.id));
    addEvent(scriptCh2, generateCoreScriptSerialEvent(1.2, scriptCh2.id));
    addEvent(scriptCh2, generateCoreScriptSerialEvent(36.2, scriptCh2.id));
    addEvent(scriptCh2, generateCoreScriptSerialEvent(2.4, scriptCh2.id));
    addEvent(scriptCh3, generateCoreScriptSerialEvent(3.0, scriptCh3.id));
    script.scriptChannels.push(scriptCh1, scriptCh2, scriptCh3);

    expect(calculateLengthDS(script)).toBe(362);
  });

  // Arithmetic-derived times drift either side of a whole decisecond: the
  // above-integer case separates rounding from ceil, the below-integer case
  // from floor/trunc.
  it.each([
    { label: '45.2 + 0.1', seconds: 45.2 + 0.1, expected: 453 }, // x10 === 453.00000000000006
    { label: '0.3 - 0.1', seconds: 0.3 - 0.1, expected: 2 }, // x10 === 1.9999999999999998
  ])('rounds $label s to $expected ds', ({ seconds, expected }) => {
    const script = generateScript('testScriptRounding');
    const scriptCh = generateSerialScriptChannel(script.id);
    addEvent(scriptCh, generateCoreScriptSerialEvent(seconds, scriptCh.id));
    script.scriptChannels.push(scriptCh);

    expect(calculateLengthDS(script)).toBe(expected);
  });

  it('returns 0 for a script with no events', () => {
    const script = generateScript('testScriptEmpty');
    script.scriptChannels.push(generateSerialScriptChannel(script.id));

    expect(calculateLengthDS(script)).toBe(0);
  });
});

function generateScript(scriptId: string): Script {
  return {
    id: scriptId,
    scriptName: 'test',
    description: 'test',
    lastSaved: new Date(),
    durationDS: 0,
    playlistCount: 0,
    deploymentStatus: {},
    scriptChannels: [],
  };
}

function addEvent(scriptCh: ScriptChannel, evt: ScriptEvent): void {
  scriptCh.events[uuid()] = evt;
}

function generateSerialScriptChannel(scriptId: string): ScriptChannel {
  const moduleId = uuid();

  const uartChannel = new UartChannel(uuid(), moduleId, '', ModuleSubType.genericSerial, true);

  const scriptCh: ScriptChannel = {
    id: uuid(),
    scriptId,
    channelType: ScriptChannelType.GENERIC_UART,
    parentModuleId: moduleId,
    moduleChannelId: uartChannel.id,
    moduleChannelType: ModuleChannelTypes.UartChannel,
    moduleChannel: uartChannel,
    maxDuration: 3000,
    events: {},
  };

  return scriptCh;
}

function generateCoreScriptSerialEvent(timeSeconds: number, chId: string): ScriptEvent {
  const evt = { value: `test ${timeSeconds}` } as GenericSerialEvent;

  const sevt: ScriptEvent = {
    id: uuid(),
    scriptChannel: chId,
    moduleType: ModuleType.uart,
    moduleSubType: ModuleSubType.genericSerial,
    time: timeSeconds,
    event: evt,
  };

  return sevt;
}
