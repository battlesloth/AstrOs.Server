import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import fs, { promises as fsp } from 'fs';
import os from 'os';
import path from 'path';
import { FirmwareUploadStore } from './firmware_upload_store.js';
import { ESP_APP_DESC_OFFSET, ESP_APP_DESC_SIZE, ESP_APP_DESC_MAGIC } from './esp_app_desc.js';
import type { StoredUploadMeta } from '../models/firmware/upload.js';

// --- esp_app_desc fixture helpers (mirror the ones used in
// esp_app_desc.test.ts; kept local rather than exported because the
// shape of the helper is test-only and changing it shouldn't propagate). ---

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

interface AppDescOpts {
  magic?: number;
  version?: string;
  projectName?: string;
  time?: string;
  date?: string;
  idfVer?: string;
}

function writeFixedString(buf: Buffer, off: number, len: number, str: string): void {
  const encoded = Buffer.from(str, 'utf8');
  if (encoded.length >= len) {
    throw new Error(
      `test fixture string too long: '${str}' (${encoded.length}) for ${len}-byte slot`,
    );
  }
  encoded.copy(buf, off);
}

function makeHeader(opts: AppDescOpts = {}): Buffer {
  const {
    magic = ESP_APP_DESC_MAGIC,
    version = '1.4.0',
    projectName = 'AstrOs.ESP',
    time = '12:00:00',
    date = '2026-01-01',
    idfVer = 'v5.0.0',
  } = opts;
  const buf = Buffer.alloc(ESP_APP_DESC_OFFSET + ESP_APP_DESC_SIZE);
  const base = ESP_APP_DESC_OFFSET;
  buf.writeUInt32LE(magic >>> 0, base + SLOT_OFFSETS.magic);
  buf.writeUInt32LE(0, base + SLOT_OFFSETS.secureVersion);
  writeFixedString(buf, base + SLOT_OFFSETS.version, SLOT_LENS.version, version);
  writeFixedString(buf, base + SLOT_OFFSETS.projectName, SLOT_LENS.projectName, projectName);
  writeFixedString(buf, base + SLOT_OFFSETS.time, SLOT_LENS.time, time);
  writeFixedString(buf, base + SLOT_OFFSETS.date, SLOT_LENS.date, date);
  writeFixedString(buf, base + SLOT_OFFSETS.idfVer, SLOT_LENS.idfVer, idfVer);
  return buf;
}

// Builds a synthetic .bin: valid header + N bytes of body.
function makeFirmwareBytes(
  opts: AppDescOpts & { bodyBytes?: number; bodyFill?: number } = {},
): Buffer {
  const { bodyBytes = 1024, bodyFill = 0xcc } = opts;
  const head = makeHeader(opts);
  const body = Buffer.alloc(bodyBytes);
  body.fill(bodyFill);
  return Buffer.concat([head, body]);
}

function writeTempBin(tempDir: string, contents: Buffer, basename = 'upload.tmp'): string {
  const filepath = path.join(tempDir, basename);
  fs.writeFileSync(filepath, contents);
  return filepath;
}

function sha256Hex(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

// --- Test setup ---

let tempDir: string;
let rootDir: string;
let store: FirmwareUploadStore;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fw-upload-test-'));
  rootDir = path.join(tempDir, 'firmware-cache');
  fs.mkdirSync(rootDir, { recursive: true });
  // No `expectedProjectName` override — tests verify the real default
  // (`AstrOs.ESP`, matching what ESP-IDF embeds from CMakeLists.txt's
  // `project()` call).
  store = new FirmwareUploadStore({ rootDir });
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('FirmwareUploadStore.latest()', () => {
  it('returns null on cold cache (no uploads dir yet)', async () => {
    expect(await store.latest()).toBeNull();
  });

  it('returns null when uploads dir exists but is empty', async () => {
    fs.mkdirSync(path.join(rootDir, 'uploads'));
    expect(await store.latest()).toBeNull();
  });

  it('returns null when only some sidecar files exist (interrupted prior write)', async () => {
    // Plant a .bin + .sha256 but no .meta.json — looks like a crash
    // between sha-write and meta-write.
    const uploadsDir = path.join(rootDir, 'uploads');
    fs.mkdirSync(uploadsDir);
    const fakeId = '11111111-1111-4111-8111-111111111111';
    fs.writeFileSync(path.join(uploadsDir, `upload-${fakeId}.bin`), Buffer.alloc(100));
    fs.writeFileSync(
      path.join(uploadsDir, `upload-${fakeId}.bin.sha256`),
      sha256Hex(Buffer.alloc(100)),
    );
    // No .meta.json.

    expect(await store.latest()).toBeNull();
  });

  it('returns null when .meta.json is malformed JSON', async () => {
    const uploadsDir = path.join(rootDir, 'uploads');
    fs.mkdirSync(uploadsDir);
    const fakeId = '22222222-2222-4222-8222-222222222222';
    fs.writeFileSync(path.join(uploadsDir, `upload-${fakeId}.bin`), Buffer.alloc(100));
    fs.writeFileSync(
      path.join(uploadsDir, `upload-${fakeId}.bin.sha256`),
      sha256Hex(Buffer.alloc(100)),
    );
    fs.writeFileSync(path.join(uploadsDir, `upload-${fakeId}.meta.json`), '{not json');

    expect(await store.latest()).toBeNull();
  });

  it('returns null for a meta filename whose id has the right shape but wrong v4/variant nibbles', async () => {
    // The id below has correct 8-4-4-4-12 hex structure but the
    // version nibble is `1` (not `4`) and the variant nibble is `0`
    // (not in [8,9,a,b]) — so it's not a uuid v4. UPLOAD_META_RE
    // enforces the v4-specific nibbles, so latest() filters this
    // out as inconsistent state rather than treating it as a real
    // upload.
    const uploadsDir = path.join(rootDir, 'uploads');
    fs.mkdirSync(uploadsDir);
    const nonV4Name = 'upload-12345678-1234-1234-0234-123456789abc.meta.json';
    fs.writeFileSync(path.join(uploadsDir, nonV4Name), '{}');
    fs.writeFileSync(
      path.join(uploadsDir, nonV4Name.replace(/\.meta\.json$/, '.bin')),
      Buffer.alloc(100),
    );

    expect(await store.latest()).toBeNull();
  });

  it('returns null (does not throw) for a meta filename whose id starts with a dash', async () => {
    // Regression guard: pre-fix UPLOAD_META_RE accepted `[0-9a-f-]{36}`
    // which matched ids beginning with `-`, then assertPathSafe inside
    // pathsFor() rejected the leading dash and threw outside the inner
    // try/catch — `latest()` would propagate the throw instead of
    // returning null per the documented contract. Tightened regex now
    // enforces canonical UUID v4 positional structure (8-4-4-4-12) so
    // the malformed name is filtered out before pathsFor() runs.
    const uploadsDir = path.join(rootDir, 'uploads');
    fs.mkdirSync(uploadsDir);
    // 36-char id with leading dash + 35 hex/dashes — would have
    // matched the old regex but fails assertPathSafe.
    const malformedName = 'upload--aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.meta.json';
    fs.writeFileSync(path.join(uploadsDir, malformedName), '{}');
    fs.writeFileSync(
      path.join(uploadsDir, malformedName.replace(/\.meta\.json$/, '.bin')),
      Buffer.alloc(100),
    );

    // Must not throw; must return null.
    expect(await store.latest()).toBeNull();
  });

  it('returns null when meta.json uploadId disagrees with the filename uuid', async () => {
    // Simulates corruption / manual `cp` of a sidecar from another
    // upload — filename says one uuid, JSON content says another.
    // Returning the JSON's metadata alongside the filename's bin/sha
    // would mislead the orchestrator about which upload is being
    // flashed.
    const uploadsDir = path.join(rootDir, 'uploads');
    fs.mkdirSync(uploadsDir);
    const filenameId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const jsonId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const bin = Buffer.alloc(100);
    fs.writeFileSync(path.join(uploadsDir, `upload-${filenameId}.bin`), bin);
    fs.writeFileSync(path.join(uploadsDir, `upload-${filenameId}.bin.sha256`), sha256Hex(bin));
    const wrongMeta: StoredUploadMeta = {
      uploadId: jsonId,
      originalFilename: 'firmware.bin',
      projectName: 'AstrOs.ESP',
      version: '1.0.0',
      uploadedAt: new Date().toISOString(),
      sizeBytes: bin.length,
    };
    fs.writeFileSync(
      path.join(uploadsDir, `upload-${filenameId}.meta.json`),
      JSON.stringify(wrongMeta),
    );

    expect(await store.latest()).toBeNull();
  });

  it('returns null when meta.json sizeBytes disagrees with the bin size on disk', async () => {
    // Simulates partial-write recovery or external truncation — the
    // sidecar describes a 1024-byte upload but the .bin on disk is
    // only 100 bytes. Returning meta whose sizeBytes contradicts the
    // actual binary would mislead callers comparing sizes downstream.
    const uploadsDir = path.join(rootDir, 'uploads');
    fs.mkdirSync(uploadsDir);
    const id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const realBin = Buffer.alloc(100);
    fs.writeFileSync(path.join(uploadsDir, `upload-${id}.bin`), realBin);
    fs.writeFileSync(path.join(uploadsDir, `upload-${id}.bin.sha256`), sha256Hex(realBin));
    const staleMeta: StoredUploadMeta = {
      uploadId: id,
      originalFilename: 'firmware.bin',
      projectName: 'AstrOs.ESP',
      version: '1.0.0',
      uploadedAt: new Date().toISOString(),
      sizeBytes: 1024, // stale — disagrees with realBin.length === 100
    };
    fs.writeFileSync(path.join(uploadsDir, `upload-${id}.meta.json`), JSON.stringify(staleMeta));

    expect(await store.latest()).toBeNull();
  });

  it('returns null when meta.json parses but is missing required fields', async () => {
    const uploadsDir = path.join(rootDir, 'uploads');
    fs.mkdirSync(uploadsDir);
    const fakeId = '33333333-3333-4333-8333-333333333333';
    fs.writeFileSync(path.join(uploadsDir, `upload-${fakeId}.bin`), Buffer.alloc(100));
    fs.writeFileSync(
      path.join(uploadsDir, `upload-${fakeId}.bin.sha256`),
      sha256Hex(Buffer.alloc(100)),
    );
    fs.writeFileSync(path.join(uploadsDir, `upload-${fakeId}.meta.json`), '{}');

    expect(await store.latest()).toBeNull();
  });
});

describe('FirmwareUploadStore.store()', () => {
  it('happy path: writes the full triple at expected paths and returns StoredUpload', async () => {
    const bin = makeFirmwareBytes({ version: '1.4.0' });
    const tempPath = writeTempBin(tempDir, bin);
    const expectedSha = sha256Hex(bin);

    const result = await store.store(tempPath, 'firmware-rc1.bin');

    expect(result.sha256).toBe(expectedSha);
    expect(result.sizeBytes).toBe(bin.length);
    expect(result.meta.uploadId).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.meta.originalFilename).toBe('firmware-rc1.bin');
    expect(result.meta.projectName).toBe('AstrOs.ESP');
    expect(result.meta.version).toBe('1.4.0');
    expect(result.meta.sizeBytes).toBe(bin.length);

    // All three files exist.
    expect(fs.existsSync(result.path)).toBe(true);
    expect(fs.existsSync(`${result.path}.sha256`)).toBe(true);
    const metaPath = result.path.replace(/\.bin$/, '.meta.json');
    expect(fs.existsSync(metaPath)).toBe(true);

    // Sidecar contents match what was returned.
    const onDiskSha = fs.readFileSync(`${result.path}.sha256`, 'utf8').trim();
    expect(onDiskSha).toBe(expectedSha);

    const onDiskMeta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as StoredUploadMeta;
    expect(onDiskMeta).toEqual(result.meta);

    // Sha sidecar must match a fresh hash of the bin on disk too —
    // catches off-by-one / partial-write bugs.
    const reHash = sha256Hex(fs.readFileSync(result.path));
    expect(reHash).toBe(expectedSha);
  });

  it('consumes the temp file (no orphan after success)', async () => {
    const bin = makeFirmwareBytes();
    const tempPath = writeTempBin(tempDir, bin);

    await store.store(tempPath, 'firmware.bin');

    expect(fs.existsSync(tempPath)).toBe(false);
  });

  it('after success, latest() returns the same StoredUpload', async () => {
    const bin = makeFirmwareBytes({ version: '1.4.0' });
    const tempPath = writeTempBin(tempDir, bin);

    const stored = await store.store(tempPath, 'firmware.bin');
    const loaded = await store.latest();

    expect(loaded).not.toBeNull();
    expect(loaded?.path).toBe(stored.path);
    expect(loaded?.sha256).toBe(stored.sha256);
    expect(loaded?.sizeBytes).toBe(stored.sizeBytes);
    expect(loaded?.meta).toEqual(stored.meta);
  });

  it('rejects when project_name does not match expectedProjectName; prior upload preserved', async () => {
    // Pre-populate a prior upload.
    const priorBin = makeFirmwareBytes({ version: '1.0.0' });
    await store.store(writeTempBin(tempDir, priorBin, 'prior.tmp'), 'prior.bin');
    const priorLatest = await store.latest();
    expect(priorLatest).not.toBeNull();

    // Try an upload with a wrong project_name.
    const badBin = makeFirmwareBytes({ projectName: 'evil-esp', version: '9.9.9' });
    const badTempPath = writeTempBin(tempDir, badBin, 'bad.tmp');

    await expect(store.store(badTempPath, 'bad.bin')).rejects.toThrow(/project name/i);

    // Prior upload still intact.
    const stillThere = await store.latest();
    expect(stillThere?.meta.version).toBe('1.0.0');
    expect(stillThere?.meta.uploadId).toBe(priorLatest?.meta.uploadId);
  });

  it('rejects when version is unparseable; prior upload preserved', async () => {
    const priorBin = makeFirmwareBytes({ version: '1.0.0' });
    await store.store(writeTempBin(tempDir, priorBin, 'prior.tmp'), 'prior.bin');

    const badBin = makeFirmwareBytes({ version: 'latest' }); // no x.y.z prefix
    const badTempPath = writeTempBin(tempDir, badBin, 'bad.tmp');

    await expect(store.store(badTempPath, 'bad.bin')).rejects.toThrow(/version/i);

    const stillThere = await store.latest();
    expect(stillThere?.meta.version).toBe('1.0.0');
  });

  it('rejects when binary is shorter than the esp_app_desc minimum and consumes tempPath', async () => {
    const tinyTempPath = writeTempBin(tempDir, Buffer.alloc(100), 'tiny.tmp');

    await expect(store.store(tinyTempPath, 'tiny.bin')).rejects.toThrow(/short/i);
    // Public contract: store() unconditionally consumes tempPath, even
    // on parse-phase failures.
    expect(fs.existsSync(tinyTempPath)).toBe(false);
  });

  it('rejects when esp_app_desc magic word is wrong and consumes tempPath', async () => {
    const badBin = makeFirmwareBytes({ magic: 0x00000000 });
    const badTempPath = writeTempBin(tempDir, badBin, 'badmagic.tmp');

    await expect(store.store(badTempPath, 'bad.bin')).rejects.toThrow(/magic/i);
    expect(fs.existsSync(badTempPath)).toBe(false);
  });

  it('rejects when parseEspAppDesc throws on a string-slot violation and consumes tempPath', async () => {
    // Plant a binary whose project_name slot has no null terminator —
    // parseEspAppDesc throws with a /null terminator/ error. This
    // exercises the parse-throw path (distinct from the magic-word
    // mismatch above), confirming the unconditional cleanup contract.
    const bin = makeFirmwareBytes();
    bin.fill(0x41, ESP_APP_DESC_OFFSET + 48, ESP_APP_DESC_OFFSET + 48 + 32);
    const badTempPath = writeTempBin(tempDir, bin, 'unterminated.tmp');

    await expect(store.store(badTempPath, 'bad.bin')).rejects.toThrow(/null terminator/i);
    expect(fs.existsSync(badTempPath)).toBe(false);
  });

  it('wipes malformed siblings whose ids/extensions fall outside the canonical UUID + lowercase shape', async () => {
    // Regression guard: ANY_UPLOAD_FILE_RE used to be `[0-9a-f-]+`
    // which left files like `upload-FOOBAR.bin` (non-hex id) or
    // `upload-abc.BIN` (uppercase extension from a case-insensitive fs)
    // orphaned forever. Wipe pass must catch these so the documented
    // "single-slot" guarantee actually holds in operator/manual
    // intervention scenarios.
    const uploadsDir = path.join(rootDir, 'uploads');
    fs.mkdirSync(uploadsDir);
    const malformedPaths = [
      'upload-FOOBAR.bin', // non-hex id
      'upload-FOOBAR.bin.sha256',
      'upload-FOOBAR.meta.json',
      'upload-abc123.BIN', // uppercase extension
      'upload-Mixed-CASE-id.meta.json',
    ];
    for (const name of malformedPaths) {
      fs.writeFileSync(path.join(uploadsDir, name), 'stale content');
    }

    // A successful store should run the wipe pass and clear everything
    // matching upload-*.{bin,bin.sha256,meta.json} — including the
    // malformed siblings.
    const bin = makeFirmwareBytes({ version: '1.0.0' });
    const tempPath = writeTempBin(tempDir, bin, 'fresh.tmp');
    const result = await store.store(tempPath, 'fresh.bin');

    const remaining = fs.readdirSync(uploadsDir).sort();
    expect(remaining).toEqual(
      [
        `upload-${result.meta.uploadId}.bin`,
        `upload-${result.meta.uploadId}.bin.sha256`,
        `upload-${result.meta.uploadId}.meta.json`,
      ].sort(),
    );
    for (const name of malformedPaths) {
      expect(fs.existsSync(path.join(uploadsDir, name))).toBe(false);
    }
  });

  it('replaces a prior upload triple atomically', async () => {
    // First upload.
    const firstBin = makeFirmwareBytes({ version: '1.0.0' });
    const firstPath = writeTempBin(tempDir, firstBin, 'first.tmp');
    const first = await store.store(firstPath, 'v1.bin');

    // Second upload.
    const secondBin = makeFirmwareBytes({ version: '2.0.0' });
    const secondPath = writeTempBin(tempDir, secondBin, 'second.tmp');
    const second = await store.store(secondPath, 'v2.bin');

    // First triple is gone.
    expect(fs.existsSync(first.path)).toBe(false);
    expect(fs.existsSync(`${first.path}.sha256`)).toBe(false);
    expect(fs.existsSync(first.path.replace(/\.bin$/, '.meta.json'))).toBe(false);

    // Second triple is present.
    expect(fs.existsSync(second.path)).toBe(true);
    const latest = await store.latest();
    expect(latest?.meta.version).toBe('2.0.0');
    expect(latest?.meta.uploadId).toBe(second.meta.uploadId);

    // Uploads dir contains exactly the second triple.
    const uploadsDir = path.join(rootDir, 'uploads');
    const remaining = fs.readdirSync(uploadsDir);
    expect(remaining.sort()).toEqual(
      [
        `upload-${second.meta.uploadId}.bin`,
        `upload-${second.meta.uploadId}.bin.sha256`,
        `upload-${second.meta.uploadId}.meta.json`,
      ].sort(),
    );
  });

  it('rolls back cleanly when writeFile(.sha256) throws (uploads dir empty)', async () => {
    const bin = makeFirmwareBytes();
    const tempPath = writeTempBin(tempDir, bin, 'will-fail.tmp');

    const realWriteFile = fsp.writeFile.bind(fsp);
    vi.spyOn(fsp, 'writeFile').mockImplementation((async (
      file: Parameters<typeof fsp.writeFile>[0],
      data: Parameters<typeof fsp.writeFile>[1],
      opts?: Parameters<typeof fsp.writeFile>[2],
    ) => {
      if (typeof file === 'string' && file.endsWith('.bin.sha256')) {
        throw Object.assign(new Error('ENOSPC: simulated'), { code: 'ENOSPC' });
      }
      return realWriteFile(file, data, opts);
    }) as typeof fsp.writeFile);

    await expect(store.store(tempPath, 'firmware.bin')).rejects.toThrow(/ENOSPC/);

    // Uploads dir empty (or doesn't exist).
    const uploadsDir = path.join(rootDir, 'uploads');
    if (fs.existsSync(uploadsDir)) {
      expect(fs.readdirSync(uploadsDir)).toEqual([]);
    }
    // Temp file unlinked.
    expect(fs.existsSync(tempPath)).toBe(false);
  });

  it('unlinks tempPath when the stream-hash phase fails mid-read (EIO simulated)', async () => {
    // Reviewer-flagged scenario: pre-fix, a createReadStream / for-await
    // failure exited store() before the rollback block, leaving the temp
    // file orphaned. Now wrapped in the post-parse try/catch.
    const bin = makeFirmwareBytes();
    const tempPath = writeTempBin(tempDir, bin, 'hash-fail.tmp');

    const realCreate = fs.createReadStream.bind(fs);
    vi.spyOn(fs, 'createReadStream').mockImplementation(((
      target: Parameters<typeof fs.createReadStream>[0],
      opts?: Parameters<typeof fs.createReadStream>[1],
    ) => {
      const stream = realCreate(target, opts);
      // Asynchronously emit an error after the stream starts producing data.
      process.nextTick(() =>
        stream.destroy(Object.assign(new Error('EIO: simulated'), { code: 'EIO' })),
      );
      return stream;
    }) as typeof fs.createReadStream);

    await expect(store.store(tempPath, 'hash-fail.bin')).rejects.toThrow(/EIO/);

    expect(fs.existsSync(tempPath)).toBe(false);
    const uploadsDir = path.join(rootDir, 'uploads');
    if (fs.existsSync(uploadsDir)) {
      expect(fs.readdirSync(uploadsDir)).toEqual([]);
    }
  });

  it('unlinks tempPath when mkdir throws EACCES', async () => {
    // Reviewer-flagged scenario: pre-fix, mkdir failures bypassed the
    // persist-phase try/catch and leaked the temp file. Now covered.
    const bin = makeFirmwareBytes();
    const tempPath = writeTempBin(tempDir, bin, 'mkdir-fail.tmp');

    vi.spyOn(fsp, 'mkdir').mockImplementation(async () => {
      throw Object.assign(new Error('EACCES: simulated'), { code: 'EACCES' });
    });

    await expect(store.store(tempPath, 'mkdir-fail.bin')).rejects.toThrow(/EACCES/);

    expect(fs.existsSync(tempPath)).toBe(false);
  });

  it('unlinks tempPath on validation failure (project_name mismatch)', async () => {
    // Post-fix contract: once parse succeeds, store() owns the temp
    // file's fate regardless of why the rest failed. Validation
    // rejection consumes the temp file rather than leaving it for the
    // route layer to clean up.
    const badBin = makeFirmwareBytes({ projectName: 'evil-esp', version: '1.0.0' });
    const badTempPath = writeTempBin(tempDir, badBin, 'val-fail.tmp');

    await expect(store.store(badTempPath, 'val-fail.bin')).rejects.toThrow(/project name/i);

    expect(fs.existsSync(badTempPath)).toBe(false);
  });

  it('rolls back cleanly when rename throws EACCES (temp file unlinked, uploads dir empty)', async () => {
    const bin = makeFirmwareBytes();
    const tempPath = writeTempBin(tempDir, bin, 'rename-fail.tmp');

    vi.spyOn(fsp, 'rename').mockImplementation(async () => {
      throw Object.assign(new Error('EACCES: simulated'), { code: 'EACCES' });
    });

    await expect(store.store(tempPath, 'firmware.bin')).rejects.toThrow(/EACCES/);

    expect(fs.existsSync(tempPath)).toBe(false);
    const uploadsDir = path.join(rootDir, 'uploads');
    if (fs.existsSync(uploadsDir)) {
      expect(fs.readdirSync(uploadsDir)).toEqual([]);
    }
  });

  it('crash-recovery invariant: at each sidecar writeFile, .bin is fresh or absent (never stale)', async () => {
    // Pre-populate prior upload with distinguishable bytes.
    const priorBin = makeFirmwareBytes({ version: '1.0.0', bodyFill: 0xaa });
    await store.store(writeTempBin(tempDir, priorBin, 'prior.tmp'), 'prior.bin');
    const priorLatest = await store.latest();
    expect(priorLatest).not.toBeNull();

    // Capture the new bytes we're about to upload.
    const freshBin = makeFirmwareBytes({ version: '2.0.0', bodyFill: 0xbb });
    const freshTemp = writeTempBin(tempDir, freshBin, 'fresh.tmp');

    // Snapshot the on-disk .bin contents at every writeFile call to a
    // sidecar — the bin must be either the fresh bytes (rename done)
    // or absent (somehow not yet promoted), but never the stale prior.
    const realWriteFile = fsp.writeFile.bind(fsp);
    const snapshots: Array<{ called: string; binState: 'fresh' | 'absent' | 'other' }> = [];

    vi.spyOn(fsp, 'writeFile').mockImplementation((async (
      file: Parameters<typeof fsp.writeFile>[0],
      data: Parameters<typeof fsp.writeFile>[1],
      opts?: Parameters<typeof fsp.writeFile>[2],
    ) => {
      if (
        typeof file === 'string' &&
        (file.endsWith('.bin.sha256') || file.endsWith('.meta.json'))
      ) {
        // The sibling .bin path is derivable from the sidecar path.
        const binPath = file.replace(/\.(bin\.sha256|meta\.json)$/, '.bin');
        let state: 'fresh' | 'absent' | 'other' = 'absent';
        try {
          // Sync read captures bytes at this exact point in the
          // async sequence — no other awaits can interleave.
          const onDisk = fs.readFileSync(binPath);
          if (onDisk.equals(freshBin)) state = 'fresh';
          else state = 'other';
        } catch {
          state = 'absent';
        }
        snapshots.push({ called: file, binState: state });
      }
      return realWriteFile(file, data, opts);
    }) as typeof fsp.writeFile);

    await store.store(freshTemp, 'fresh.bin');

    // At least one snapshot was taken (sha + meta = 2 expected).
    expect(snapshots.length).toBeGreaterThan(0);
    for (const snap of snapshots) {
      expect(snap.binState).not.toBe('other');
    }
  });

  it('rolling back persist failure leaves no orphan files in uploads dir', async () => {
    // Pre-populate a prior upload.
    const priorBin = makeFirmwareBytes({ version: '1.0.0' });
    await store.store(writeTempBin(tempDir, priorBin, 'prior.tmp'), 'prior.bin');

    // Now fail persist on the meta.json write — sha256 already landed
    // when this fires, so rollback must clean both sidecars + the bin.
    const realWriteFile = fsp.writeFile.bind(fsp);
    vi.spyOn(fsp, 'writeFile').mockImplementation((async (
      file: Parameters<typeof fsp.writeFile>[0],
      data: Parameters<typeof fsp.writeFile>[1],
      opts?: Parameters<typeof fsp.writeFile>[2],
    ) => {
      if (typeof file === 'string' && file.endsWith('.meta.json')) {
        throw Object.assign(new Error('ENOSPC: simulated'), { code: 'ENOSPC' });
      }
      return realWriteFile(file, data, opts);
    }) as typeof fsp.writeFile);

    const newBin = makeFirmwareBytes({ version: '2.0.0' });
    const newPath = writeTempBin(tempDir, newBin, 'new.tmp');
    await expect(store.store(newPath, 'new.bin')).rejects.toThrow(/ENOSPC/);

    // Uploads dir is empty (the wipe pass took out the prior, persist
    // partially landed sha + bin, rollback cleaned them).
    const uploadsDir = path.join(rootDir, 'uploads');
    expect(fs.readdirSync(uploadsDir)).toEqual([]);
    expect(fs.existsSync(newPath)).toBe(false);
  });
});

describe('FirmwareUploadStore — esp_app_desc.version normalization', () => {
  // ESP-IDF embeds `git describe --tags --dirty` into esp_app_desc.version
  // by default. Real example from a dev build: "v1.0.0-RC.1-71-g9a55936-dirty".
  // The store strips the leading `v` and the trailing `-<N>-g<sha>(-dirty)?`
  // suffix so the persisted meta.version matches the clean semver shape that
  // GitHub-release filenames produce — c.6's orchestrator can compare the two
  // without per-source casing.

  it('normalizes a dirty dev build: v1.0.0-RC.1-71-g9a55936-dirty → 1.0.0-RC.1', async () => {
    const bin = makeFirmwareBytes({ version: 'v1.0.0-RC.1-71-g9a55936-dirty' });
    const tempPath = writeTempBin(tempDir, bin);

    const result = await store.store(tempPath, 'dev.bin');

    expect(result.meta.version).toBe('1.0.0-RC.1');
  });

  it('normalizes a tag-clean off-tag build: v1.0.0-0-gabc12345 → 1.0.0', async () => {
    const bin = makeFirmwareBytes({ version: 'v1.0.0-0-gabc12345' });
    const tempPath = writeTempBin(tempDir, bin);

    const result = await store.store(tempPath, 'tag.bin');

    expect(result.meta.version).toBe('1.0.0');
  });

  it('strips only the v prefix when no git-describe suffix is present: v1.4.0 → 1.4.0', async () => {
    const bin = makeFirmwareBytes({ version: 'v1.4.0' });
    const tempPath = writeTempBin(tempDir, bin);

    const result = await store.store(tempPath, 'tag.bin');

    expect(result.meta.version).toBe('1.4.0');
  });

  it('passes already-clean semver through unchanged: 1.0.0-RC.3 → 1.0.0-RC.3', async () => {
    const bin = makeFirmwareBytes({ version: '1.0.0-RC.3' });
    const tempPath = writeTempBin(tempDir, bin);

    const result = await store.store(tempPath, 'clean.bin');

    expect(result.meta.version).toBe('1.0.0-RC.3');
  });

  it('still rejects a version that remains unparseable after normalization', async () => {
    // No leading `v`, no git-describe suffix to strip — `garbage` stays
    // `garbage` and fails the semver check.
    const bin = makeFirmwareBytes({ version: 'garbage' });
    const tempPath = writeTempBin(tempDir, bin);

    await expect(store.store(tempPath, 'bad.bin')).rejects.toThrow(/version/i);
  });

  it('does not strip a pre-release label that resembles a git-describe suffix on its own', async () => {
    // `1.0.0-dev.71` — the `dev.71` portion has digits but no `-g<sha>`,
    // so the suffix regex doesn't match. Version passes through cleanly.
    const bin = makeFirmwareBytes({ version: '1.0.0-dev.71' });
    const tempPath = writeTempBin(tempDir, bin);

    const result = await store.store(tempPath, 'devN.bin');

    expect(result.meta.version).toBe('1.0.0-dev.71');
  });
});

describe('FirmwareUploadStore — project_name', () => {
  it('rejects a binary whose embedded project_name is `astros-esp` (filename prefix, not the embedded value)', async () => {
    // c.5 finding: the asset-filename prefix `astros-esp-…-app.bin` is set
    // by CI tooling, but the EMBEDDED project_name from CMake's project()
    // call is `AstrOs.ESP`. A binary mistakenly claiming `astros-esp` in
    // its esp_app_desc must be rejected — it's not what AstrOs.ESP CI
    // produces.
    const bin = makeFirmwareBytes({ projectName: 'astros-esp', version: '1.0.0' });
    const tempPath = writeTempBin(tempDir, bin);

    await expect(store.store(tempPath, 'wrong.bin')).rejects.toThrow(/project name/i);
  });
});

describe('FirmwareUploadStore — concurrent store() serialization', () => {
  it('serializes two concurrent store() calls so the final state is deterministic', async () => {
    // Without the in-flight chain, A.rename followed by B's wipe pass
    // could unlink A.bin between A's rename and A's writeFile(sha),
    // leaving A claiming success on a missing bin. With the chain,
    // A's full sequence completes before B starts, so B's wipe sees
    // A's complete triple and replaces it cleanly. JS evaluation
    // order on Promise.all guarantees A's chain link is taken first,
    // so B = the second writer = wins.
    const binA = makeFirmwareBytes({ version: '1.0.0' });
    const binB = makeFirmwareBytes({ version: '2.0.0' });
    const tempA = writeTempBin(tempDir, binA, 'A.tmp');
    const tempB = writeTempBin(tempDir, binB, 'B.tmp');

    const [resultA, resultB] = await Promise.all([
      store.store(tempA, 'A.bin'),
      store.store(tempB, 'B.bin'),
    ]);

    // Both calls reported success with their own metadata.
    expect(resultA.meta.version).toBe('1.0.0');
    expect(resultB.meta.version).toBe('2.0.0');

    // Final on-disk state is exactly B's triple — A's was wiped by
    // B's wipe pass after A had fully completed.
    const uploadsDir = path.join(rootDir, 'uploads');
    const entries = fs.readdirSync(uploadsDir).sort();
    expect(entries).toEqual(
      [
        `upload-${resultB.meta.uploadId}.bin`,
        `upload-${resultB.meta.uploadId}.bin.sha256`,
        `upload-${resultB.meta.uploadId}.meta.json`,
      ].sort(),
    );

    // latest() returns B; A's bin and sidecars are gone.
    const last = await store.latest();
    expect(last?.meta.uploadId).toBe(resultB.meta.uploadId);
    expect(last?.meta.version).toBe('2.0.0');
    expect(fs.existsSync(resultA.path)).toBe(false);
  });

  it('does not deadlock when a prior store() rejects', async () => {
    // The in-flight chain swallows rejections on the field pointer so
    // a single failure can't poison subsequent calls.
    const badBin = makeFirmwareBytes({ projectName: 'evil-esp', version: '1.0.0' });
    const badTemp = writeTempBin(tempDir, badBin, 'bad.tmp');
    await expect(store.store(badTemp, 'bad.bin')).rejects.toThrow(/project name/i);

    // Subsequent store should succeed — chain is unblocked.
    const goodBin = makeFirmwareBytes({ version: '2.0.0' });
    const goodTemp = writeTempBin(tempDir, goodBin, 'good.tmp');
    const result = await store.store(goodTemp, 'good.bin');

    expect(result.meta.version).toBe('2.0.0');
    const last = await store.latest();
    expect(last?.meta.uploadId).toBe(result.meta.uploadId);
  });

  it('does not deadlock when concurrent calls include a rejection', async () => {
    // A rejects (bad project), B and C are valid. B and C should both
    // complete. B is queued before C, so C's wipe replaces B; latest
    // is C.
    const badBin = makeFirmwareBytes({ projectName: 'evil-esp', version: '0.0.0' });
    const binB = makeFirmwareBytes({ version: '1.0.0' });
    const binC = makeFirmwareBytes({ version: '2.0.0' });
    const badTemp = writeTempBin(tempDir, badBin, 'bad.tmp');
    const tempB = writeTempBin(tempDir, binB, 'B.tmp');
    const tempC = writeTempBin(tempDir, binC, 'C.tmp');

    const [aResult, bResult, cResult] = await Promise.allSettled([
      store.store(badTemp, 'bad.bin'),
      store.store(tempB, 'B.bin'),
      store.store(tempC, 'C.bin'),
    ]);

    expect(aResult.status).toBe('rejected');
    expect(bResult.status).toBe('fulfilled');
    expect(cResult.status).toBe('fulfilled');

    const last = await store.latest();
    expect(last?.meta.version).toBe('2.0.0');
  });
});

describe('FirmwareUploadStore — multiple meta files race-safety', () => {
  // Reviewer-flagged scenario: between readdir and stat, a meta file
  // could be deleted (concurrent store()'s wipe pass) or become
  // unreadable. Per-stat failures must not reject the whole batch —
  // the contract is "any partial state → null miss" and individual
  // stats are wrapped so the survivors are still considered.

  function plantTriple(uploadsDir: string, id: string, version: string): Buffer {
    const bin = makeFirmwareBytes({ version });
    fs.writeFileSync(path.join(uploadsDir, `upload-${id}.bin`), bin);
    fs.writeFileSync(path.join(uploadsDir, `upload-${id}.bin.sha256`), sha256Hex(bin));
    const meta: StoredUploadMeta = {
      uploadId: id,
      originalFilename: 'firmware.bin',
      projectName: 'AstrOs.ESP',
      version,
      uploadedAt: new Date().toISOString(),
      sizeBytes: bin.length,
    };
    fs.writeFileSync(path.join(uploadsDir, `upload-${id}.meta.json`), JSON.stringify(meta));
    return bin;
  }

  it('skips a meta file whose stat fails and returns the surviving newest', async () => {
    const uploadsDir = path.join(rootDir, 'uploads');
    fs.mkdirSync(uploadsDir);

    const goneId = '66666666-6666-4666-8666-666666666666';
    const liveId = '77777777-7777-4777-8777-777777777777';
    plantTriple(uploadsDir, goneId, '1.0.0');
    plantTriple(uploadsDir, liveId, '2.0.0');

    // Mock stat to throw ENOENT for the "gone" meta file (simulating a
    // race where another process deleted it between readdir and stat).
    const realStat = fsp.stat.bind(fsp);
    vi.spyOn(fsp, 'stat').mockImplementation((async (target: Parameters<typeof fsp.stat>[0]) => {
      if (typeof target === 'string' && target.includes(goneId) && target.endsWith('.meta.json')) {
        throw Object.assign(new Error('ENOENT: simulated race'), { code: 'ENOENT' });
      }
      return realStat(target);
    }) as typeof fsp.stat);

    const result = await store.latest();

    expect(result).not.toBeNull();
    expect(result?.meta.uploadId).toBe(liveId);
    expect(result?.meta.version).toBe('2.0.0');
  });

  it('returns null when every meta-file stat fails (full wipe race)', async () => {
    const uploadsDir = path.join(rootDir, 'uploads');
    fs.mkdirSync(uploadsDir);
    plantTriple(uploadsDir, '88888888-8888-4888-8888-888888888888', '1.0.0');
    plantTriple(uploadsDir, '99999999-9999-4999-8999-999999999999', '2.0.0');

    // All stats throw — simulates the dir being wiped between readdir
    // and the stat batch (or a permissions issue affecting all entries).
    const realStat = fsp.stat.bind(fsp);
    vi.spyOn(fsp, 'stat').mockImplementation((async (target: Parameters<typeof fsp.stat>[0]) => {
      if (typeof target === 'string' && target.endsWith('.meta.json')) {
        throw Object.assign(new Error('ENOENT: simulated'), { code: 'ENOENT' });
      }
      return realStat(target);
    }) as typeof fsp.stat);

    const result = await store.latest();
    expect(result).toBeNull();
  });
});

describe('FirmwareUploadStore — multiple meta files', () => {
  it("latest() picks the most-recently-mtime'd when multiple meta files exist", async () => {
    const uploadsDir = path.join(rootDir, 'uploads');
    fs.mkdirSync(uploadsDir);

    const oldId = '44444444-4444-4444-8444-444444444444';
    const newId = '55555555-5555-4555-8555-555555555555';

    // Plant two complete triples on disk by hand.
    for (const id of [oldId, newId]) {
      const bin = makeFirmwareBytes({ version: id === oldId ? '1.0.0' : '2.0.0' });
      fs.writeFileSync(path.join(uploadsDir, `upload-${id}.bin`), bin);
      fs.writeFileSync(path.join(uploadsDir, `upload-${id}.bin.sha256`), sha256Hex(bin));
      const meta: StoredUploadMeta = {
        uploadId: id,
        originalFilename: 'firmware.bin',
        projectName: 'AstrOs.ESP',
        version: id === oldId ? '1.0.0' : '2.0.0',
        uploadedAt: new Date().toISOString(),
        sizeBytes: bin.length,
      };
      fs.writeFileSync(path.join(uploadsDir, `upload-${id}.meta.json`), JSON.stringify(meta));
    }

    // Force the "newId" meta file to be newest by mtime.
    const oldTime = new Date('2020-01-01').getTime() / 1000;
    const newTime = new Date('2026-01-01').getTime() / 1000;
    fs.utimesSync(path.join(uploadsDir, `upload-${oldId}.meta.json`), oldTime, oldTime);
    fs.utimesSync(path.join(uploadsDir, `upload-${newId}.meta.json`), newTime, newTime);

    const result = await store.latest();
    expect(result?.meta.uploadId).toBe(newId);
    expect(result?.meta.version).toBe('2.0.0');
  });
});
