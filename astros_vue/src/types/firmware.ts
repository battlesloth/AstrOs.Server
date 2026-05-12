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
 * Subset of the server's FlashOrchestratorErrorReason that surfaces via the
 * HTTP error response. Post-streamer failures (hash_mismatch,
 * chunk_retry_exhausted, etc.) are deliberately omitted — those arrive on
 * the WS surface in d.6, not via this envelope.
 */
export type FlashErrorReason =
  | 'invalid_body'
  | 'job_already_running'
  | 'no_controllers'
  | 'variant_mismatch'
  | 'variant_unknown'
  | 'release_not_found'
  | 'asset_not_found'
  | 'no_upload'
  | 'release_lookup_failed'
  | 'source_resolution_failed'
  | 'controllers_lookup_failed'
  | 'subscriber_attach_failed'
  | 'protocol_violation'
  | 'streamer_unknown_error'
  | 'internal_server_error'
  | 'network_error';

export interface FlashErrorEnvelope {
  reason: FlashErrorReason;
  detail?: string;
  currentJobId?: string;
}
