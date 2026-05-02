// Firmware upload-mode shapes. See the c.5 plan for context.

// Decoded `esp_app_desc_t` struct from the head of an ESP-IDF app binary.
// Strings are the null-terminated UTF-8 prefix of each fixed-length slot
// (parser rejects non-terminated slots and embedded control chars).
export interface EspAppDesc {
  magicWord: number;
  secureVersion: number;
  version: string;
  projectName: string;
  time: string;
  date: string;
  idfVer: string;
  // Raw 32-byte digest from the struct. Not currently consumed but
  // preserved verbatim so future protocol use (e.g., parity check
  // against the OTA verify hash) doesn't need a parser change.
  appElfSha256: Buffer;
}

// Persisted as `upload-<uuid>.meta.json` next to each stored upload.
// No `tag` (uploads aren't releases) and no `publishedAt` (only
// `uploadedAt` — the user's clock at upload time).
export interface StoredUploadMeta {
  uploadId: string;
  // User's original filename, kept for operator inspection / UI display.
  // NEVER interpolated into a filesystem path — the persisted filename
  // uses only `uploadId` so this can hold any bytes safely.
  originalFilename: string;
  projectName: string;
  version: string;
  uploadedAt: string;
  sizeBytes: number;
}

export interface StoredUpload {
  path: string;
  sha256: string;
  sizeBytes: number;
  meta: StoredUploadMeta;
}
