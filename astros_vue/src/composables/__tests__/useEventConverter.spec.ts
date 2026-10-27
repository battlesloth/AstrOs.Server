import { describe, it, expect } from 'vitest';
import { ModuleSubType, ModuleType } from '@/enums';
import type { GpioChannel, MaestroChannel, ScriptEvent } from '@/models';
import { useEventConverter } from '../useEventConverter';

const SPAN_ERROR = 'Converting random spans between channel types is not supported yet';

const maestroChannel: MaestroChannel = {
  id: 'maestro-ch',
  parentId: 'maestro-board',
  channelName: 'Servo 7',
  enabled: true,
  moduleType: ModuleType.UART,
  moduleSubType: ModuleSubType.MAESTRO,
  channelNumber: 7,
  isServo: false,
  minPos: 500,
  maxPos: 2500,
  homePos: 1500,
  inverted: false,
};

const gpioChannel: GpioChannel = {
  id: 'gpio-ch',
  parentId: 'location',
  channelName: 'GPIO 2',
  enabled: true,
  moduleType: ModuleType.GPIO,
  moduleSubType: ModuleSubType.GENERIC_GPIO,
  channelNumber: 2,
  defaultHigh: false,
};

function gpioPoint(id: string, time: number, setHigh: boolean): ScriptEvent {
  return {
    id,
    scriptChannel: 'sc-1',
    moduleType: ModuleType.GPIO,
    moduleSubType: ModuleSubType.GENERIC_GPIO,
    time,
    endTime: null,
    event: { setHigh },
  };
}

function gpioSpan(id: string): ScriptEvent {
  return {
    id,
    scriptChannel: 'sc-1',
    moduleType: ModuleType.GPIO,
    moduleSubType: ModuleSubType.GENERIC_GPIO,
    time: 1.0,
    endTime: 6.0,
    event: { minGapMs: 50, maxGapMs: 400 },
  };
}

function maestroSpan(id: string): ScriptEvent {
  return {
    id,
    scriptChannel: 'sc-1',
    moduleType: ModuleType.UART,
    moduleSubType: ModuleSubType.MAESTRO,
    time: 2.0,
    endTime: 18.5,
    event: {
      channel: 7,
      isServo: false,
      minGapMs: 400,
      maxGapMs: 2000,
      minPos: 0,
      maxPos: 100,
      minMove: 0,
      maxMove: null,
      speed: 0,
      acceleration: 0,
    },
  };
}

describe('useEventConverter', () => {
  const { convertEventsForChannelType } = useEventConverter();

  it('throws when converting a GPIO span to a Maestro channel', () => {
    // A point first: the span is refused even when it is not the first event.
    const events = { p: gpioPoint('p', 0.5, true), s: gpioSpan('s') };

    expect(() =>
      convertEventsForChannelType(events, ModuleSubType.GENERIC_GPIO, maestroChannel),
    ).toThrow(SPAN_ERROR);
  });

  it('throws when converting a Maestro span to a GPIO channel', () => {
    const events = { s: maestroSpan('s') };

    expect(() => convertEventsForChannelType(events, ModuleSubType.MAESTRO, gpioChannel)).toThrow(
      SPAN_ERROR,
    );
  });

  // Swapping to another channel of the same sub-type is not a conversion.
  it('passes spans through unchanged when the sub-type does not change', () => {
    const events = { s: gpioSpan('s') };

    expect(convertEventsForChannelType(events, ModuleSubType.GENERIC_GPIO, gpioChannel)).toBe(
      events,
    );
  });

  it('converts GPIO points to Maestro points with a null endTime', () => {
    const events = { a: gpioPoint('a', 0.5, true), b: gpioPoint('b', 3.2, false) };

    expect(convertEventsForChannelType(events, ModuleSubType.GENERIC_GPIO, maestroChannel)).toEqual(
      {
        a: {
          id: 'a',
          scriptChannel: 'sc-1',
          moduleType: ModuleType.UART,
          moduleSubType: ModuleSubType.MAESTRO,
          time: 0.5,
          endTime: null,
          event: { channel: 7, isServo: false, position: 2500, speed: 0, acceleration: 0 },
        },
        b: {
          id: 'b',
          scriptChannel: 'sc-1',
          moduleType: ModuleType.UART,
          moduleSubType: ModuleSubType.MAESTRO,
          time: 3.2,
          endTime: null,
          event: { channel: 7, isServo: false, position: 500, speed: 0, acceleration: 0 },
        },
      },
    );
  });

  it('converts Maestro points to GPIO points with a null endTime', () => {
    const point: ScriptEvent = {
      id: 'm',
      scriptChannel: 'sc-1',
      moduleType: ModuleType.UART,
      moduleSubType: ModuleSubType.MAESTRO,
      time: 4.0,
      endTime: null,
      event: { channel: 7, isServo: false, position: 2500, speed: 0, acceleration: 0 },
    };

    expect(convertEventsForChannelType({ m: point }, ModuleSubType.MAESTRO, gpioChannel)).toEqual({
      m: {
        id: 'm',
        scriptChannel: 'sc-1',
        moduleType: ModuleType.GPIO,
        moduleSubType: ModuleSubType.GENERIC_GPIO,
        time: 4.0,
        endTime: null,
        event: { setHigh: true },
      },
    });
  });

  // Matches the API, which saves an event that omits endTime as a point.
  it('converts an event without an endTime property as a point', () => {
    const point = gpioPoint('p', 1.0, true);
    delete (point as Partial<ScriptEvent>).endTime;

    const converted = convertEventsForChannelType(
      { p: point },
      ModuleSubType.GENERIC_GPIO,
      maestroChannel,
    );

    expect(converted.p?.endTime).toBeNull();
  });
});
