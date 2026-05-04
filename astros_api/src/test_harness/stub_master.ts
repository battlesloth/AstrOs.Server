// Scriptable wire-protocol responder for the firmware OTA integration test
// harness. The stub master opens one end of a PTY pair (created by
// `createPtyPair`) and mimics just enough of the AstrOs ESP32 master
// firmware's wire-protocol surface to satisfy the orchestrator/streamer
// during tests. It is a *test fake*, not a behavior simulator — real
// firmware behavior simulation lives in AstrOs.ESP.
//
// Task 2 (this file) covers the raw read/write skeleton:
//   - Opens a SerialPort + DelimiterParser on the master end of a PTY.
//   - Parses inbound (server-emitted) frames into `{ type, msgId, payload }`.
//   - Exposes typed outbound writers for every master→server message family
//     in the protocol (FW_TRANSFER_BEGIN_ACK, FW_CHUNK_ACK, FW_CHUNK_NAK,
//     FW_TRANSFER_END_ACK, FW_PROGRESS, FW_DEPLOY_DONE, FW_BACKPRESSURE,
//     POLL_ACK).
//   - Exposes a `waitForFrame()` synchronization helper for deterministic
//     test orchestration.
//
// The scripted-response API (auto-ack of uploads, deploy scripting) is a
// separate concern and lands in Task 3 — keep this module focused on raw
// I/O so Task 3 can layer on top without touching the wire format.

import { SerialPort } from 'serialport';
import { DelimiterParser } from '@serialport/parser-delimiter';
import { v4 as uuid_v4 } from 'uuid';

import { MessageHelper } from '../serial/message_helper.js';
import { SerialMessageType } from '../serial/serial_message.js';
import {
  FW_SERIAL_SLIDING_WINDOW,
  type FwBackpressureAction,
  type FwChunkNakReason,
  type FwStage,
  type FwTransferEndStatus,
} from '../models/firmware/firmware_messages.js';

// ---------------------------------------------------------------------------
// Construction options
// ---------------------------------------------------------------------------

export interface StubMasterOpts {
  ptyPath: string;
  // Sentinel MAC for the master per project convention (per
  // project_master_esp_sentinel_mac memory). Real firmware always reports
  // POLL_ACK with this address from the master; padawans send their own MACs.
  masterMac?: string;
  masterFingerprint?: string;
  masterFirmwareVersion?: string;
  masterVariant?: string;
}

const DEFAULT_MASTER_MAC = '00:00:00:00:00:00';
const DEFAULT_MASTER_FINGERPRINT = 'master-stub';
const DEFAULT_MASTER_FIRMWARE_VERSION = '1.0.0';
const DEFAULT_MASTER_VARIANT = 'astros-master-test-variant';

// ---------------------------------------------------------------------------
// Inbound frame shape (parsed from server-emitted lines)
// ---------------------------------------------------------------------------

export interface InboundFrame {
  type: SerialMessageType;
  msgId: string;
  // Raw payload bytes after the GS separator, unparsed. Tests can match on
  // this directly (e.g. assert it contains a transferId substring); Task 3
  // will layer per-type field decoding for the scripted-response API.
  payload: string;
}

// ---------------------------------------------------------------------------
// Outbound writer argument shapes. Each maps 1:1 to a single wire frame
// addressed to the server. Field layouts mirror the parsers in
// MessageHandler — that file is the source of truth for count + order.
// ---------------------------------------------------------------------------

export interface FwTransferBeginAckArgs {
  transferId: string;
  // The handler accepts an open-ended status string (per protocol.md), but
  // for the test fake we expose a `windowSize` knob and serialize it as the
  // status field's stand-in. In practice firmware sends "OK" + a separate
  // window-size advertisement on the FW_CHUNK_ACK stream; this fake compresses
  // both into the begin-ack so tests can declare the window upfront.
  // NOTE: this matches how serial_bus_response_test.ts and the streamer's
  // begin-ack consumer treat the field — they just record `status` as a
  // string and ignore its content, so any value works for round-trip tests.
  windowSize?: number;
  msgId?: string;
}

export interface FwChunkAckArgs {
  transferId: string;
  highestContiguousSeq: number;
  // Handler reads this as `nextExpectedSeq`, not bytesSent — see
  // MessageHandler.handleFwChunkAck. The 4-field layout is:
  //   transferId<US>highestContiguousSeq<US>nextExpectedSeq<US>windowRemaining
  nextExpectedSeq: number;
  windowRemaining?: number;
  msgId?: string;
}

export interface FwChunkNakArgs {
  transferId: string;
  lastGoodSeq: number;
  // Reason codes come from FW_CHUNK_NAK_REASONS in firmware_messages.ts —
  // that const tuple is the protocol source of truth. Allowed values:
  // 'CRC' | 'SIZE' | 'OUT_OF_ORDER' | 'FLASH_FULL'.
  reasonCode: FwChunkNakReason;
  msgId?: string;
}

export interface FwTransferEndAckArgs {
  transferId: string;
  // Status enum from FW_TRANSFER_END_STATUSES: 'OK' | 'HASH_MISMATCH' |
  // 'IO_ERROR'.
  status: FwTransferEndStatus;
  // 64 lowercase hex chars — the handler's parseSha256Hex enforces that.
  computedSha256Hex: string;
  msgId?: string;
}

export interface FwProgressArgs {
  transferId: string;
  controllerId: string;
  stage: FwStage;
  bytesSent: number;
  totalBytes: number;
  detail?: string;
  msgId?: string;
}

export interface FwDeployDoneResultArg {
  controllerId: string;
  outcome: 'OK' | 'FAILED';
  // Cross-field invariant from protocol.md (also enforced by the server's
  // handler at handleFwDeployDone): if outcome === 'OK' then error MUST
  // be ''. The fake does not police this — callers are expected to honor
  // the invariant; emitting OK + non-empty error will produce an UNKNOWN
  // response on the server side.
  finalVersion: string;
  error: string;
}

export interface FwDeployDoneArgs {
  transferId: string;
  results: FwDeployDoneResultArg[];
  msgId?: string;
}

export interface FwBackpressureArgs {
  transferId: string;
  // 'PAUSE' | 'RESUME' (FW_BACKPRESSURE_ACTIONS).
  action: FwBackpressureAction;
  reason: string;
  msgId?: string;
}

export interface PollAckArgs {
  mac?: string;
  fingerprint?: string;
  firmwareVersion?: string;
  variant?: string;
  msgId?: string;
}

// ---------------------------------------------------------------------------
// Internal: pending waitForFrame subscriber bookkeeping
// ---------------------------------------------------------------------------

interface FrameWaiter {
  predicate: (frame: InboundFrame) => boolean;
  resolve: (frame: InboundFrame) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

// ---------------------------------------------------------------------------
// StubMaster — open the PTY, parse inbound, write outbound.
// ---------------------------------------------------------------------------

export class StubMaster {
  private readonly opts: Required<StubMasterOpts>;
  private port: SerialPort | null = null;
  private parser: DelimiterParser | null = null;
  private readonly inbound: InboundFrame[] = [];
  private readonly waiters: FrameWaiter[] = [];

  constructor(opts: StubMasterOpts) {
    this.opts = {
      ptyPath: opts.ptyPath,
      masterMac: opts.masterMac ?? DEFAULT_MASTER_MAC,
      masterFingerprint: opts.masterFingerprint ?? DEFAULT_MASTER_FINGERPRINT,
      masterFirmwareVersion: opts.masterFirmwareVersion ?? DEFAULT_MASTER_FIRMWARE_VERSION,
      masterVariant: opts.masterVariant ?? DEFAULT_MASTER_VARIANT,
    };
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async start(): Promise<void> {
    if (this.port !== null) {
      // start() is idempotent — calling twice without a dispose() is a
      // programming error, but we no-op rather than crash so a test with
      // overzealous setup doesn't blow up before its assertion runs.
      return;
    }

    const port = new SerialPort({
      path: this.opts.ptyPath,
      baudRate: 9600,
      autoOpen: false,
    });

    await new Promise<void>((resolve, reject) => {
      port.open((err) => {
        if (err) {
          reject(new Error(`StubMaster: failed to open PTY ${this.opts.ptyPath}: ${err.message}`));
          return;
        }
        resolve();
      });
    });

    const parser = port.pipe(new DelimiterParser({ delimiter: '\n' }));
    parser.on('data', (chunk: Buffer) => this.handleInboundLine(chunk.toString('utf8')));

    this.port = port;
    this.parser = parser;
  }

  async dispose(): Promise<void> {
    // Reject any outstanding waiters so tests don't hang on a closed port.
    while (this.waiters.length > 0) {
      const waiter = this.waiters.shift();
      if (!waiter) break;
      clearTimeout(waiter.timer);
      waiter.reject(new Error('StubMaster: disposed before frame arrived'));
    }

    const port = this.port;
    this.port = null;
    this.parser = null;

    if (port === null) return;
    if (!port.isOpen) return;

    await new Promise<void>((resolve) => {
      port.close(() => resolve());
    });
  }

  // -------------------------------------------------------------------------
  // Inbound observation
  // -------------------------------------------------------------------------

  receivedFrames(): readonly InboundFrame[] {
    return this.inbound;
  }

  async waitForFrame(
    predicate: (frame: InboundFrame) => boolean,
    timeoutMs = 2000,
  ): Promise<InboundFrame> {
    // Fast-path: scan already-buffered frames first so a test that calls
    // waitForFrame() after the matching frame has already arrived doesn't
    // hang for the full timeout.
    for (const frame of this.inbound) {
      if (predicate(frame)) {
        return frame;
      }
    }

    return new Promise<InboundFrame>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.findIndex((w) => w.timer === timer);
        if (idx >= 0) this.waiters.splice(idx, 1);
        const recent = this.inbound.slice(-5).map((f) => ({
          type: SerialMessageType[f.type] ?? f.type,
          msgId: f.msgId,
          payloadPreview: f.payload.slice(0, 80),
        }));
        reject(
          new Error(
            `StubMaster.waitForFrame: timed out after ${timeoutMs}ms. ` +
              `Recent frames (last 5 of ${this.inbound.length}): ` +
              JSON.stringify(recent),
          ),
        );
      }, timeoutMs);

      this.waiters.push({ predicate, resolve, reject, timer });
    });
  }

  // -------------------------------------------------------------------------
  // Raw write
  // -------------------------------------------------------------------------

  writeRaw(line: string): void {
    if (this.port === null || !this.port.isOpen) {
      throw new Error('StubMaster.writeRaw: port is not open (call start() first)');
    }
    this.port.write(line);
  }

  // -------------------------------------------------------------------------
  // Outbound writers — each builds a properly framed line and writes it.
  //
  // Frame format (mirrors MessageGenerator.generateHeader):
  //   {type}{RS}{validationToken}{RS}{msgId}{GS}{payload}{EOL}
  // -------------------------------------------------------------------------

  writeFwTransferBeginAck(args: FwTransferBeginAckArgs): void {
    const window = args.windowSize ?? FW_SERIAL_SLIDING_WINDOW;
    const payload = [args.transferId, String(window)].join(MessageHelper.US);
    this.writeFrame(SerialMessageType.FW_TRANSFER_BEGIN_ACK, args.msgId, payload);
  }

  writeFwChunkAck(args: FwChunkAckArgs): void {
    const window = args.windowRemaining ?? FW_SERIAL_SLIDING_WINDOW;
    const payload = [
      args.transferId,
      String(args.highestContiguousSeq),
      String(args.nextExpectedSeq),
      String(window),
    ].join(MessageHelper.US);
    this.writeFrame(SerialMessageType.FW_CHUNK_ACK, args.msgId, payload);
  }

  writeFwChunkNak(args: FwChunkNakArgs): void {
    const payload = [args.transferId, String(args.lastGoodSeq), args.reasonCode].join(
      MessageHelper.US,
    );
    this.writeFrame(SerialMessageType.FW_CHUNK_NAK, args.msgId, payload);
  }

  writeFwTransferEndAck(args: FwTransferEndAckArgs): void {
    const payload = [args.transferId, args.status, args.computedSha256Hex].join(MessageHelper.US);
    this.writeFrame(SerialMessageType.FW_TRANSFER_END_ACK, args.msgId, payload);
  }

  writeFwProgress(args: FwProgressArgs): void {
    const payload = [
      args.transferId,
      args.controllerId,
      args.stage,
      String(args.bytesSent),
      String(args.totalBytes),
      args.detail ?? '',
    ].join(MessageHelper.US);
    this.writeFrame(SerialMessageType.FW_PROGRESS, args.msgId, payload);
  }

  writeFwDeployDone(args: FwDeployDoneArgs): void {
    if (args.results.length === 0) {
      // The handler splits resultListStr on RS and then validates each result
      // has 4 US-separated fields. An empty results list would yield a single
      // empty-string entry that fails the field-count check. The fake refuses
      // to produce a frame the handler will reject as UNKNOWN — surface the
      // error at write-time so tests don't get a silent UNKNOWN response.
      throw new Error('StubMaster.writeFwDeployDone: results must contain at least one entry');
    }

    const resultStrs = args.results.map((r) =>
      [r.controllerId, r.outcome, r.finalVersion, r.error].join(MessageHelper.US),
    );
    const payload = [args.transferId, resultStrs.join(MessageHelper.RS)].join(MessageHelper.US);
    this.writeFrame(SerialMessageType.FW_DEPLOY_DONE, args.msgId, payload);
  }

  writeFwBackpressure(args: FwBackpressureArgs): void {
    const payload = [args.transferId, args.action, args.reason].join(MessageHelper.US);
    this.writeFrame(SerialMessageType.FW_BACKPRESSURE, args.msgId, payload);
  }

  writePollAck(args?: PollAckArgs): void {
    const mac = args?.mac ?? this.opts.masterMac;
    const fingerprint = args?.fingerprint ?? this.opts.masterFingerprint;
    const firmwareVersion = args?.firmwareVersion ?? this.opts.masterFirmwareVersion;
    const variant = args?.variant ?? this.opts.masterVariant;
    // 5-field POLL_ACK: mac, name, fingerprint, firmwareVersion, variant.
    // Real master firmware sends the MAC as the "name" field (per
    // project_master_esp_sentinel_mac); we mirror that.
    const payload = [mac, mac, fingerprint, firmwareVersion, variant].join(MessageHelper.US);
    this.writeFrame(SerialMessageType.POLL_ACK, args?.msgId, payload);
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private writeFrame(type: SerialMessageType, msgId: string | undefined, payload: string): void {
    if (this.port === null || !this.port.isOpen) {
      throw new Error(
        `StubMaster.writeFrame(${SerialMessageType[type]}): port is not open (call start() first)`,
      );
    }
    const validation = MessageHelper.ValidationMap.get(type);
    if (validation === undefined) {
      throw new Error(`StubMaster.writeFrame: no validation token for type ${type}`);
    }
    const id = msgId ?? uuid_v4();
    const line = `${type}${MessageHelper.RS}${validation}${MessageHelper.RS}${id}${MessageHelper.GS}${payload}${MessageHelper.MessageEOL}`;
    this.port.write(line);
  }

  private handleInboundLine(line: string): void {
    // The DelimiterParser strips '\n', so `line` here has no trailing newline.
    const frame = parseInbound(line);
    if (frame === null) return;
    this.inbound.push(frame);

    // Notify any waiter whose predicate now matches. Use a copy of the array
    // so a waiter that calls waitForFrame again from inside its resolution
    // doesn't disturb iteration.
    const matched: FrameWaiter[] = [];
    for (let i = this.waiters.length - 1; i >= 0; i--) {
      const waiter = this.waiters[i];
      if (waiter.predicate(frame)) {
        matched.push(waiter);
        this.waiters.splice(i, 1);
      }
    }
    for (const waiter of matched) {
      clearTimeout(waiter.timer);
      waiter.resolve(frame);
    }
  }
}

// ---------------------------------------------------------------------------
// Inbound parser. Matches the shape MessageHandler.validateMessage expects.
// Returns null for any unparseable line so the caller can drop it silently.
// ---------------------------------------------------------------------------

function parseInbound(line: string): InboundFrame | null {
  const groups = line.split(MessageHelper.GS);
  if (groups.length !== 2) return null;

  const headerParts = groups[0].split(MessageHelper.RS);
  if (headerParts.length !== 3) return null;

  const type = parseInt(headerParts[0], 10);
  if (Number.isNaN(type)) return null;

  return {
    type: type as SerialMessageType,
    msgId: headerParts[2],
    payload: groups[1],
  };
}
