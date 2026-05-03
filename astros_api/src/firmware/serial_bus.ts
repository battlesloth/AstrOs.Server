// Production SerialBus adapter backed by the existing serial Worker thread.
//
// The Worker (`background_tasks/serial_worker.js`) consumes structured
// `{ type, data }` postMessages from the main thread and emits already-parsed
// `ISerialWorkerResponse` objects back. c.1's MessageHandler does the wire-
// level parsing inside the Worker, so this adapter does NOT re-parse — it
// just maps the typed FW_* response variants onto the FwInboundAck
// discriminated union the ChunkStreamer expects.
//
// `kind` ('firmware' | 'normal') is recorded on the contract for c.6c's
// JobLock-aware drop policy. c.6b unconditionally forwards both kinds so
// the existing non-firmware traffic keeps flowing while the streamer
// is layered in.

import type { Worker } from 'worker_threads';
import type { FwInboundAck, SerialBus } from '../models/firmware/chunk_streamer.js';
import { SerialMessageType } from '../serial/serial_message.js';
import type { ISerialWorkerResponse } from '../serial/serial_worker_response.js';
import { SerialWorkerResponseType } from '../serial/serial_worker_response.js';

export interface WorkerSerialBusOpts {
  worker: Worker;
}

export class WorkerSerialBus implements SerialBus {
  private readonly worker: Worker;

  constructor(opts: WorkerSerialBusOpts) {
    this.worker = opts.worker;
  }

  send(payload: string, _opts: { kind: 'firmware' | 'normal' }): void {
    // c.6b: forward unconditionally regardless of kind. The drop-when-locked
    // policy lands in c.6c — see SerialBus.send doc-comment in chunk_streamer.ts.
    //
    // The payload is the pre-formed wire string built by ChunkStreamer's
    // MessageGenerator. We wrap it in the RAW_WIRE IPC envelope so the
    // serial worker echoes it straight back as SEND_SERIAL_MESSAGE
    // without running it through msgService.generateMessage. Bypassing
    // msgService is intentional: the streamer has its own sliding-window
    // retry tracker, and msgService would install a parallel tracker
    // timeout per FW_CHUNK that conflicts with the streamer's own budget.
    // See SerialMessageType.RAW_WIRE for the protocol contract.
    this.worker.postMessage({ type: SerialMessageType.RAW_WIRE, data: payload });
  }

  subscribeFwAcks(transferId: string, handler: (ack: FwInboundAck) => void): () => void {
    const listener = (msg: ISerialWorkerResponse): void => {
      const ack = mapToFwInboundAck(msg);
      if (ack === null) return;
      if (ack.transferId !== transferId) return;
      handler(ack);
    };

    this.worker.on('message', listener);
    return () => {
      this.worker.off('message', listener);
    };
  }
}

// Returns null for any worker message that is not one of the five FwInboundAck
// variants. FW_PROGRESS and FW_DEPLOY_DONE are intentionally omitted — they
// flow to the orchestrator, not the streamer.
function mapToFwInboundAck(msg: ISerialWorkerResponse): FwInboundAck | null {
  switch (msg.type) {
    case SerialWorkerResponseType.FW_TRANSFER_BEGIN_ACK:
      return { kind: 'beginAck', ...msg.payload };
    case SerialWorkerResponseType.FW_CHUNK_ACK:
      return { kind: 'chunkAck', ...msg.payload };
    case SerialWorkerResponseType.FW_CHUNK_NAK:
      return { kind: 'chunkNak', ...msg.payload };
    case SerialWorkerResponseType.FW_TRANSFER_END_ACK:
      return { kind: 'transferEndAck', ...msg.payload };
    case SerialWorkerResponseType.FW_BACKPRESSURE:
      return { kind: 'backpressure', ...msg.payload };
    default: {
      // Intentional: non-FW types + FW_PROGRESS / FW_DEPLOY_DONE drop here.
      // (FW_PROGRESS and FW_DEPLOY_DONE are deploy-phase messages that
      // route to the orchestrator, not the upload-phase streamer.) If a
      // new FW_* response is added that the streamer should observe, add
      // a case above and extend FwInboundAck in chunk_streamer.ts.
      return null;
    }
  }
}
