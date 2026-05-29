// Mirror of the server's `TransmissionType` enum
// (`astros_api/src/models/enums.ts:82`). Numeric values must match the wire
// format. Hand-maintained; keep cross-referenced when either side changes.
export enum WebsocketMessageType {
  SCRIPT = 0,
  CONFIGURATION_SYNC = 1,
  LOCATION_STATUS = 2,
  CONTROLLERS_SYNC = 3,
  RUN = 4,
  PANIC = 5,
  DIRECT_COMMAND = 6,
  FORMAT_SD = 7,
  SERVO_TEST = 8,
  SYSTEM_STATUS = 9,
  LOCK_STATE_CHANGED = 10,
  FLASH_JOB_ACTIVE = 11,
  FLASH_JOB_STARTED = 12,
  FLASH_CONTROLLER_UPDATE = 13,
  FLASH_CONTROLLER_RESULT = 14,
  FLASH_JOB_DONE = 15,
  FLASH_JOB_FAILED = 16,
}
