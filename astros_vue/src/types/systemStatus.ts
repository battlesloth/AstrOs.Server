// Wire-protocol types shared between the Pinia store, the axios layer, and the
// WebSocket dispatcher. Lives in `types/` so neither the store nor the api
// service has to import from each other to share these shapes.

export type ReadOnlyReasonCode =
  | 'STARTUP_OPEN_FAILED'
  | 'BACKUP_FAILED'
  | 'MIGRATION_FAILED_NO_BACKUP'
  | 'MIGRATION_FAILED_RESTORED'
  | 'MIGRATION_FAILED_RESTORE_FAILED';

export interface SystemStatusPayload {
  readOnly: boolean;
  reasonCode?: ReadOnlyReasonCode | null;
  enteredAt?: string | null;
}
