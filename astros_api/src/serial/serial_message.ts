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
}

export class SerialMsgConst {
  static readonly REGISTRATION_SYNC = "REGISTRATION_SYNC";
  static readonly REGISTRATION_SYNC_ACK = "REGISTRATION_SYNC_ACK";
  static readonly POLL_ACK = "POLL_ACK";
  static readonly POLL_NAK = "POLL_NAK";
  static readonly DEPLOY_CONFIG = "DEPLOY_CONFIG";
  static readonly DEPLOY_CONFIG_ACK = "DEPLOY_CONFIG_ACK";
  static readonly DEPLOY_CONFIG_NAK = "DEPLOY_CONFIG_NAK";
  static readonly DEPLOY_SCRIPT = "DEPLOY_SCRIPT";
  static readonly DEPLOY_SCRIPT_ACK = "DEPLOY_SCRIPT_ACK";
  static readonly DEPLOY_SCRIPT_NAK = "DEPLOY_SCRIPT_NAK";
  static readonly RUN_SCRIPT = "RUN_SCRIPT";
  static readonly RUN_SCRIPT_ACK = "RUN_SCRIPT_ACK";
  static readonly RUN_SCRIPT_NAK = "RUN_SCRIPT_NAK";
  static readonly PANIC_STOP = "PANIC_STOP";
  static readonly RUN_COMMAND = "RUN_COMMAND";
  static readonly RUN_COMMAND_ACK = "RUN_COMMAND_ACK";
  static readonly RUN_COMMAND_NAK = "RUN_COMMAND_NAK";
  static readonly FORMAT_SD = "FORMAT_SD";
  static readonly FORMAT_SD_ACK = "FORMAT_SD_ACK";
  static readonly FORMAT_SD_NAK = "FORMAT_SD_NAK";
  static readonly SERVO_TEST = "SERVO_TEST";
  static readonly SERVO_TEST_ACK = "SERVO_TEST_ACK";
}

export class SerialMsgValidationResult {
  public valid: boolean;
  public type: SerialMessageType;
  public id: string;
  public data: string;

  constructor() {
    this.valid = false;
    this.type = SerialMessageType.UNKNOWN;
    this.id = "";
    this.data = "";
  }
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
    const parts = message.split("|");
    if (parts.length !== 2) throw new Error(`Invalid message: ${message}`);
    const type = SerialMessageType[parts[0] as keyof typeof SerialMessageType];
    return new SerialMessage(type, parts[1], parts[2]);
  }

  public toString(): string {
    return `${SerialMessageType[this.type]}|${this.node}|${this.payload}`;
  }
}
