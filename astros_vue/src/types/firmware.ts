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
 * Subset of the server's FlashOrchestratorErrorReason that surfaces via the
 * HTTP error response. Post-streamer failures (hash_mismatch,
 * chunk_retry_exhausted, etc.) are deliberately omitted — those arrive on
 * the WS surface, not via this envelope.
 *
 * The tuple is the single source of truth: the `FlashErrorReason` union is
 * derived from it, and `KNOWN_FLASH_ERROR_REASONS` is the corresponding
 * runtime Set — both stay in sync because both come from this one list.
 */
export const FLASH_ERROR_REASONS = [
  'invalid_body',
  'job_already_running',
  'no_controllers',
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
  | 'REBOOTING'
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
 * narrowed to fields the UI reads (server wire also carries `bytesSent`,
 * `totalBytes`, `detail`; we drop those — no UI surface renders them).
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
      stage: 'QUEUED' | 'UPLOADING_TO_MASTER' | 'SENDING' | 'VERIFYING' | 'REBOOTING';
    }
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
      stage: 'QUEUED' | 'UPLOADING_TO_MASTER' | 'SENDING' | 'VERIFYING' | 'REBOOTING';
    }
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
