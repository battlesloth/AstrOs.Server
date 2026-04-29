import { SerialMessageType, SerialMsgConst } from './serial_message.js';

export class MessageHelper {
  public static readonly GS = '\u001d';
  public static readonly RS = '\u001e';
  public static readonly US = '\u001f';

  public static readonly MessageEOL = '\n';

  public static readonly ValidationMap: Map<SerialMessageType, string> = new Map([
    [SerialMessageType.REGISTRATION_SYNC, SerialMsgConst.REGISTRATION_SYNC],
    [SerialMessageType.REGISTRATION_SYNC_ACK, SerialMsgConst.REGISTRATION_SYNC_ACK],
    [SerialMessageType.POLL_ACK, SerialMsgConst.POLL_ACK],
    [SerialMessageType.POLL_NAK, SerialMsgConst.POLL_NAK],
    [SerialMessageType.DEPLOY_CONFIG, SerialMsgConst.DEPLOY_CONFIG],
    [SerialMessageType.DEPLOY_CONFIG_ACK, SerialMsgConst.DEPLOY_CONFIG_ACK],
    [SerialMessageType.DEPLOY_CONFIG_NAK, SerialMsgConst.DEPLOY_CONFIG_NAK],
    [SerialMessageType.DEPLOY_SCRIPT, SerialMsgConst.DEPLOY_SCRIPT],
    [SerialMessageType.DEPLOY_SCRIPT_ACK, SerialMsgConst.DEPLOY_SCRIPT_ACK],
    [SerialMessageType.DEPLOY_SCRIPT_NAK, SerialMsgConst.DEPLOY_SCRIPT_NAK],
    [SerialMessageType.RUN_SCRIPT, SerialMsgConst.RUN_SCRIPT],
    [SerialMessageType.RUN_SCRIPT_ACK, SerialMsgConst.RUN_SCRIPT_ACK],
    [SerialMessageType.RUN_SCRIPT_NAK, SerialMsgConst.RUN_SCRIPT_NAK],
    [SerialMessageType.PANIC_STOP, SerialMsgConst.PANIC_STOP],
    [SerialMessageType.RUN_COMMAND, SerialMsgConst.RUN_COMMAND],
    [SerialMessageType.RUN_COMMAND_ACK, SerialMsgConst.RUN_COMMAND_ACK],
    [SerialMessageType.RUN_COMMAND_NAK, SerialMsgConst.RUN_COMMAND_NAK],
    [SerialMessageType.FORMAT_SD, SerialMsgConst.FORMAT_SD],
    [SerialMessageType.FORMAT_SD_ACK, SerialMsgConst.FORMAT_SD_ACK],
    [SerialMessageType.FORMAT_SD_NAK, SerialMsgConst.FORMAT_SD_NAK],
    [SerialMessageType.SERVO_TEST, SerialMsgConst.SERVO_TEST],

    // Firmware OTA wire protocol — see .docs/protocol.md § A.
    [SerialMessageType.FW_TRANSFER_BEGIN, SerialMsgConst.FW_TRANSFER_BEGIN],
    [SerialMessageType.FW_TRANSFER_BEGIN_ACK, SerialMsgConst.FW_TRANSFER_BEGIN_ACK],
    [SerialMessageType.FW_CHUNK, SerialMsgConst.FW_CHUNK],
    [SerialMessageType.FW_CHUNK_ACK, SerialMsgConst.FW_CHUNK_ACK],
    [SerialMessageType.FW_CHUNK_NAK, SerialMsgConst.FW_CHUNK_NAK],
    [SerialMessageType.FW_TRANSFER_END, SerialMsgConst.FW_TRANSFER_END],
    [SerialMessageType.FW_TRANSFER_END_ACK, SerialMsgConst.FW_TRANSFER_END_ACK],
    [SerialMessageType.FW_DEPLOY_BEGIN, SerialMsgConst.FW_DEPLOY_BEGIN],
    [SerialMessageType.FW_PROGRESS, SerialMsgConst.FW_PROGRESS],
    [SerialMessageType.FW_DEPLOY_DONE, SerialMsgConst.FW_DEPLOY_DONE],
    [SerialMessageType.FW_BACKPRESSURE, SerialMsgConst.FW_BACKPRESSURE],
  ]);

  public static readonly MessageTimeouts: Map<SerialMessageType, number> = new Map([
    [SerialMessageType.REGISTRATION_SYNC, 5000],
    [SerialMessageType.DEPLOY_CONFIG, 5000],
    [SerialMessageType.DEPLOY_SCRIPT, 5000],
    [SerialMessageType.RUN_SCRIPT, 5000],
    [SerialMessageType.RUN_COMMAND, 5000],

    // Firmware OTA outgoing types. FW_CHUNK uses the protocol's per-frame
    // ACK timeout (1500 ms); the others are job-level handshakes.
    [SerialMessageType.FW_TRANSFER_BEGIN, 5000],
    [SerialMessageType.FW_CHUNK, 1500],
    [SerialMessageType.FW_TRANSFER_END, 5000],
    [SerialMessageType.FW_DEPLOY_BEGIN, 5000],
  ]);

  static uint8ArrayToNum(arr: Uint8Array): number {
    let num = 0;

    for (let i = 7; i >= 0; i--) {
      num = num * 256 + arr[i];
    }

    return num;
  }
}
