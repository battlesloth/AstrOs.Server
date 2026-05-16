// Decoded `esp_app_desc_t` struct from the head of an ESP-IDF app binary.
export interface EspAppDesc {
  magicWord: number;
  secureVersion: number;
  version: string;
  projectName: string;
  time: string;
  date: string;
  idfVer: string;
  // Preserved verbatim from the struct for potential future parity
  // checks against the OTA verify hash; not currently consumed.
  appElfSha256: Buffer;
}

// Persisted as `upload-<uuid>.meta.json` alongside each stored upload.
export interface StoredUploadMeta {
  uploadId: string;
  // User's original filename. NEVER interpolated into a filesystem
  // path — the persisted filename uses only `uploadId`, so this can
  // hold any bytes (path separators, control chars) safely.
  originalFilename: string;
  projectName: string;
  version: string;
  // Server-generated ISO-8601 UTC at store() time. Not a client-
  // supplied timestamp — safe for ordering vs. other server events,
  // not for "what time did the user think it was".
  uploadedAt: string;
  sizeBytes: number;
}

export interface StoredUpload {
  path: string;
  sha256: string;
  sizeBytes: number;
  meta: StoredUploadMeta;
}

// Wire shape of POST /api/firmware/upload — the success body the
// controller returns to the operator. `Omit<…, 'path'>` strips the
// server-internal absolute filesystem path while keeping the rest of
// `StoredUpload` definitionally derived: any field added to
// `StoredUpload` (or to `StoredUploadMeta`, since `meta` is included
// here) propagates onto the wire automatically. Renaming `path` would
// require updating this clause; adding a non-path field requires nothing.
export type FirmwareUploadResponse = Omit<StoredUpload, 'path'>;

// Discriminated codes the controller writes into the `error` field on a
// failure response. The Vue side (`FIRMWARE_UPLOAD_ERROR_CODES` in
// `astros_vue/src/types/firmware.ts`) is a hand-maintained mirror —
// adding or renaming a code here does NOT trigger a compile error on the
// Vue side; both sides have to be updated together, same convention as
// every other hand-mirrored type in the codebase.
export const FIRMWARE_UPLOAD_ERROR_CODES = [
  'invalid_body',
  'upload_io_failed',
  'invalid_firmware',
  'upload_persist_failed',
] as const;
export type FirmwareUploadErrorCode = (typeof FIRMWARE_UPLOAD_ERROR_CODES)[number];

export interface FirmwareUploadErrorResponse {
  error: FirmwareUploadErrorCode;
  detail: string;
}
