import { SerialMessageType, SerialMsgConst } from "./serial_message";

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
    [SerialMessageType.RUN_COMMAND, SerialMsgConst.RUN_COMMAND],
    [SerialMessageType.RUN_COMMAND_ACK, SerialMsgConst.RUN_COMMAND_ACK],
    [SerialMessageType.RUN_COMMAND_NAK, SerialMsgConst.RUN_COMMAND_NAK]
  ]);

  public static readonly MessageTimeouts: Map<SerialMessageType, number> = new Map([
    [SerialMessageType.REGISTRATION_SYNC, 5000],
    [SerialMessageType.DEPLOY_SCRIPT, 5000],
    [SerialMessageType.RUN_SCRIPT, 5000],
    [SerialMessageType.RUN_COMMAND, 5000]
  ]);

  static uint8ArrayToNum(arr: Uint8Array): number {
    let num = 0;

    for (let i = 7; i >= 0; i--) {
      num = num * 256 + arr[i];
    }

    return num;
  }

}