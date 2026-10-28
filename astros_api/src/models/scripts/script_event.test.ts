import { describe, expect, it } from 'vitest';
import { ModuleSubType } from '../enums.js';
import { moduleSubTypeToScriptEventTypes, supportsRandomSpan } from './script_event.js';

const gpioSpan = { minGapMs: 50, maxGapMs: 400 };
const maestroSpan = {
  channel: 3,
  isServo: true,
  minGapMs: 400,
  maxGapMs: 2000,
  minPos: 20,
  maxPos: 100,
  minMove: 15,
  maxMove: null,
  speed: 0,
  acceleration: 0,
};

describe('moduleSubTypeToScriptEventTypes', () => {
  it('isSpan routes genericGpio to RandomGpioEvent and maestro to RandomMaestroEvent', () => {
    expect(
      moduleSubTypeToScriptEventTypes(ModuleSubType.genericGpio, JSON.stringify(gpioSpan), true),
    ).toEqual(gpioSpan);
    expect(
      moduleSubTypeToScriptEventTypes(ModuleSubType.maestro, JSON.stringify(maestroSpan), true),
    ).toEqual(maestroSpan);
  });

  it('isSpan with kangaroo throws', () => {
    expect(() => moduleSubTypeToScriptEventTypes(ModuleSubType.kangaroo, '{}', true)).toThrow(
      `Random span not supported for moduleSubType: ${ModuleSubType.kangaroo}`,
    );
  });

  // Every other sub-type is refused too, including ones the point path
  // already rejects as unknown.
  it.each([
    ModuleSubType.genericSerial,
    ModuleSubType.humanCyborgRelationsSerial,
    ModuleSubType.genericI2C,
    ModuleSubType.humanCyborgRelationsI2C,
    ModuleSubType.pwmBoard,
    ModuleSubType.none,
  ])('isSpan with sub-type %i throws the span error', (subType) => {
    expect(() => moduleSubTypeToScriptEventTypes(subType, '{}', true)).toThrow(
      `Random span not supported for moduleSubType: ${subType}`,
    );
  });

  it.each([
    { subType: ModuleSubType.genericSerial, payload: { value: 'hello' } },
    { subType: ModuleSubType.genericGpio, payload: { setHigh: true } },
    { subType: ModuleSubType.humanCyborgRelationsSerial, payload: { commands: [] } },
    { subType: ModuleSubType.humanCyborgRelationsI2C, payload: { commands: [] } },
    { subType: ModuleSubType.genericI2C, payload: { message: 'm' } },
    { subType: ModuleSubType.kangaroo, payload: { ch1Action: 1, ch2Action: 0 } },
    {
      subType: ModuleSubType.maestro,
      payload: { channel: 3, isServo: true, position: 50, speed: 0, acceleration: 0 },
    },
  ])('isSpan false is unchanged for sub-type $subType', ({ subType, payload }) => {
    const json = JSON.stringify(payload);
    expect(moduleSubTypeToScriptEventTypes(subType, json, false)).toEqual(payload);
    // The default (no isSpan argument) is the point path.
    expect(moduleSubTypeToScriptEventTypes(subType, json)).toEqual(payload);
  });

  // The repository refuses and drops spans by supportsRandomSpan; the parser
  // routes them by its own switch. The two must agree.
  it.each(Object.values(ModuleSubType).filter((v): v is ModuleSubType => typeof v === 'number'))(
    'supportsRandomSpan agrees with the isSpan routing for sub-type %i',
    (subType) => {
      const parses = (() => {
        try {
          moduleSubTypeToScriptEventTypes(subType, '{}', true);
          return true;
        } catch {
          return false;
        }
      })();
      expect(supportsRandomSpan(subType)).toBe(parses);
    },
  );

  it('supportsRandomSpan is true only for genericGpio and maestro', () => {
    const supported = Object.values(ModuleSubType).filter(
      (v): v is ModuleSubType => typeof v === 'number' && supportsRandomSpan(v),
    );
    expect(supported.sort((a, b) => a - b)).toEqual([
      ModuleSubType.maestro,
      ModuleSubType.genericGpio,
    ]);
  });

  it.each([ModuleSubType.pwmBoard, ModuleSubType.none])(
    'isSpan false still rejects unknown sub-type %i',
    (subType) => {
      expect(() => moduleSubTypeToScriptEventTypes(subType, '{}', false)).toThrow(
        `Unknown moduleSubType: ${subType}`,
      );
    },
  );
});
