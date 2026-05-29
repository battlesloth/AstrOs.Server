import { describe, it, expect } from 'vitest';
import {
  parseEspAppDesc,
  ESP_APP_DESC_MAGIC,
  ESP_APP_DESC_OFFSET,
  ESP_APP_DESC_SIZE,
} from './esp_app_desc.js';

interface FixtureOpts {
  magic?: number;
  secureVersion?: number;
  version?: string;
  projectName?: string;
  time?: string;
  date?: string;
  idfVer?: string;
  appElfSha256?: Buffer;
  size?: number;
}

const SLOT_OFFSETS = {
  magic: 0,
  secureVersion: 4,
  version: 16,
  projectName: 48,
  time: 80,
  date: 96,
  idfVer: 112,
  appElfSha256: 144,
} as const;

const SLOT_LENS = {
  version: 32,
  projectName: 32,
  time: 16,
  date: 16,
  idfVer: 32,
} as const;

function writeFixedString(buf: Buffer, off: number, len: number, str: string): void {
  const encoded = Buffer.from(str, 'utf8');
  if (encoded.length >= len) {
    throw new Error(
      `test fixture string too long: '${str}' (${encoded.length} bytes) for ${len}-byte slot`,
    );
  }
  encoded.copy(buf, off);
  // Trailing null terminator + remaining tail bytes are already 0
  // because Buffer.alloc zero-fills.
}

function makeAppDescBuffer(opts: FixtureOpts = {}): Buffer {
  const {
    magic = ESP_APP_DESC_MAGIC,
    secureVersion = 0,
    version = '1.4.0',
    projectName = 'astros-esp',
    time = '12:00:00',
    date = '2026-01-01',
    idfVer = 'v5.0.0',
    appElfSha256 = Buffer.alloc(32),
    size = ESP_APP_DESC_OFFSET + ESP_APP_DESC_SIZE,
  } = opts;

  const buf = Buffer.alloc(size);
  if (size < ESP_APP_DESC_OFFSET + ESP_APP_DESC_SIZE) {
    return buf;
  }

  const base = ESP_APP_DESC_OFFSET;
  buf.writeUInt32LE(magic >>> 0, base + SLOT_OFFSETS.magic);
  buf.writeUInt32LE(secureVersion >>> 0, base + SLOT_OFFSETS.secureVersion);
  writeFixedString(buf, base + SLOT_OFFSETS.version, SLOT_LENS.version, version);
  writeFixedString(buf, base + SLOT_OFFSETS.projectName, SLOT_LENS.projectName, projectName);
  writeFixedString(buf, base + SLOT_OFFSETS.time, SLOT_LENS.time, time);
  writeFixedString(buf, base + SLOT_OFFSETS.date, SLOT_LENS.date, date);
  writeFixedString(buf, base + SLOT_OFFSETS.idfVer, SLOT_LENS.idfVer, idfVer);
  appElfSha256.copy(buf, base + SLOT_OFFSETS.appElfSha256, 0, 32);
  return buf;
}

describe('parseEspAppDesc', () => {
  it('returns the parsed struct for a valid binary', () => {
    const sha = Buffer.alloc(32);
    sha.fill(0xaa);
    const buf = makeAppDescBuffer({
      projectName: 'astros-esp',
      version: '1.4.0',
      idfVer: 'v5.1.2',
      appElfSha256: sha,
    });

    const desc = parseEspAppDesc(buf);

    expect(desc.magicWord).toBe(ESP_APP_DESC_MAGIC);
    expect(desc.projectName).toBe('astros-esp');
    expect(desc.version).toBe('1.4.0');
    expect(desc.idfVer).toBe('v5.1.2');
    expect(desc.appElfSha256.length).toBe(32);
    expect(desc.appElfSha256.equals(sha)).toBe(true);
  });

  it('throws on wrong magic word', () => {
    const buf = makeAppDescBuffer({ magic: 0x00000000 });
    expect(() => parseEspAppDesc(buf)).toThrow(/magic/i);
  });

  it('throws when the buffer is shorter than the minimum required length', () => {
    const buf = Buffer.alloc(100);
    expect(() => parseEspAppDesc(buf)).toThrow(/short/i);
  });

  it('throws when project_name has no null terminator within its slot', () => {
    const buf = makeAppDescBuffer();
    // Fill all 32 bytes of the project_name slot with non-zero bytes.
    buf.fill(
      0x41,
      ESP_APP_DESC_OFFSET + SLOT_OFFSETS.projectName,
      ESP_APP_DESC_OFFSET + SLOT_OFFSETS.projectName + SLOT_LENS.projectName,
    );

    expect(() => parseEspAppDesc(buf)).toThrow(/null terminator/i);
  });

  it('truncates the version field at an embedded null mid-string', () => {
    const buf = makeAppDescBuffer({ version: '1.4.0' });
    // Overwrite the version slot with "1.4\x00.0" + zeros — the bytes after
    // the embedded null are printable ASCII (not control chars) so they
    // pass the slot scan and we expect truncate-at-null to yield '1.4'.
    const off = ESP_APP_DESC_OFFSET + SLOT_OFFSETS.version;
    buf.fill(0, off, off + SLOT_LENS.version);
    Buffer.from('1.4', 'utf8').copy(buf, off);
    Buffer.from('.0', 'utf8').copy(buf, off + 4);

    const desc = parseEspAppDesc(buf);

    expect(desc.version).toBe('1.4');
  });

  it('throws when a string field has a control char before the null', () => {
    const buf = makeAppDescBuffer({ version: '1.4.0' });
    // Replace the second byte of the version slot with 0x01.
    buf[ESP_APP_DESC_OFFSET + SLOT_OFFSETS.version + 1] = 0x01;

    expect(() => parseEspAppDesc(buf)).toThrow(/control/i);
  });

  it('throws when a string field has a control char in the unused tail', () => {
    const buf = makeAppDescBuffer({ version: '1.4.0' });
    // The version slot has 'v','1','.','4','.','0', null at index 5,
    // then zeros. Plant a 0x01 at slot offset 10 — well after the null,
    // in territory that would normally be don't-care.
    buf[ESP_APP_DESC_OFFSET + SLOT_OFFSETS.version + 10] = 0x01;

    expect(() => parseEspAppDesc(buf)).toThrow(/control/i);
  });

  it('throws when a string field has DEL (0x7F)', () => {
    // DEL is a single-byte ASCII control char that sits outside the
    // C0 range [0x01, 0x1F] historically. Reject it explicitly so the
    // tampered-binary defense covers all single-byte control chars,
    // not just the contiguous low range.
    const buf = makeAppDescBuffer({ version: '1.4.0' });
    buf[ESP_APP_DESC_OFFSET + SLOT_OFFSETS.version + 1] = 0x7f;

    expect(() => parseEspAppDesc(buf)).toThrow(/control/i);
  });

  it('accepts legitimate multi-byte UTF-8 with C1-range continuation bytes', () => {
    // Regression guard: bytes 0x80-0x9F appear inside valid UTF-8
    // continuation sequences (e.g. `é` is encoded as 0xC3 0xA9, where
    // 0xA9 falls in the C1 range). The parser must NOT reject these
    // at the byte level — only invalid sequences should fail, via the
    // strict-mode UTF-8 decoder.
    const buf = makeAppDescBuffer({ idfVer: 'release-é-v5' });
    const desc = parseEspAppDesc(buf);

    expect(desc.idfVer).toBe('release-é-v5');
  });

  it('throws on non-UTF-8 bytes in a string field', () => {
    const buf = makeAppDescBuffer();
    const off = ESP_APP_DESC_OFFSET + SLOT_OFFSETS.version;
    buf.fill(0, off, off + SLOT_LENS.version);
    buf[off] = 0xff;
    buf[off + 1] = 0xff;
    // byte at off+2 stays 0 (null terminator).

    expect(() => parseEspAppDesc(buf)).toThrow(/utf-8/i);
  });

  it('reads secureVersion as uint32 little-endian', () => {
    const buf = makeAppDescBuffer({ secureVersion: 0x12345678 });
    const desc = parseEspAppDesc(buf);

    expect(desc.secureVersion).toBe(0x12345678);
    // Byte-order sanity check: LSB at the lowest offset.
    expect(buf[ESP_APP_DESC_OFFSET + SLOT_OFFSETS.secureVersion]).toBe(0x78);
    expect(buf[ESP_APP_DESC_OFFSET + SLOT_OFFSETS.secureVersion + 1]).toBe(0x56);
    expect(buf[ESP_APP_DESC_OFFSET + SLOT_OFFSETS.secureVersion + 2]).toBe(0x34);
    expect(buf[ESP_APP_DESC_OFFSET + SLOT_OFFSETS.secureVersion + 3]).toBe(0x12);
  });

  it('exposes ESP_APP_DESC_MAGIC = 0xABCD5432', () => {
    expect(ESP_APP_DESC_MAGIC).toBe(0xabcd5432);
  });

  it('returns appElfSha256 as a defensive copy (mutation of source does not affect result)', () => {
    const sha = Buffer.alloc(32);
    sha.fill(0xaa);
    const buf = makeAppDescBuffer({ appElfSha256: sha });

    const desc = parseEspAppDesc(buf);
    // Mutate the source buffer at the sha offset; parsed field should be unaffected.
    buf[ESP_APP_DESC_OFFSET + SLOT_OFFSETS.appElfSha256] = 0xbb;

    expect(desc.appElfSha256[0]).toBe(0xaa);
  });
});
