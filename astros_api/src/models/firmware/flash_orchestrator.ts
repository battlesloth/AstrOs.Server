// Typed models for the c.6c.1 FlashJobOrchestrator. No runtime logic lives
// here — these types form the contract between the orchestrator, its HTTP
// surface, and the streaming/clock seams used by tests.

import type { FwDeployDone, FwProgress } from './firmware_messages.js';
import type { StreamObserver, TransferResult, TransferSpec } from './chunk_streamer.js';

// Request body shape for `POST /api/firmware/flash`. The discriminator lets
// the orchestrator branch between a GitHub release fetch and a pre-uploaded
// artifact without smuggling a sentinel into a single string field.
//
// `version` accepts EITHER the GitHub tag form (`'v1.4.0'`) OR the
// stripped form (`'1.4.0'`) — `resolveFlashSource` matches against
// both `release.tag` and `release.version` so operators submitting
// either form work. Field is named `version` rather than
// `tagOrVersion` to match the Vue / operator mental model.
//
// `controllers` is the operator-selected MAC list. The server filters its
// variant cache to these entries; a requested MAC missing from the cache
// surfaces as `controllers_unknown` (a 400) so the operator sees a clear
// "this controller hasn't reported its firmware variant yet" signal rather
// than the misleading legacy `no_controllers`. Must be non-empty.
type BaseFlashRequest = { controllers: string[] };
export type FlashRequest = BaseFlashRequest &
  ({ source: { kind: 'github'; version: string } } | { source: { kind: 'upload' } });

// Typed channel for what `subscribeDeployEvents` delivers. The orchestrator
// fans serial deploy-phase messages (FW_PROGRESS, FW_DEPLOY_DONE) out as
// this discriminated union so consumers don't sniff field shapes.
export type FwDeployEvent =
  | { kind: 'progress'; payload: FwProgress }
  | { kind: 'done'; payload: FwDeployDone };

// Narrow interface returned by `streamerFactory`. Lets the orchestrator be
// tested with a scripted streamer without instantiating the real
// `ChunkStreamer` (which needs a SerialBus + filesystem-backed source).
export interface Streamer {
  run(
    spec: TransferSpec,
    observer: StreamObserver,
    opts?: { signal?: AbortSignal },
  ): Promise<TransferResult>;
}

// Minimal clock abstraction so the reboot timer and progress-throttle window
// are deterministic under fake timers in tests.
export interface Clock {
  now(): number;
  setTimeout(cb: () => void, ms: number): NodeJS.Timeout;
  clearTimeout(t: NodeJS.Timeout): void;
}
