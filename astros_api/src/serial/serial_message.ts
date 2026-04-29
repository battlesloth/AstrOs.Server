export enum SerialMessageType {
  // for internal use
  SERIAL_MSG_RECEIVED = -1,

  // needs to match ESP enums
  UNKNOWN,
  REGISTRATION_SYNC, // from web server
  REGISTRATION_SYNC_ACK,
  POLL_ACK,
  POLL_NAK,
  DEPLOY_CONFIG, // from web server
  DEPLOY_CONFIG_ACK,
  DEPLOY_CONFIG_NAK,
  DEPLOY_SCRIPT, // from web server
  DEPLOY_SCRIPT_ACK,
  DEPLOY_SCRIPT_NAK,
  RUN_SCRIPT, // from web server
  RUN_SCRIPT_ACK,
  RUN_SCRIPT_NAK,
  PANIC_STOP, // from web server
  RUN_COMMAND, // from web server
  RUN_COMMAND_ACK,
  RUN_COMMAND_NAK,
  FORMAT_SD, // from web server
  FORMAT_SD_ACK,
  FORMAT_SD_NAK,
  SERVO_TEST, // from web server
  SERVO_TEST_ACK,

  // Firmware OTA wire protocol; see .docs/protocol.md § A. Reserved range
  // 30-40. Numeric values are explicit so a future insertion above this
  // block does not silently shift them. AstrOs.ESP must hold the same
  // numbers — both copies of .docs/protocol.md are the source of truth.
  FW_TRANSFER_BEGIN = 30, // from web server
  FW_TRANSFER_BEGIN_ACK = 31,
  FW_CHUNK = 32, // from web server
  FW_CHUNK_ACK = 33,
  FW_CHUNK_NAK = 34,
  FW_TRANSFER_END = 35, // from web server
  FW_TRANSFER_END_ACK = 36,
  FW_DEPLOY_BEGIN = 37, // from web server
  FW_PROGRESS = 38,
  FW_DEPLOY_DONE = 39,
  FW_BACKPRESSURE = 40,
}

export class SerialMsgConst {
  static readonly REGISTRATION_SYNC = 'REGISTRATION_SYNC';
  static readonly REGISTRATION_SYNC_ACK = 'REGISTRATION_SYNC_ACK';
  static readonly POLL_ACK = 'POLL_ACK';
  static readonly POLL_NAK = 'POLL_NAK';
  static readonly DEPLOY_CONFIG = 'DEPLOY_CONFIG';
  static readonly DEPLOY_CONFIG_ACK = 'DEPLOY_CONFIG_ACK';
  static readonly DEPLOY_CONFIG_NAK = 'DEPLOY_CONFIG_NAK';
  static readonly DEPLOY_SCRIPT = 'DEPLOY_SCRIPT';
  static readonly DEPLOY_SCRIPT_ACK = 'DEPLOY_SCRIPT_ACK';
  static readonly DEPLOY_SCRIPT_NAK = 'DEPLOY_SCRIPT_NAK';
  static readonly RUN_SCRIPT = 'RUN_SCRIPT';
  static readonly RUN_SCRIPT_ACK = 'RUN_SCRIPT_ACK';
  static readonly RUN_SCRIPT_NAK = 'RUN_SCRIPT_NAK';
  static readonly PANIC_STOP = 'PANIC_STOP';
  static readonly RUN_COMMAND = 'RUN_COMMAND';
  static readonly RUN_COMMAND_ACK = 'RUN_COMMAND_ACK';
  static readonly RUN_COMMAND_NAK = 'RUN_COMMAND_NAK';
  static readonly FORMAT_SD = 'FORMAT_SD';
  static readonly FORMAT_SD_ACK = 'FORMAT_SD_ACK';
  static readonly FORMAT_SD_NAK = 'FORMAT_SD_NAK';
  static readonly SERVO_TEST = 'SERVO_TEST';
  static readonly SERVO_TEST_ACK = 'SERVO_TEST_ACK';

  static readonly FW_TRANSFER_BEGIN = 'FW_TRANSFER_BEGIN';
  static readonly FW_TRANSFER_BEGIN_ACK = 'FW_TRANSFER_BEGIN_ACK';
  static readonly FW_CHUNK = 'FW_CHUNK';
  static readonly FW_CHUNK_ACK = 'FW_CHUNK_ACK';
  static readonly FW_CHUNK_NAK = 'FW_CHUNK_NAK';
  static readonly FW_TRANSFER_END = 'FW_TRANSFER_END';
  static readonly FW_TRANSFER_END_ACK = 'FW_TRANSFER_END_ACK';
  static readonly FW_DEPLOY_BEGIN = 'FW_DEPLOY_BEGIN';
  static readonly FW_PROGRESS = 'FW_PROGRESS';
  static readonly FW_DEPLOY_DONE = 'FW_DEPLOY_DONE';
  static readonly FW_BACKPRESSURE = 'FW_BACKPRESSURE';
}

export interface SerialMsgValidationResult {
  valid: boolean;
  type: SerialMessageType;
  id: string;
  data: string;
}

export function createValidationResult(): SerialMsgValidationResult {
  return {
    valid: false,
    type: SerialMessageType.UNKNOWN,
    id: '',
    data: '',
  };
}

export class SerialMessage {
  public type: SerialMessageType;
  public node: string;
  public payload: string;

  constructor(type: SerialMessageType, node: string, payload: string) {
    this.type = type;
    this.node = node;
    this.payload = payload;
  }

  public static fromString(message: string): SerialMessage {
    const parts = message.split('|');
    if (parts.length !== 2) throw new Error(`Invalid message: ${message}`);
    const type = SerialMessageType[parts[0] as keyof typeof SerialMessageType];
    return new SerialMessage(type, parts[1], parts[2]);
  }

  public toString(): string {
    return `${SerialMessageType[this.type]}|${this.node}|${this.payload}`;
  }
}
