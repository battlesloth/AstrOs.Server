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
// No `tag` (uploads aren't releases) and no `publishedAt` (which would
// be a release publish timestamp). Time provenance for `uploadedAt` is
// the server clock — see field comment.
export interface StoredUploadMeta {
  uploadId: string;
  // User's original filename, kept for operator inspection / UI display.
  // NEVER interpolated into a filesystem path — the persisted filename
  // uses only `uploadId` so this can hold any bytes safely.
  originalFilename: string;
  projectName: string;
  version: string;
  // Server-generated ISO-8601 UTC timestamp captured at the moment
  // store() persists the upload (`new Date().toISOString()`). NOT a
  // browser-clock value — there is no client-supplied timestamp on the
  // upload payload and the server doesn't trust one if there were.
  // Safe to use for "ordering relative to other server events"; not
  // safe for "what time did the user think it was".
  uploadedAt: string;
  sizeBytes: number;
}

export interface StoredUpload {
  path: string;
  sha256: string;
  sizeBytes: number;
  meta: StoredUploadMeta;
}
