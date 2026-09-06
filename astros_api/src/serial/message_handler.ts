import { logger } from 'src/logger.js';
import { SerialMessageType, createValidationResult } from './serial_message.js';
import { MessageHelper } from './message_helper.js';
import { SerialWorkerResponseType } from './serial_worker_response.js';
import type {
  ConfigSyncResponse,
  PollNakResponse,
  FwBackpressureResponse,
  FwChunkAckResponse,
  FwChunkNakResponse,
  FwDeployDoneResponse,
  FwProgressResponse,
  FwTransferBeginAckResponse,
  FwTransferEndAckResponse,
  PollResponse,
  RegistrationResponse,
  ScriptDeployResponse,
  ScriptRunResponse,
  UnknownSerialResponse,
} from './serial_worker_response.js';
import type { SerialMsgValidationResult } from './serial_message.js';
import type { ControlModule } from 'src/models/index.js';
import {
  FW_BACKPRESSURE_ACTIONS,
  FW_CHUNK_NAK_REASONS,
  FW_DEPLOY_OUTCOMES,
  FW_SERIAL_SLIDING_WINDOW,
  FW_TRANSFER_END_STATUSES,
  FwStage,
  type FwBackpressureAction,
  type FwChunkNakReason,
  type FwDeployDoneResult,
  type FwDeployOutcome,
  type FwTransferEndStatus,
} from 'src/models/firmware/firmware_messages.js';

// Runtime validation sets — derived directly from the const tuples in
// firmware_messages.ts so the type and runtime checks share a single source.
// Adding a new value to e.g. FW_CHUNK_NAK_REASONS automatically extends both
// FwChunkNakReason and FW_CHUNK_NAK_REASON_SET below.
const FW_CHUNK_NAK_REASON_SET: ReadonlySet<FwChunkNakReason> = new Set(FW_CHUNK_NAK_REASONS);
const FW_TRANSFER_END_STATUS_SET: ReadonlySet<FwTransferEndStatus> = new Set(
  FW_TRANSFER_END_STATUSES,
);
const FW_BACKPRESSURE_ACTION_SET: ReadonlySet<FwBackpressureAction> = new Set(
  FW_BACKPRESSURE_ACTIONS,
);
const FW_DEPLOY_OUTCOME_SET: ReadonlySet<FwDeployOutcome> = new Set(FW_DEPLOY_OUTCOMES);
const FW_STAGE_VALUES: ReadonlySet<FwStage> = new Set(Object.values(FwStage));

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

  public handlePollAck(msg: string): PollResponse {
    const response = { type: SerialWorkerResponseType.POLL } as PollResponse;

    const parts = msg.split(MessageHelper.US);

    // Legacy firmware sends 3 fields (mac, name, fingerprint); firmware 1.2.0+
    // adds firmwareVersion as the 4th; the OTA-flash firmware release adds
    // variant as the 5th. See .docs/protocol.md.
    if (parts.length < 3 || parts.length > 5) {
      logger.error(`Invalid poll ack: ${msg}`);
      response.type = SerialWorkerResponseType.UNKNOWN;
      return response;
    }

    const module: ControlModule = { id: '', name: parts[1], address: parts[0] };
    module.fingerprint = parts[2];
    if (parts.length >= 4) {
      const version = parts[3].trim();
      if (version.length > 0) {
        module.firmwareVersion = version;
      }
    }
    if (parts.length === 5) {
      const variant = parts[4].trim();
      if (variant.length > 0) {
        module.variant = variant;
      }
    }
    response.controller = module;

    return response;
  }

  public handlePollNak(msg: string): PollNakResponse | UnknownSerialResponse {
    const parts = msg.split(MessageHelper.US);

    // Wire contract: mac{US}name, exactly 2 fields — see AstrOs.ESP
    // AstrOsSerialMessageService::getPollNak.
    if (parts.length !== 2 || parts[0].length === 0) {
      logger.error(`Invalid poll nak: ${msg}`);
      return { type: SerialWorkerResponseType.UNKNOWN };
    }

    return {
      type: SerialWorkerResponseType.POLL_NAK,
      controller: { address: parts[0], name: parts[1] },
    };
  }

  public handleRegistraionSyncAck(msg: string): RegistrationResponse {
    const response: RegistrationResponse = {
      type: SerialWorkerResponseType.REGISTRATION_SYNC,
      success: true,
      registrations: [],
    };

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
    const response = {
      type: SerialWorkerResponseType.CONFIG_SYNC,
      success: true,
    } as ConfigSyncResponse;

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

    const response = {
      type: SerialWorkerResponseType.SCRIPT_DEPLOY,
      success,
      scriptId: parts[2],
    } as ScriptDeployResponse;

    const module: ControlModule = { id: '', name: parts[1], address: parts[0] };
    response.controller = module;

    return response;
  }

  // ---------------------------------------------------------------------------
  // Firmware OTA incoming messages — see .docs/protocol.md § A.
  // ---------------------------------------------------------------------------

  handleFwTransferBeginAck(msg: string): FwTransferBeginAckResponse | UnknownSerialResponse {
    const parts = msg.split(MessageHelper.US);
    if (parts.length !== 2) {
      logger.error(`Invalid FW_TRANSFER_BEGIN_ACK: ${msg}`);
      return { type: SerialWorkerResponseType.UNKNOWN };
    }

    return {
      type: SerialWorkerResponseType.FW_TRANSFER_BEGIN_ACK,
      payload: { transferId: parts[0], status: parts[1] },
    };
  }

  handleFwChunkAck(msg: string): FwChunkAckResponse | UnknownSerialResponse {
    const parts = msg.split(MessageHelper.US);
    if (parts.length !== 4) {
      logger.error(`Invalid FW_CHUNK_ACK: ${msg}`);
      return { type: SerialWorkerResponseType.UNKNOWN };
    }

    const highest = MessageHelper.parseUint(parts[1]);
    const next = MessageHelper.parseUint(parts[2]);
    const window = MessageHelper.parseUint(parts[3]);
    if (highest === null || next === null || window === null) {
      logger.error(`FW_CHUNK_ACK has non-numeric or malformed fields: ${msg}`);
      return { type: SerialWorkerResponseType.UNKNOWN };
    }

    if (window > FW_SERIAL_SLIDING_WINDOW) {
      logger.error(
        `FW_CHUNK_ACK windowRemaining ${window} exceeds configured sliding window ${FW_SERIAL_SLIDING_WINDOW}: ${msg}`,
      );
      return { type: SerialWorkerResponseType.UNKNOWN };
    }

    return {
      type: SerialWorkerResponseType.FW_CHUNK_ACK,
      payload: {
        transferId: parts[0],
        highestContiguousSeq: highest,
        nextExpectedSeq: next,
        windowRemaining: window,
      },
    };
  }

  handleFwChunkNak(msg: string): FwChunkNakResponse | UnknownSerialResponse {
    const parts = msg.split(MessageHelper.US);
    if (parts.length !== 4) {
      logger.error(`Invalid FW_CHUNK_NAK: ${msg}`);
      return { type: SerialWorkerResponseType.UNKNOWN };
    }

    const lastGoodSeq = MessageHelper.parseUint(parts[1]);
    if (lastGoodSeq === null) {
      logger.error(`FW_CHUNK_NAK lastGoodSeq is not a valid unsigned integer: ${msg}`);
      return { type: SerialWorkerResponseType.UNKNOWN };
    }

    const nextExpectedSeq = MessageHelper.parseUint(parts[2]);
    if (nextExpectedSeq === null) {
      logger.error(`FW_CHUNK_NAK nextExpectedSeq is not a valid unsigned integer: ${msg}`);
      return { type: SerialWorkerResponseType.UNKNOWN };
    }

    const reason = parts[3] as FwChunkNakReason;
    if (!FW_CHUNK_NAK_REASON_SET.has(reason)) {
      logger.error(`FW_CHUNK_NAK has unknown reason: ${parts[3]}`);
      return { type: SerialWorkerResponseType.UNKNOWN };
    }

    return {
      type: SerialWorkerResponseType.FW_CHUNK_NAK,
      payload: { transferId: parts[0], lastGoodSeq, nextExpectedSeq, reasonCode: reason },
    };
  }

  handleFwTransferEndAck(msg: string): FwTransferEndAckResponse | UnknownSerialResponse {
    const parts = msg.split(MessageHelper.US);
    if (parts.length !== 3) {
      logger.error(`Invalid FW_TRANSFER_END_ACK: ${msg}`);
      return { type: SerialWorkerResponseType.UNKNOWN };
    }

    const status = parts[1] as FwTransferEndStatus;
    if (!FW_TRANSFER_END_STATUS_SET.has(status)) {
      logger.error(`FW_TRANSFER_END_ACK has unknown status: ${parts[1]}`);
      return { type: SerialWorkerResponseType.UNKNOWN };
    }

    const computedSha256Hex = MessageHelper.parseSha256Hex(parts[2]);
    if (computedSha256Hex === null) {
      logger.error(
        `FW_TRANSFER_END_ACK has malformed sha256 (expected 64 lowercase hex chars): ${parts[2]}`,
      );
      return { type: SerialWorkerResponseType.UNKNOWN };
    }

    return {
      type: SerialWorkerResponseType.FW_TRANSFER_END_ACK,
      payload: { transferId: parts[0], status, computedSha256Hex },
    };
  }

  handleFwProgress(msg: string): FwProgressResponse | UnknownSerialResponse {
    const parts = msg.split(MessageHelper.US);
    if (parts.length !== 6) {
      logger.error(`Invalid FW_PROGRESS: ${msg}`);
      return { type: SerialWorkerResponseType.UNKNOWN };
    }

    const stage = parts[2] as FwStage;
    if (!FW_STAGE_VALUES.has(stage)) {
      logger.error(`FW_PROGRESS has unknown stage: ${parts[2]}`);
      return { type: SerialWorkerResponseType.UNKNOWN };
    }

    const bytesSent = MessageHelper.parseUint(parts[3]);
    const totalBytes = MessageHelper.parseUint(parts[4]);
    if (bytesSent === null || totalBytes === null) {
      logger.error(`FW_PROGRESS has non-numeric or malformed byte counts: ${msg}`);
      return { type: SerialWorkerResponseType.UNKNOWN };
    }

    return {
      type: SerialWorkerResponseType.FW_PROGRESS,
      payload: {
        transferId: parts[0],
        controllerId: parts[1],
        stage,
        bytesSent,
        totalBytes,
        detail: parts[5],
      },
    };
  }

  handleFwDeployDone(msg: string): FwDeployDoneResponse | UnknownSerialResponse {
    // Wire format: transfer-id<US>result_1<RS>result_2<RS>...
    // where result = controllerId<US>outcome<US>finalVersion<US>error
    // We split only on the first US to keep the result list intact, then split
    // the result list on RS, then split each result on US.
    const firstUs = msg.indexOf(MessageHelper.US);
    if (firstUs < 0) {
      logger.error(`Invalid FW_DEPLOY_DONE (no transferId separator): ${msg}`);
      return { type: SerialWorkerResponseType.UNKNOWN };
    }

    const transferId = msg.substring(0, firstUs);
    const resultListStr = msg.substring(firstUs + 1);
    const resultStrs = resultListStr.split(MessageHelper.RS);
    const results: FwDeployDoneResult[] = [];

    for (const resultStr of resultStrs) {
      const fields = resultStr.split(MessageHelper.US);
      if (fields.length !== 4) {
        logger.error(`Invalid FW_DEPLOY_DONE result: ${resultStr}`);
        return { type: SerialWorkerResponseType.UNKNOWN };
      }

      const outcome = fields[1] as FwDeployOutcome;
      if (!FW_DEPLOY_OUTCOME_SET.has(outcome)) {
        logger.error(`FW_DEPLOY_DONE has unknown outcome: ${outcome}`);
        return { type: SerialWorkerResponseType.UNKNOWN };
      }

      const finalVersion = fields[2];
      const error = fields[3];

      // Cross-field invariants — each outcome enforces its own contract.
      //   OK: error must be empty (success leaves no error).
      //   PENDING: master self-flash success row; emitted BEFORE master
      //            reboots so finalVersion must be empty. A populated value
      //            indicates a firmware regression — reject the frame.
      //   FAILED: error is expected to be populated by firmware, but is NOT
      //           validated here — an empty FAILED error is accepted as a
      //           degenerate-but-non-contradictory state (no finalVersion
      //           constraint either).
      if (outcome === 'OK' && error !== '') {
        logger.error(`FW_DEPLOY_DONE OK result has non-empty error: ${error}`);
        return { type: SerialWorkerResponseType.UNKNOWN };
      }
      if (outcome === 'PENDING' && finalVersion !== '') {
        logger.error(`FW_DEPLOY_DONE PENDING result has non-empty finalVersion: ${finalVersion}`);
        return { type: SerialWorkerResponseType.UNKNOWN };
      }

      results.push({
        controllerId: fields[0],
        outcome,
        finalVersion,
        error,
      });
    }

    return {
      type: SerialWorkerResponseType.FW_DEPLOY_DONE,
      payload: { transferId, results },
    };
  }

  handleFwBackpressure(msg: string): FwBackpressureResponse | UnknownSerialResponse {
    const parts = msg.split(MessageHelper.US);
    if (parts.length !== 3) {
      logger.error(`Invalid FW_BACKPRESSURE: ${msg}`);
      return { type: SerialWorkerResponseType.UNKNOWN };
    }

    const action = parts[1] as FwBackpressureAction;
    if (!FW_BACKPRESSURE_ACTION_SET.has(action)) {
      logger.error(`FW_BACKPRESSURE has unknown action: ${parts[1]}`);
      return { type: SerialWorkerResponseType.UNKNOWN };
    }

    return {
      type: SerialWorkerResponseType.FW_BACKPRESSURE,
      payload: { transferId: parts[0], action, reason: parts[2] },
    };
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

    const response = {
      type: SerialWorkerResponseType.SCRIPT_RUN,
      success,
      scriptId: parts[2],
    } as ScriptRunResponse;

    const module: ControlModule = { id: '', name: parts[1], address: parts[0] };
    response.controller = module;

    return response;
  }
}
