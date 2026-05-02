import type { EspAppDesc } from '../models/firmware/upload.js';

// `esp_app_desc_t` is a fixed-layout struct ESP-IDF embeds at the head of
// every application image. We use it to identify uploaded firmware
// binaries: confirm they're for our project, extract the version. The
// struct sits immediately after the image header (24 B) + first segment
// header (8 B), so its byte offset inside the .bin is 32. Layout has
// been stable since ESP-IDF v4.0; if a future release rearranges,
// adjust the constants below.

export const ESP_IMAGE_HEADER_SIZE = 24;
export const ESP_IMAGE_SEGMENT_HEADER_SIZE = 8;
export const ESP_APP_DESC_OFFSET = ESP_IMAGE_HEADER_SIZE + ESP_IMAGE_SEGMENT_HEADER_SIZE;
export const ESP_APP_DESC_SIZE = 256;
export const ESP_APP_DESC_MAGIC = 0xabcd5432;

const MIN_BUFFER_LEN = ESP_APP_DESC_OFFSET + ESP_APP_DESC_SIZE;

// Field offsets inside the `esp_app_desc_t` struct (relative to the
// struct's start, not the image's start — caller adds ESP_APP_DESC_OFFSET).
const F_MAGIC = 0;
const F_SECURE_VERSION = 4;
// reserv1 occupies bytes 8..16 — unused
const F_VERSION = 16;
const F_PROJECT_NAME = 48;
const F_TIME = 80;
const F_DATE = 96;
const F_IDF_VER = 112;
const F_APP_ELF_SHA256 = 144;
// reserv2 occupies bytes 176..256 — unused

const VERSION_LEN = 32;
const PROJECT_NAME_LEN = 32;
const TIME_LEN = 16;
const DATE_LEN = 16;
const IDF_VER_LEN = 32;
const APP_ELF_SHA256_LEN = 32;

// Strict-mode UTF-8 decoder rejects invalid byte sequences (e.g.
// 0xFF 0xFF) instead of silently substituting U+FFFD, which would let
// a tampered binary pass validation.
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

// Reads one fixed-length string slot at `off`. Rules:
//   1. The slot must contain at least one 0x00 byte (the null terminator).
//   2. No byte in the slot may be a single-byte ASCII control char:
//      C0 range [0x01, 0x1F] or DEL (0x7F). These are unambiguously
//      control chars at the byte level — they have no role inside
//      multi-byte UTF-8 sequences. C1 range [0x80, 0x9F] is NOT
//      rejected here because those byte values appear naturally inside
//      legitimate UTF-8 sequences (every continuation byte is 0x80-0xBF,
//      so e.g. `é` is 0xC3 0xA9); rejecting them at the byte level
//      would false-positive on every accented character. The strict-
//      UTF-8 decoder below catches *invalid* sequences containing
//      those bytes — that's the right tool for the C1 range.
//      Bytes after the null are normally "don't-care" tail, but ESP-IDF
//      zero-fills these and a tampered binary that smuggles control
//      chars into the tail is exactly what this scan defends against.
//   3. The prefix-before-null must be valid UTF-8 under strict mode.
function readFixedString(buf: Buffer, off: number, len: number, fieldName: string): string {
  const slot = buf.subarray(off, off + len);
  for (let i = 0; i < slot.length; i += 1) {
    const b = slot[i];
    if ((b > 0 && b < 0x20) || b === 0x7f) {
      throw new Error(
        `esp_app_desc ${fieldName}: control byte 0x${b.toString(16).padStart(2, '0')} at slot offset ${i}`,
      );
    }
  }
  const nullIdx = slot.indexOf(0);
  if (nullIdx === -1) {
    throw new Error(`esp_app_desc ${fieldName}: no null terminator within ${len}-byte slot`);
  }
  const prefix = slot.subarray(0, nullIdx);
  try {
    return utf8Decoder.decode(prefix);
  } catch {
    throw new Error(`esp_app_desc ${fieldName}: invalid UTF-8 sequence in slot`);
  }
}

// Decodes the `esp_app_desc_t` struct from the head of an ESP-IDF
// application image. Caller is responsible for reading at least
// `MIN_BUFFER_LEN` bytes from the file; we don't ever need the whole
// 1.2 MB binary in memory just to identify it.
export function parseEspAppDesc(buf: Buffer): EspAppDesc {
  if (buf.length < MIN_BUFFER_LEN) {
    throw new Error(
      `esp_app_desc buffer too short: got ${buf.length} bytes, need at least ${MIN_BUFFER_LEN}`,
    );
  }

  const base = ESP_APP_DESC_OFFSET;
  const magicWord = buf.readUInt32LE(base + F_MAGIC);
  if (magicWord !== ESP_APP_DESC_MAGIC) {
    throw new Error(
      `esp_app_desc magic word mismatch: got 0x${magicWord.toString(16)}, expected 0x${ESP_APP_DESC_MAGIC.toString(16)}`,
    );
  }

  const secureVersion = buf.readUInt32LE(base + F_SECURE_VERSION);
  const version = readFixedString(buf, base + F_VERSION, VERSION_LEN, 'version');
  const projectName = readFixedString(buf, base + F_PROJECT_NAME, PROJECT_NAME_LEN, 'project_name');
  const time = readFixedString(buf, base + F_TIME, TIME_LEN, 'time');
  const date = readFixedString(buf, base + F_DATE, DATE_LEN, 'date');
  const idfVer = readFixedString(buf, base + F_IDF_VER, IDF_VER_LEN, 'idf_ver');
  // Copy out so later mutation of `buf` can't silently change the parsed result.
  const appElfSha256 = Buffer.from(
    buf.subarray(base + F_APP_ELF_SHA256, base + F_APP_ELF_SHA256 + APP_ELF_SHA256_LEN),
  );

  return { magicWord, secureVersion, version, projectName, time, date, idfVer, appElfSha256 };
}
