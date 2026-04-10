import { logger } from 'src/logger.js';
import { SerialMessageType, createValidationResult } from './serial_message.js';
import { MessageHelper } from './message_helper.js';
import { SerialWorkerResponseType } from './serial_worker_response.js';
import type {
  ConfigSyncResponse,
  PollRepsonse,
  RegistrationResponse,
  ScriptDeployResponse,
  ScriptRunResponse,
} from './serial_worker_response.js';
import type { SerialMsgValidationResult } from './serial_message.js';
import type { ControlModule } from 'src/models/index.js';

//|--type--|--validation--|---msg Id---|---------------payload-------------|
//|--int---RS---string----RS--string---GS--val--US--val--RS--val--US--val--|

export class MessageHandler {
  public validateMessage(msg: string): SerialMsgValidationResult {
    const result = createValidationResult();

    const groups = msg.split(MessageHelper.GS);
    if (groups.length !== 2) {
      logger.error(`Invalid message: ${msg}`);
      return result;
    }

    const header = groups[0].split(MessageHelper.RS);

    if (header.length !== 3) {
      logger.error(`Invalid header: ${groups[0]}`);
      return result;
    }

    const type = parseInt(header[0]);

    if (isNaN(type)) {
      logger.error(`Invalid message type: ${header[0]}`);
      return result;
    }

    result.valid = header[1] === MessageHelper.ValidationMap.get(type);

    if (result.valid) {
      result.type = type;
      result.id = header[2];

      if (groups.length > 1) {
        result.data = groups[1];
      }
    }

    return result;
  }

  public handlePollAck(msg: string): PollRepsonse {
    const response = { type: SerialWorkerResponseType.POLL } as PollRepsonse;

    const parts = msg.split(MessageHelper.US);

    if (parts.length !== 3) {
      logger.error(`Invalid poll ack: ${msg}`);
      response.type = SerialWorkerResponseType.UNKNOWN;
      return response;
    }

    const module: ControlModule = { id: '', name: parts[1], address: parts[0] };
    module.fingerprint = parts[2];
    response.controller = module;

    return response;
  }

  public handleRegistraionSyncAck(msg: string): RegistrationResponse {
    const response: RegistrationResponse = { type: SerialWorkerResponseType.REGISTRATION_SYNC, success: true, registrations: [] };

    const records = msg.split(MessageHelper.RS);

    for (const record of records) {
      const units = record.split(MessageHelper.US);

      if (units.length < 2) {
        logger.error(`Invalid registration record: ${record}`);
        continue;
      }

      const module: ControlModule = { id: '', name: units[1], address: units[0] };

      response.registrations.push(module);
    }

    return response;
  }

  handleDeployConfigAck(msg: string): ConfigSyncResponse {
    const response = { type: SerialWorkerResponseType.CONFIG_SYNC, success: true } as ConfigSyncResponse;

    const parts = msg.split(MessageHelper.US);

    if (parts.length < 3) {
      logger.error(`Invalid deploy ack: ${msg}`);
      response.type = SerialWorkerResponseType.UNKNOWN;
      return response;
    }

    const module: ControlModule = { id: '', name: parts[1], address: parts[0] };
    module.fingerprint = parts[2];
    response.controller = module;

    return response;
  }

  handleDeployScriptAckNak(type: SerialMessageType, msg: string): ScriptDeployResponse {
    const parts = msg.split(MessageHelper.US);

    if (parts.length < 3) {
      logger.error(`Invalid script deploy ack/nak: ${msg}`);

      return {
        success: false,
        type: SerialWorkerResponseType.UNKNOWN,
      } as ScriptDeployResponse;
    }

    const success = type === SerialMessageType.DEPLOY_SCRIPT_ACK;

    const response = { type: SerialWorkerResponseType.SCRIPT_DEPLOY, success, scriptId: parts[2] } as ScriptDeployResponse;

    const module: ControlModule = { id: '', name: parts[1], address: parts[0] };
    response.controller = module;

    return response;
  }

  handleRunScriptAckNak(type: SerialMessageType, msg: string): ScriptRunResponse {
    const parts = msg.split(MessageHelper.US);

    if (parts.length < 3) {
      logger.error(`Invalid script run ack/nak: ${msg}`);

      return {
        success: false,
        type: SerialWorkerResponseType.UNKNOWN,
      } as ScriptRunResponse;
    }

    const success = type === SerialMessageType.RUN_SCRIPT_ACK;

    const response = { type: SerialWorkerResponseType.SCRIPT_RUN, success, scriptId: parts[2] } as ScriptRunResponse;

    const module: ControlModule = { id: '', name: parts[1], address: parts[0] };
    response.controller = module;

    return response;
  }
}
