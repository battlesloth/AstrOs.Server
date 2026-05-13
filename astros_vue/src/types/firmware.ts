// Wire-protocol types for the firmware view. Mirrors the server-side
// shapes in `astros_api/src/models/firmware/release.ts`. Lives in
// `types/` so neither the store nor the api service has to import from
// each other to share these shapes.

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
  id: string;
  label: string;
  /** Single-letter badge glyph: 'B', 'C', 'D'. */
  glyph: string;
  /** Semver tag currently running on the controller, e.g. 'v1.4.0'. */
  current: string;
  status: ControllerOnlineStatus;
  isMaster: boolean;
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
 * Branded type for a controller's hardware MAC address (e.g.
 * `"aa:bb:cc:dd:ee:01"`). On the wire, the server uses MAC to identify
 * controllers in flash-related messages. Inside the firmware store, MAC
 * is translated to `SlotId` via the controllerStore's resolver.
 *
 * The brand is documentation-only — TS can't enforce nominality across
 * the WS boundary where payloads arrive as untyped JSON. The contract is:
 * if you see `Mac` in a type, the value is the raw wire identifier; if
 * you see `SlotId`, it has been translated.
 */
export type Mac = string & { readonly __brand: 'Mac' };

/**
 * Fleet slot identifier — the in-store key for per-controller state.
 * Matches the runtime values of `Location.BODY` / `Location.CORE` /
 * `Location.DOME` (which is why those enum values are loose strings).
 * `Location.UNKNOWN` is excluded by construction: an unknown slot can't
 * key per-controller state.
 */
export type SlotId = 'body' | 'core' | 'dome';

/**
 * Mirror of the server's `ControllerFlashState` discriminated union narrowed
 * to fields the UI reads. Source:
 * `astros_api/src/models/firmware/flash_job_state.ts`.
 *
 * NB: `controllerId` semantics depend on data-flow position. On the wire
 * (server → client), it's a MAC. After `buildControllerStatesMap` rewrites
 * it to the slot id, it's a `SlotId` (but still typed `string` because the
 * brand can't survive a `... as ControllerFlashState` JSON cast).
 */
export interface ControllerFlashState {
  controllerId: string;
  stage: ServerFwStage;
  /** Set when stage === 'VERSION_CONFIRMED'. */
  finalVersion?: string;
  /** Set when stage === 'FAILED'. */
  error?: string;
}

/**
 * Mirror of the server's `FlashJobState`. The `source` shape matches the
 * `FlashRequest` body the client posts.
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
