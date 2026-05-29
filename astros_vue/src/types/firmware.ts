// Wire-protocol types for the firmware view. Mirrors the server-side
// shapes in `astros_api/src/models/firmware/release.ts`. Lives in
// `types/` so neither the store nor the api service has to import from
// each other to share these shapes.

import { Location } from '@/enums';

export interface AssetInfo {
  variant: string;
  version: string;
  assetName: string;
  assetUrl: string;
  sizeBytes: number;
}

export interface ReleaseInfo {
  tag: string;
  version: string;
  publishedAt: string;
  prerelease: boolean;
  assets: AssetInfo[];
}

// Server response shape for GET /api/firmware/releases. `staleSince` is
// null on a fresh fetch and an ISO timestamp when the server is serving
// from a stale cache because the upstream GitHub fetch failed.
export interface ReleaseListResult {
  releases: ReleaseInfo[];
  staleSince: string | null;
}

export type ReleasesLoadState = 'idle' | 'loading' | 'loaded' | 'stale' | 'error';

export type FirmwareSourceMode = 'github' | 'upload';

/** Upload state machine — drives the source strip's in-progress affordance
 *  and gates `canFlash` on a real (server-acknowledged) upload rather than
 *  the operator's just-picked filename. */
export type UploadState = 'idle' | 'uploading' | 'uploaded' | 'error';

/** Server's projection of a successful upload — what the operator sees
 *  after the .bin parses and the artifact is promoted into the slot.
 *  `version` is the esp_app_desc-reported version (normalized); `sizeBytes`
 *  matches the on-disk artifact; `displayName` is the operator's original
 *  filename (never path-interpolated server-side, so safe to render). */
export interface UploadedFirmware {
  version: string;
  displayName: string;
  sizeBytes: number;
}

/** Mirror of the server's `StoredUploadMeta`. Hand-maintained. */
export interface FirmwareUploadMeta {
  uploadId: string;
  originalFilename: string;
  projectName: string;
  version: string;
  uploadedAt: string;
  sizeBytes: number;
}

/** Mirror of the server's `FirmwareUploadResponse` (POST
 *  /api/firmware/upload success body). */
export interface FirmwareUploadResponse {
  sha256: string;
  sizeBytes: number;
  meta: FirmwareUploadMeta;
}

export type ControllerOnlineStatus = 'up' | 'down' | 'needsSynced';

/** Presentation-layer view of a controller for the firmware-update flow. */
export interface FirmwareControllerView {
  id: SlotId;
  label: string;
  /** Single-letter badge glyph: 'B', 'C', 'D'. */
  glyph: string;
  /** Semver tag currently running on the controller, e.g. 'v1.4.0'. */
  current: string;
  status: ControllerOnlineStatus;
  isMaster: boolean;
}

/**
 * Summary record for a controller that ended a flash job in stage='FAILED'.
 * The `stage` is taken from the shared `currentStage` at failure time
 * (FirmwareStage | null) — see `applyJobFailed`'s normalize for details.
 */
export interface FailedControllerSummary {
  id: SlotId;
  label: string;
  stage: FirmwareStage | null;
}

export type FirmwareStatusPillKind =
  | 'idle'
  | 'queued'
  | 'updating'
  | 'finalizing'
  | 'done'
  | 'failed'
  | 'upToDate'
  | 'offline'
  | 'downgrade';

export type FirmwarePhase = 'idle' | 'select' | 'flashing' | 'done' | 'failed';

export type FirmwareStage = 'download' | 'transfer' | 'flash' | 'verify' | 'reboot';

/**
 * Template-literal type for the i18n key path of a stage label. Producer:
 * `controllerStageLabelKey()`. Consumer: `AstrosFirmwareControllerRow.vue`
 * via `t(stageLabelKey)`. Encoding the path as a type catches typos at
 * the producer and consumer boundaries that a bare `string` would let slip.
 */
export type FirmwareStageLabelKey = `firmware_view.stages.${FirmwareStage}.label`;

/**
 * Unified mirror of every server-emitted error code that lands on a
 * flash-error envelope (HTTP body or WS `flashJobFailed`). Server side,
 * the codes originate in three distinct authoring surfaces — keep both
 * sides updated together when adding to any of them:
 *
 *   1. `FlashOrchestratorErrorReason`
 *      (`astros_api/src/firmware/flash_orchestrator.ts`) — pre-streamer
 *      validation + source resolution (e.g. `no_controllers`,
 *      `variant_mismatch`, `release_not_found`), the orchestrator's
 *      own mid-flow envelope reasons (`aborted`, `streamer_unknown_error`,
 *      `protocol_violation`, `subscriber_attach_failed`), AND the
 *      streamer transport codes from `TransferErrorCode` which are
 *      absorbed into this union via `| TransferErrorCode`. The
 *      orchestrator's `routeStartFailure` is the single fail-path
 *      consolidation for both pre-streamer and mid-streamer errors.
 *   2. `TransferErrorCode` (`astros_api/src/models/firmware/chunk_streamer.ts`)
 *      — listed here because the codes are *authored* in this file
 *      (e.g. `hash_mismatch`, `transfer_timeout`, `bus_send_failed`)
 *      even though the type itself flows in via the orchestrator union
 *      above. Adding a new transport code requires updating this tuple.
 *   3. `FirmwareUploadErrorCode` (`astros_api/src/models/firmware/upload.ts`)
 *      — HTTP error bodies from `POST /api/firmware/upload`, plus
 *      `payload_too_large` emitted by `firmwareUploadLimitHandler`
 *      inside express-fileupload's `limitHandler`. Independent of the
 *      orchestrator union.
 *
 * Plus two client-side reasons the server never emits: `network_error`
 * (transport-layer failures) and `internal_server_error` (catch-all
 * fallback when the wire reason doesn't appear in this tuple).
 *
 * The HTTP envelope and the WS `flashJobFailed` event share this
 * surface — the same reason lands on either path and the operator sees
 * the same `firmware_view.flash_errors.*` copy regardless of which one
 * fired.
 *
 * The tuple is the single source of truth: the `FlashErrorReason` union
 * is derived from it, and `KNOWN_FLASH_ERROR_REASONS` is the
 * corresponding runtime Set — both stay in sync because both come from
 * this one list. A locale-coverage test pins that every reason has a
 * matching `firmware_view.flash_errors.<reason>` key. Drift between the
 * server surfaces and this tuple is NOT compile-time enforced today
 * (see `.docs/plans/20260518-0926-firmware-type-design-orphaned-followups.md`
 * Type I6 for the planned tether).
 */
export const FLASH_ERROR_REASONS = [
  'invalid_body',
  'job_already_running',
  'no_controllers',
  'controllers_unknown',
  'invalid_firmware',
  'upload_io_failed',
  'upload_persist_failed',
  'payload_too_large',
  'variant_mismatch',
  'variant_unknown',
  'release_not_found',
  'asset_not_found',
  'no_upload',
  'release_lookup_failed',
  'source_resolution_failed',
  'controllers_lookup_failed',
  'subscriber_attach_failed',
  'protocol_violation',
  'streamer_unknown_error',
  // Phase C: server-emitted when a Finalizing row's 90s safety timer
  // fires before the master's post-reboot heartbeat arrives. The
  // operator's per-row error renders the firmware_view.flash_errors.
  // post_reboot_timeout copy.
  'post_reboot_timeout',
  // server-emitted when the deploy-phase inactivity watchdog fires
  // (no FW_PROGRESS from master for 90 s during SENDING/VERIFYING/
  // REBOOTING). Renders firmware_view.flash_errors.deploy_timeout copy.
  'deploy_timeout',
  // Streamer-emitted reasons (mirror of TransferErrorCode in
  // astros_api/src/models/firmware/chunk_streamer.ts). The orchestrator
  // routes these onto `flashJobFailed` so the same envelope/locale path
  // serves both pre-streamer and mid-streamer failures. Operator needs to
  // distinguish "master crashed" from "SD card full" from "cable unseated"
  // — each gets its own bench-actionable copy.
  'source_read_failed',
  'source_size_mismatch',
  'source_sha_mismatch',
  'begin_timeout',
  'begin_rejected',
  'chunk_retry_exhausted',
  'flash_full',
  'transfer_timeout',
  'end_timeout',
  'hash_mismatch',
  'master_io_error',
  'bus_send_failed',
  // Both cancel paths route through `failJob` with reason='aborted' so
  // the banner shows "Cancelled" copy rather than `internal_server_error`.
  'aborted',
  'internal_server_error',
  'network_error',
] as const;

export type FlashErrorReason = (typeof FLASH_ERROR_REASONS)[number];

export const KNOWN_FLASH_ERROR_REASONS: ReadonlySet<FlashErrorReason> = new Set(
  FLASH_ERROR_REASONS,
);

export interface FlashErrorEnvelope {
  reason: FlashErrorReason;
  detail?: string;
  currentJobId?: string;
}

/**
 * Mirror of the server's `FwStage` enum (string-literal values from
 * `astros_api/src/models/firmware/firmware_messages.ts`). Hand-maintained;
 * keep cross-referenced with the server source when either side changes.
 */
export type ServerFwStage =
  | 'QUEUED'
  | 'UPLOADING_TO_MASTER'
  | 'SENDING'
  | 'VERIFYING'
  | 'FLASHING'
  | 'REBOOTING'
  | 'FINALIZING'
  | 'VERSION_CONFIRMED'
  | 'FAILED';

/**
 * Fleet slot identifier — the in-store key for per-controller state.
 * Derived from `Location` so adding a new fleet location updates this type
 * automatically. `Location.UNKNOWN` is excluded because an unknown slot
 * can't key per-controller state.
 */
// Use the template-literal extraction so SlotId is the underlying string
// union ('body' | 'core' | 'dome') rather than the enum-member union.
// String literals like 'body' widen to this naturally — important for
// .get() calls and test assertions that pass string keys.
export type SlotId = Exclude<`${Location}`, `${Location.UNKNOWN}`>;

/**
 * Wire-side mirror of the server's `ControllerFlashState` discriminated union,
 * narrowed to fields the UI reads. `bytesSent`/`totalBytes` are kept as
 * optional on in-flight stages so the download-stage progress tracker can
 * compute a percentage. They're never authoritative — a row simply renders
 * its in-progress badge without a percentage when the fields aren't present.
 * `detail` is dropped — no UI surface renders it.
 *
 * Source of truth: `astros_api/src/models/firmware/flash_job_state.ts`.
 *
 * `finalVersion`/`error` are structurally required on their respective stages,
 * matching the server. Reading `state.error` on a non-FAILED stage is a
 * compile error. On the wire `controllerId` is a MAC string; the in-store
 * variant (ControllerFlashStateBySlot) uses SlotId after translation in
 * `buildControllerStatesMap`.
 */
export type ControllerFlashState =
  | {
      controllerId: string;
      stage: 'QUEUED' | 'UPLOADING_TO_MASTER' | 'SENDING' | 'VERIFYING' | 'FLASHING' | 'REBOOTING';
      bytesSent?: number;
      totalBytes?: number;
    }
  | { controllerId: string; stage: 'FINALIZING'; pendingDetail: string }
  | { controllerId: string; stage: 'VERSION_CONFIRMED'; finalVersion: string }
  | { controllerId: string; stage: 'FAILED'; error: string };

/**
 * In-store (post-translation) view. `buildControllerStatesMap` re-keys
 * the wire MAC into a SlotId; both the Map key and the embedded
 * controllerId are SlotIds.
 */
export type ControllerFlashStateBySlot =
  | {
      controllerId: SlotId;
      stage: 'QUEUED' | 'UPLOADING_TO_MASTER' | 'SENDING' | 'VERIFYING' | 'FLASHING' | 'REBOOTING';
      bytesSent?: number;
      totalBytes?: number;
    }
  | { controllerId: SlotId; stage: 'FINALIZING'; pendingDetail: string }
  | { controllerId: SlotId; stage: 'VERSION_CONFIRMED'; finalVersion: string }
  | { controllerId: SlotId; stage: 'FAILED'; error: string };

/**
 * Mirror of the server's `FlashJobState`, narrowed to UI-readable fields.
 * The server transmits the full `FlashSource` shape (sha256, sizeBytes,
 * displayName); we keep only what the UI needs. Source of truth:
 * `astros_api/src/models/firmware/flash_job_state.ts`.
 *
 * Note: `endedAt` is set on both success and failure terminal states.
 * `abortReason` is set only on cancel/streamer-rejection paths.
 */
export interface FlashJobState {
  jobId: string;
  source: { kind: 'github'; version: string } | { kind: 'upload' };
  controllers: ControllerFlashState[];
  startedAt: string;
  endedAt?: string;
  abortReason?: string;
}

/**
 * Mirror of the server's `FlashJobFailedData` (the payload of
 * `flashJobFailed` WS events). `reason` may be any server-side
 * `FlashOrchestratorErrorReason` including post-streamer reasons that
 * aren't in our `FlashErrorReason` union — keep as string for forward-
 * compatibility; the renderer falls back to a generic message for unknowns.
 */
export interface FlashJobFailedData {
  jobId: string;
  endedAt: string;
  reason?: string;
  detail?: string;
  abortReason?: string;
}
