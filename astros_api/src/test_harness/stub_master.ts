// Scriptable wire-protocol responder for the firmware OTA integration test
// harness. The stub master opens one end of a PTY pair (created by
// `createPtyPair`) and mimics just enough of the AstrOs ESP32 master
// firmware's wire-protocol surface to satisfy the orchestrator/streamer
// during tests. It is a *test fake*, not a behavior simulator — real
// firmware behavior simulation lives in AstrOs.ESP.
//
// Task 2 covered the raw read/write skeleton:
//   - Opens a SerialPort + DelimiterParser on the master end of a PTY.
//   - Parses inbound (server-emitted) frames into `{ type, msgId, payload }`.
//   - Exposes typed outbound writers for every master→server message family
//     in the protocol (FW_TRANSFER_BEGIN_ACK, FW_CHUNK_ACK, FW_CHUNK_NAK,
//     FW_TRANSFER_END_ACK, FW_PROGRESS, FW_DEPLOY_DONE, FW_BACKPRESSURE,
//     POLL_ACK).
//   - Exposes a `waitForFrame()` synchronization helper for deterministic
//     test orchestration.
//
// Task 3 (this file) adds the scripted-response API on top:
//   - autoAckUpload(): auto-ACK FW_TRANSFER_BEGIN / FW_CHUNK / FW_TRANSFER_END.
//     Supports failAtSeq for one-shot NAK injection (Go-Back-N).
//   - scriptDeploy(opts): on FW_DEPLOY_BEGIN, walk each controller through
//     stage FW_PROGRESS frames then emit FW_DEPLOY_DONE.
//   - disable(feature): turn off a scripted response for timeout tests.

import { SerialPort } from 'serialport';
import { DelimiterParser } from '@serialport/parser-delimiter';
import { v4 as uuid_v4 } from 'uuid';

import { MessageHelper } from '../serial/message_helper.js';
import { SerialMessageType } from '../serial/serial_message.js';
import {
  FW_SERIAL_SLIDING_WINDOW,
  FwStage,
  type FwBackpressureAction,
  type FwChunkNakReason,
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
  // The wire-format `status` field is open-ended (the handler accepts any
  // string), but per chunk_streamer.ts the only value that lets the transfer
  // proceed is 'OK'; any other value aborts with reason 'transfer-rejected'.
  // Tests default to 'OK' (happy path); failure-mode tests pass an explicit
  // value like 'sd_full' to drive the rejection branch.
  status?: string;
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
// Scripted-response API argument shapes (Task 3)
// ---------------------------------------------------------------------------

export interface AutoAckUploadOpts {
  // Sliding window size to advertise in FW_CHUNK_ACK.windowRemaining.
  // Defaults to FW_SERIAL_SLIDING_WINDOW (16). The stub doesn't track actual
  // in-flight count — `windowRemaining` always echoes this value because the
  // streamer's bookkeeping is what matters; fake in-flight tracking would add
  // complexity without test value.
  windowSize?: number;
  // Only 'every' is supported: ACK each FW_CHUNK individually. 'window'-level
  // batching is unused for now; the union is kept narrow to avoid misleading
  // callers. This field is accepted but not read at runtime — the implicit
  // behavior IS 'every', so passing it is a no-op. It exists so tests can
  // document intent explicitly without breaking when 'window' is added later.
  ackCadence?: 'every';
  // Status field for FW_TRANSFER_END_ACK. Default 'OK' (happy path).
  endStatus?: FwTransferEndStatus;
  // If set, NAK exactly once when the first FW_CHUNK with seq === failAtSeq
  // arrives (reasonCode='CRC', lastGoodSeq=failAtSeq-1). Subsequent chunks —
  // including the retransmitted failAtSeq — are ACKed normally.
  failAtSeq?: number;
}

export interface ScriptDeployControllerOpts {
  // Controller MAC — must match what the orchestrator sent in
  // FW_DEPLOY_BEGIN.order so progress frames are attributed correctly.
  id: string;
  outcome: 'OK' | 'FAILED';
  // Required when outcome === 'OK'. Validated at scriptDeploy() call time.
  finalVersion?: string;
  // Required when outcome === 'FAILED'. Validated at scriptDeploy() call time.
  error?: string;
  // FW_PROGRESS stages to emit for this controller before FW_DEPLOY_DONE.
  // Default [Sending, Verifying, Rebooting]. Terminal stages (VersionConfirmed
  // / Failed) come from FW_DEPLOY_DONE, not a final FW_PROGRESS, so they
  // should NOT appear here.
  stages?: FwStage[];
}

export interface ScriptDeployOpts {
  controllers: ScriptDeployControllerOpts[];
}

// ---------------------------------------------------------------------------
// Internal: scripted-response configuration state
// ---------------------------------------------------------------------------

interface AutoAckUploadCfg {
  windowSize: number;
  endStatus: FwTransferEndStatus;
  failAtSeq: number | undefined;
  // Mutable flag: true after the first NAK is emitted for failAtSeq.
  // Reset to false each time autoAckUpload() is called.
  hasFailedOnce: boolean;
}

interface ScriptDeployControllerCfg {
  id: string;
  outcome: 'OK' | 'FAILED';
  finalVersion: string;
  error: string;
  stages: FwStage[];
}

interface ScriptDeployCfg {
  controllers: ScriptDeployControllerCfg[];
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

  // Scripted-response configuration (Task 3). Both are null when the feature
  // is not enabled; set by autoAckUpload() / scriptDeploy(); cleared by
  // disable().
  private autoAckUploadCfg: AutoAckUploadCfg | null = null;
  private scriptDeployCfg: ScriptDeployCfg | null = null;

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
    const status = args.status ?? 'OK';
    const payload = [args.transferId, status].join(MessageHelper.US);
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
  // Scripted-response API (Task 3)
  // -------------------------------------------------------------------------

  // Configure the stub to automatically respond to FW_TRANSFER_BEGIN,
  // FW_CHUNK, and FW_TRANSFER_END. The auto-responses fire BEFORE waiter
  // notifications, so a test that waitForFrame(FW_TRANSFER_BEGIN) will see the
  // ACK already written when its promise resolves.
  autoAckUpload(opts?: AutoAckUploadOpts): void {
    this.autoAckUploadCfg = {
      windowSize: opts?.windowSize ?? FW_SERIAL_SLIDING_WINDOW,
      endStatus: opts?.endStatus ?? 'OK',
      failAtSeq: opts?.failAtSeq,
      // Reset the "failed once" flag on each fresh autoAckUpload() call so
      // re-use across tests within a single StubMaster instance works cleanly.
      hasFailedOnce: false,
    };
  }

  // Configure the stub to automatically respond to FW_DEPLOY_BEGIN. On
  // receipt, the stub emits FW_PROGRESS for each controller's stages then
  // emits FW_DEPLOY_DONE with the configured per-controller outcomes.
  //
  // Validation is done at call time (not response time) so misconfigured tests
  // fail fast rather than producing a mysterious protocol error mid-test.
  scriptDeploy(opts: ScriptDeployOpts): void {
    const controllers: ScriptDeployControllerCfg[] = opts.controllers.map((c) => {
      if (c.outcome === 'OK' && !c.finalVersion) {
        throw new Error(
          `StubMaster.scriptDeploy: controller '${c.id}' has outcome 'OK' but finalVersion is missing`,
        );
      }
      if (c.outcome === 'FAILED' && !c.error) {
        throw new Error(
          `StubMaster.scriptDeploy: controller '${c.id}' has outcome 'FAILED' but error is missing`,
        );
      }
      return {
        id: c.id,
        outcome: c.outcome,
        finalVersion: c.finalVersion ?? '',
        error: c.error ?? '',
        stages: c.stages ?? [FwStage.Sending, FwStage.Verifying, FwStage.Rebooting],
      };
    });
    this.scriptDeployCfg = { controllers };
  }

  // Disable a scripted-response feature. Useful for tests that need to drive
  // protocol-level timeouts (the absence of a response is the assertion).
  disable(feature: 'autoAckUpload' | 'scriptDeploy'): void {
    if (feature === 'autoAckUpload') {
      this.autoAckUploadCfg = null;
    } else {
      this.scriptDeployCfg = null;
    }
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

    // Fire scripted responses BEFORE notifying waiters. Order matters: a test
    // that waitForFrame(FW_TRANSFER_BEGIN) should see the auto-ACK already
    // written on the wire when its promise resolves.
    this.dispatchScriptedResponse(frame);

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

  private dispatchScriptedResponse(frame: InboundFrame): void {
    const cfg = this.autoAckUploadCfg;

    switch (frame.type) {
      case SerialMessageType.FW_TRANSFER_BEGIN: {
        if (cfg === null) break;
        this.writeFwTransferBeginAck({
          transferId: extractTransferId(frame.payload),
          status: 'OK',
        });
        break;
      }

      case SerialMessageType.FW_CHUNK: {
        if (cfg === null) break;
        const chunkParsed = parseFwChunkPayload(frame.payload);
        if (chunkParsed === null) break;
        const { transferId, seq } = chunkParsed;
        // Inject exactly one NAK when this seq matches failAtSeq and we
        // haven't already failed. After that, resume normal ACKing
        // (including for the retransmitted failAtSeq chunk).
        if (cfg.failAtSeq !== undefined && seq === cfg.failAtSeq && !cfg.hasFailedOnce) {
          cfg.hasFailedOnce = true;
          this.writeFwChunkNak({
            transferId,
            lastGoodSeq: seq - 1,
            reasonCode: 'CRC',
          });
        } else {
          this.writeFwChunkAck({
            transferId,
            highestContiguousSeq: seq,
            nextExpectedSeq: seq + 1,
            windowRemaining: cfg.windowSize,
          });
        }
        break;
      }

      case SerialMessageType.FW_TRANSFER_END: {
        if (cfg === null) break;
        const endParsed = parseFwTransferEndPayload(frame.payload);
        if (endParsed === null) break;
        this.writeFwTransferEndAck({
          transferId: endParsed.transferId,
          status: cfg.endStatus,
          // Echo the hash the server sent so the streamer's hash check passes.
          computedSha256Hex: endParsed.finalSha256Hex,
        });
        break;
      }

      case SerialMessageType.FW_DEPLOY_BEGIN: {
        const deployCfg = this.scriptDeployCfg;
        if (deployCfg === null) break;
        const deployParsed = parseFwDeployBeginPayload(frame.payload);
        if (deployParsed === null) break;
        const { transferId } = deployParsed;
        // Walk each controller through its stage progression then emit
        // FW_DEPLOY_DONE. No artificial delay between frames — the
        // orchestrator's per-controller throttle (250ms / 4Hz) means
        // coalescing is acceptable in tests.
        for (const ctrl of deployCfg.controllers) {
          for (const stage of ctrl.stages) {
            this.writeFwProgress({
              transferId,
              controllerId: ctrl.id,
              stage,
              // No actual bytes flow after FW_DEPLOY_BEGIN; using 0 here
              // is correct. Tests asserting on bytesSent should use
              // writeFwProgress directly.
              bytesSent: 0,
              totalBytes: 0,
            });
          }
        }
        this.writeFwDeployDone({
          transferId,
          results: deployCfg.controllers.map((ctrl) => ({
            controllerId: ctrl.id,
            outcome: ctrl.outcome,
            finalVersion: ctrl.finalVersion,
            error: ctrl.error,
          })),
        });
        break;
      }

      default:
        break;
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

// ---------------------------------------------------------------------------
// Narrow file-scope payload parsers for inbound server→master frames (Task 3).
//
// These are intentionally separate from MessageHandler, which parses the
// master→server direction. Field counts and separator choice are verified
// against MessageGenerator.generateFwChunk / generateFwTransferEnd /
// generateFwDeployBegin (the runtime generators are the source of truth).
// ---------------------------------------------------------------------------

// Extract transferId from any payload whose first US-separated field is the
// transferId. Used for FW_TRANSFER_BEGIN where we only need the ID.
function extractTransferId(payload: string): string {
  const idx = payload.indexOf(MessageHelper.US);
  return idx < 0 ? payload : payload.substring(0, idx);
}

// FW_CHUNK payload (5 US-separated fields per generateFwChunk):
//   transferId<US>seq<US>payloadLen<US>base64Bytes<US>crc16Hex
function parseFwChunkPayload(payload: string): { transferId: string; seq: number } | null {
  const parts = payload.split(MessageHelper.US);
  if (parts.length !== 5) return null;
  const seq = parseInt(parts[1], 10);
  if (Number.isNaN(seq)) return null;
  return { transferId: parts[0], seq };
}

// FW_TRANSFER_END payload (3 US-separated fields per generateFwTransferEnd):
//   transferId<US>totalChunks<US>finalSha256Hex
function parseFwTransferEndPayload(
  payload: string,
): { transferId: string; finalSha256Hex: string } | null {
  const parts = payload.split(MessageHelper.US);
  if (parts.length !== 3) return null;
  return { transferId: parts[0], finalSha256Hex: parts[2] };
}

// FW_DEPLOY_BEGIN payload (per generateFwDeployBegin):
//   transferId<US>controllerId_1<RS>controllerId_2<RS>...
function parseFwDeployBeginPayload(
  payload: string,
): { transferId: string; order: string[] } | null {
  const firstUs = payload.indexOf(MessageHelper.US);
  if (firstUs < 0) return null;
  const transferId = payload.substring(0, firstUs);
  const orderStr = payload.substring(firstUs + 1);
  const order = orderStr.split(MessageHelper.RS);
  return { transferId, order };
}
