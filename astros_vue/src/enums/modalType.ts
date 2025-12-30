export enum ModalType {
  // shared
  CLOSE_ALL = 'closeAll',
  ERROR = 'errorModal',
  CONFIRM = 'confirmModal',
  INTERRUPT = 'interruptModal',

  // modules view
  LOADING = 'loadingModal',
  ADD_MODULE = 'addModule',
  REMOVE_MODULE = 'removeModule',
  CONFIGURE_MODULE = 'configureModule',
  SERVO_TEST = 'servoTestModal',

  // scripter view
  ADD_CHANNEL = 'addChannel',
  SCRIPT_TEST = 'scriptTestModal',
  CHANNEL_TEST = 'channelTestModal',
  GPIO_EVENT = 'gpioEventModal',
  HCR_EVENT = 'hcrEventModal',
  I2C_EVENT = 'i2cEventModal',
  KANGAROO_EVENT = 'kangarooEventModal',
  SERVO_EVENT = 'servoEventModal',
  UART_EVENT = 'uartEventModal',
}