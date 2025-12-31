import { ModalType } from "@/enums/modalType";
import { ModuleSubType } from "@/enums/modules/ModuleSubType";
import { ModuleType } from "@/enums/modules/ModuleType";
import type { GenericSerialEvent, GpioEvent, HumanCyborgRelationsEvent, I2cEvent, KangarooEvent, MaestroEvent } from "@/models/scripts/events/index";

export function useScriptEvents() {

  function eventTypeToModalType(moduleType: ModuleType, moduleSubType: ModuleSubType): ModalType {
    switch (moduleType) {
      case ModuleType.UART:
        switch (moduleSubType) {
          case ModuleSubType.GENERIC_SERIAL:
            return ModalType.UART_EVENT;
          case ModuleSubType.KANGAROO:
            return ModalType.KANGAROO_EVENT;
          case ModuleSubType.HUMAN_CYBORG_RELATIONS_SERIAL:
            return ModalType.HCR_EVENT;
          case ModuleSubType.MAESTRO:
            return ModalType.SERVO_EVENT;
        }
        break;
      case ModuleType.I2C:
        return ModalType.I2C_EVENT;
      case ModuleType.GPIO:
        return ModalType.GPIO_EVENT;
    }
    return ModalType.CLOSE_ALL;
  }

  function getDefaultScriptEvent(moduleType: ModuleType, moduleSubType: ModuleSubType) {
    switch (moduleType) {
      case ModuleType.GPIO:
        return generateGpioEvent();
      case ModuleType.I2C:
        return generateI2cEvent();
      case ModuleType.UART:
        return generateUartEvent(moduleSubType);
    }
  }

  function generateGpioEvent(): GpioEvent {
    return {
      setHigh: false,
    };
  }

  function generateI2cEvent(): I2cEvent {
    return {
      message: "",
    };
  }

  function generateUartEvent(moduleSubType: ModuleSubType): GenericSerialEvent | HumanCyborgRelationsEvent | KangarooEvent | MaestroEvent {
    switch (moduleSubType) {
      case ModuleSubType.GENERIC_SERIAL:
        return {
          value: "",
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
        return {
          channel: 0,
          isServo: false,
          position: 0,
          speed: 0,
          acceleration: 0,
        } as MaestroEvent;
    }
    return {
      value: "",
    } as GenericSerialEvent;
  }

  return {
    eventTypeToModalType,
    getDefaultScriptEvent,
  };
}