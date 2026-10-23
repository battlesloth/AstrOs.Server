// Wire-protocol types shared between the Pinia store, the axios layer, and the
// WebSocket dispatcher. Lives in `types/` so neither the store nor the api
// service has to import from each other to share these shapes.

// Mirrors astros_api/src/system_status.ts. Each code also needs a
// systemStatus.reasonCode.* locale key and an entry in
// AstrosSystemStatusBanner.vue's KNOWN_CODES (both checked by vue-tsc).
export type ReadOnlyReasonCode =
  | 'STARTUP_OPEN_FAILED'
  | 'BACKUP_FAILED'
  | 'MIGRATION_FAILED_NO_BACKUP'
  | 'MIGRATION_FAILED_RESTORED'
  | 'MIGRATION_FAILED_RESTORE_FAILED'
  | 'DB_NEWER_THAN_SERVER';

export interface SystemStatusPayload {
  readOnly: boolean;
  reasonCode?: ReadOnlyReasonCode | null;
  enteredAt?: string | null;
}
