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

// Success body for POST /api/firmware/upload. `Omit<…, 'path'>` strips
// the server-internal filesystem path; any other `StoredUpload` field
// added later propagates onto the wire automatically.
export type FirmwareUploadResponse = Omit<StoredUpload, 'path'>;

// Error-response discriminator codes. Hand-mirrored on the Vue side
// (`FIRMWARE_UPLOAD_ERROR_CODES` in `astros_vue/src/types/firmware.ts`);
// both sides must be updated together.
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
