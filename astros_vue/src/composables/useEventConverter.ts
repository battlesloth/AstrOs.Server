import type {
  GpioEvent,
  MaestroChannel,
  MaestroEvent,
  ModuleChannelType,
  ScriptEvent,
} from '@/models';
import { ModuleSubType, ModuleType } from '@/enums';

export function useEventConverter() {
  function convertEventsForChannelType(
    events: { [key: string]: ScriptEvent },
    fromSubType: ModuleSubType,
    toSubType: ModuleChannelType,
  ): { [key: string]: ScriptEvent } {
    if (fromSubType === toSubType.moduleSubType) {
      return events;
    }

    // != null: an event that omits endTime is a point, as the API saves it.
    if (Object.values(events).some((event) => event.endTime != null)) {
      throw new Error('Converting random spans between channel types is not supported yet');
    }

    if (
      fromSubType === ModuleSubType.GENERIC_GPIO &&
      toSubType.moduleSubType === ModuleSubType.MAESTRO
    ) {
      const maestroChannel = toSubType as MaestroChannel;
      return convertFromGpioToMaestroGpio(events, maestroChannel.channelNumber);
    }

    if (
      fromSubType === ModuleSubType.MAESTRO &&
      toSubType.moduleSubType === ModuleSubType.GENERIC_GPIO
    ) {
      return convertFromMaestroGpioToGpio(events);
    }

    throw new Error(
      `Event conversion from ${fromSubType} to ${toSubType.moduleSubType} is not supported.`,
    );
  }

  function convertFromGpioToMaestroGpio(
    events: { [key: string]: ScriptEvent },
    channelNumber: number,
  ): {
    [key: string]: ScriptEvent;
  } {
    const convertedEvents: { [key: string]: ScriptEvent } = {};
    Object.values(events).forEach((event) => {
      const convertedEvent: ScriptEvent = {
        id: event.id,
        scriptChannel: event.scriptChannel,
        moduleType: ModuleType.UART,
        moduleSubType: ModuleSubType.MAESTRO,
        time: event.time,
        endTime: null,
        event: undefined,
      };

      const oldEvent = event.event as GpioEvent;

      const newEvent: MaestroEvent = {
        channel: channelNumber,
        isServo: false,
        position: oldEvent.setHigh ? 2500 : 500,
        speed: 0,
        acceleration: 0,
      };

      convertedEvent.event = newEvent;

      convertedEvents[convertedEvent.id] = convertedEvent;
    });
    return convertedEvents;
  }

  function convertFromMaestroGpioToGpio(events: { [key: string]: ScriptEvent }): {
    [key: string]: ScriptEvent;
  } {
    const convertedEvents: { [key: string]: ScriptEvent } = {};
    Object.values(events).forEach((event) => {
      const convertedEvent: ScriptEvent = {
        id: event.id,
        scriptChannel: event.scriptChannel,
        moduleType: ModuleType.GPIO,
        moduleSubType: ModuleSubType.GENERIC_GPIO,
        time: event.time,
        endTime: null,
        event: undefined,
      };

      const oldEvent = event.event as MaestroEvent;

      const newEvent: GpioEvent = {
        setHigh: oldEvent.position >= 1250,
      };

      convertedEvent.event = newEvent;
      convertedEvents[convertedEvent.id] = convertedEvent;
    });
    return convertedEvents;
  }

  return {
    convertEventsForChannelType,
  };
}
