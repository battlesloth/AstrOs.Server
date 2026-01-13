import { ModalType, ModuleSubType, ModuleType, ScriptChannelType } from '@/enums';
import type {
  GenericSerialEvent,
  GpioEvent,
  HumanCyborgRelationsEvent,
  I2cEvent,
  KangarooEvent,
  MaestroChannel,
  MaestroEvent,
  ModuleChannelType,
} from '@/models';

export function useScriptEvents() {
  function eventTypeToModalType(channelType: ScriptChannelType): ModalType {
    switch (channelType) {
      case ScriptChannelType.GPIO:
        return ModalType.GPIO_EVENT;
      case ScriptChannelType.GENERIC_I2C:
        return ModalType.I2C_EVENT;
      case ScriptChannelType.GENERIC_UART:
        return ModalType.UART_EVENT;
      case ScriptChannelType.KANGAROO:
        return ModalType.KANGAROO_EVENT;
      case ScriptChannelType.SERVO:
        return ModalType.SERVO_EVENT;
      case ScriptChannelType.AUDIO:
        return ModalType.HCR_EVENT;
      default:
        return ModalType.CLOSE_ALL;
    }
  }

  function getDefaultScriptEvent(channel: ModuleChannelType) {
    const moduleType: ModuleType = channel.moduleType;

    switch (moduleType) {
      case ModuleType.GPIO:
        return generateGpioEvent();
      case ModuleType.I2C:
        return generateI2cEvent();
      case ModuleType.UART:
        return generateUartEvent(channel);
    }
  }

  function generateGpioEvent(): GpioEvent {
    return {
      setHigh: false,
    };
  }

  function generateI2cEvent(): I2cEvent {
    return {
      message: '',
    };
  }

  function generateUartEvent(
    channel: ModuleChannelType,
  ): GenericSerialEvent | HumanCyborgRelationsEvent | KangarooEvent | MaestroEvent {
    const moduleSubType = channel.moduleSubType;

    switch (moduleSubType) {
      case ModuleSubType.GENERIC_SERIAL:
        return {
          value: '',
        } as GenericSerialEvent;
      case ModuleSubType.HUMAN_CYBORG_RELATIONS_SERIAL:
        return {
          commands: [],
        } as HumanCyborgRelationsEvent;
      case ModuleSubType.KANGAROO:
        return {
          ch1Action: 0,
          ch1Speed: 0,
          ch1Position: 0,
          ch2Action: 0,
          ch2Speed: 0,
          ch2Position: 0,
        } as KangarooEvent;
      case ModuleSubType.MAESTRO:
        const ch = channel as MaestroChannel;

        return {
          channel: ch.channelNumber,
          isServo: ch.isServo,
          position: 0,
          speed: 0,
          acceleration: 0,
        } as MaestroEvent;
    }
    return {
      value: '',
    } as GenericSerialEvent;
  }

  return {
    eventTypeToModalType,
    getDefaultScriptEvent,
  };
}
