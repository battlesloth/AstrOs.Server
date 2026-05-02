import crypto from 'crypto';
import fs, { promises as fsp } from 'fs';
import path from 'path';
import { v4 as uuid_v4 } from 'uuid';
import { logger } from '../logger.js';
import type { StoredUpload, StoredUploadMeta } from '../models/firmware/upload.js';
import { compareVersions } from '../utility/semver.js';
import { ESP_APP_DESC_OFFSET, ESP_APP_DESC_SIZE, parseEspAppDesc } from './esp_app_desc.js';
import { resolveFirmwareCacheDir } from './firmware_cache.js';
import { assertPathSafe } from './path_safety.js';

// Single-slot upload store. The user-supplied .bin lives at
// `<rootDir>/uploads/upload-<uuid>.bin` with sha + meta sidecars. Each
// successful store() wipes any prior triple. The orchestrator (c.6)
// consumes via latest(); the route (c.8) feeds via store(). See the
// c.5 plan for context and the failure-mode inventory.

const UPLOADS_SUBDIR = 'uploads';
const PARSE_BUFFER_LEN = ESP_APP_DESC_OFFSET + ESP_APP_DESC_SIZE;
// Matches the CMake `project()` call in AstrOs.ESP/CMakeLists.txt —
// ESP-IDF embeds that name verbatim into esp_app_desc_t.project_name.
// NOT the asset-filename prefix `astros-esp-…-app.bin`, which is set
// independently by CI tooling. Verified against a real firmware.bin
// during c.5 implementation.
const DEFAULT_PROJECT_NAME = 'AstrOs.ESP';

// `git describe --tags --dirty` suffix that ESP-IDF appends to
// esp_app_desc_t.version when neither CONFIG_APP_PROJECT_VER_FROM_CONFIG
// nor a version.txt file is set. Pattern: `-<count>-g<short-sha>(-dirty)?`.
// Anchored at end so the dash-separated count + sha don't match anywhere
// inside legitimate pre-release labels like `1.0.0-RC.1`. The 4-hex
// minimum on <sha> guards against false positives — short pre-release
// labels like `-1-gA` won't match (and real short SHAs are ≥4 hex).
const GIT_DESCRIBE_SUFFIX_RE = /-\d+-g[0-9a-f]{4,}(?:-dirty)?$/;

// Strips the leading `v` and trailing git-describe suffix from a raw
// esp_app_desc_t.version string. Real example from a dev build:
//   "v1.0.0-RC.1-71-g9a55936-dirty"  →  "1.0.0-RC.1"
// Already-clean inputs pass through unchanged.
function normalizeEspVersion(raw: string): string {
  let v = raw.replace(GIT_DESCRIBE_SUFFIX_RE, '');
  if (v.startsWith('v') || v.startsWith('V')) {
    v = v.slice(1);
  }
  return v;
}

const SHA256_HEX_RE = /^[0-9a-f]{64}$/;
// uuid v4 is 36 chars: 8-4-4-4-12 hex with dashes.
const UPLOAD_META_RE = /^upload-([0-9a-f-]{36})\.meta\.json$/;
// Used by the wipe pass to find any prior upload triple regardless of
// uuid (the new uuid is fresh; the old one is whatever was there).
const ANY_UPLOAD_FILE_RE = /^upload-[0-9a-f-]+\.(?:bin|bin\.sha256|meta\.json)$/;

export interface FirmwareUploadStoreOptions {
  rootDir?: string;
  expectedProjectName?: string;
}

interface UploadPathTriple {
  uploadsDir: string;
  bin: string;
  sha: string;
  meta: string;
}

function pathsFor(rootDir: string, uploadId: string): UploadPathTriple {
  // Defense-in-depth — uuid v4 always passes by construction.
  assertPathSafe(uploadId, 'uploadId');
  const baseName = `upload-${uploadId}`;
  const uploadsDir = path.join(rootDir, UPLOADS_SUBDIR);
  return {
    uploadsDir,
    bin: path.join(uploadsDir, `${baseName}.bin`),
    sha: path.join(uploadsDir, `${baseName}.bin.sha256`),
    meta: path.join(uploadsDir, `${baseName}.meta.json`),
  };
}

// Validates every field of StoredUploadMeta so type narrowing is sound
// and a partial-write that's parseable JSON but missing trailing fields
// fails here and triggers a latest()-returns-null defensive miss.
function isValidUploadMeta(value: unknown): value is StoredUploadMeta {
  if (value === null || typeof value !== 'object') return false;
  const m = value as Record<string, unknown>;
  return (
    typeof m.uploadId === 'string' &&
    typeof m.originalFilename === 'string' &&
    typeof m.projectName === 'string' &&
    typeof m.version === 'string' &&
    typeof m.uploadedAt === 'string' &&
    typeof m.sizeBytes === 'number'
  );
}

export class FirmwareUploadStore {
  private readonly rootDir: string;
  private readonly expectedProjectName: string;

  constructor(opts: FirmwareUploadStoreOptions = {}) {
    this.rootDir = opts.rootDir ?? resolveFirmwareCacheDir(process.env.FIRMWARE_CACHE_PATH);
    this.expectedProjectName = opts.expectedProjectName ?? DEFAULT_PROJECT_NAME;
  }

  // Validates the temp file's esp_app_desc header, stream-hashes the
  // full file, then atomically promotes it into the single upload slot.
  // Validation failures (bad project, unparseable version) throw before
  // touching the prior upload, so a rejected upload never destroys the
  // previously-stored firmware. Persist-phase failures DO wipe the
  // prior triple (via the wipe pass) — by design, a half-completed
  // store leaves the slot empty rather than mixing old and new state.
  async store(tempPath: string, originalFilename: string): Promise<StoredUpload> {
    const uploadId = uuid_v4();
    const p = pathsFor(this.rootDir, uploadId);

    // Read just the header — no need to materialize the whole 1.2 MB
    // binary in memory to identify it.
    const headBuf = Buffer.alloc(PARSE_BUFFER_LEN);
    const fh = await fsp.open(tempPath);
    try {
      const { bytesRead } = await fh.read(headBuf, 0, PARSE_BUFFER_LEN, 0);
      if (bytesRead < PARSE_BUFFER_LEN) {
        throw new Error(
          `firmware upload too short: read ${bytesRead} bytes, need at least ${PARSE_BUFFER_LEN}`,
        );
      }
    } finally {
      // Unconditional close — without this a parse-failure path leaks
      // the fd until process exit.
      await fh.close();
    }
    const desc = parseEspAppDesc(headBuf);

    if (desc.projectName !== this.expectedProjectName) {
      throw new Error(
        `firmware upload project name mismatch: got ${JSON.stringify(desc.projectName)}, expected ${JSON.stringify(this.expectedProjectName)}`,
      );
    }
    // ESP-IDF embeds `git describe --tags --dirty` into esp_app_desc.version
    // by default. Strip the leading `v` and the trailing `-<N>-g<sha>(-dirty)?`
    // suffix so the persisted meta.version is a clean semver matching what
    // the GitHub-release path produces from filename parsing — c.6's
    // orchestrator can then compare the two without per-source casing.
    const normalizedVersion = normalizeEspVersion(desc.version);
    // compareVersions returns NaN for unparseable inputs and 0 for equal;
    // self-comparison succeeds iff the version is well-formed.
    if (Number.isNaN(compareVersions(normalizedVersion, normalizedVersion))) {
      throw new Error(
        `firmware upload version unparseable: ${JSON.stringify(desc.version)} (normalized: ${JSON.stringify(normalizedVersion)})`,
      );
    }

    // Stream-hash the whole file. The for-await loop handles backpressure
    // and auto-closes the underlying fd on loop exit / error; using
    // `pipeline` would require a Writable destination we don't need.
    const hash = crypto.createHash('sha256');
    let sizeBytes = 0;
    const readStream = fs.createReadStream(tempPath);
    for await (const chunk of readStream) {
      sizeBytes += (chunk as Buffer).length;
      hash.update(chunk as Buffer);
    }
    const sha256 = hash.digest('hex');

    await fsp.mkdir(p.uploadsDir, { recursive: true });

    const meta: StoredUploadMeta = {
      uploadId,
      originalFilename,
      projectName: desc.projectName,
      version: normalizedVersion,
      uploadedAt: new Date().toISOString(),
      sizeBytes,
    };

    try {
      // Wipe any prior upload triple — best-effort; ENOENT swallowed for
      // first-ever store; non-ENOENT logged but not fatal because the
      // rename below either succeeds (orphan stays, swept by next store)
      // or fails (catch handles cleanup).
      await this.wipePriorUploads(p.uploadsDir);
      // Promote: tempPath → upload-<uuid>.bin. Atomic on same filesystem.
      // EXDEV here means c.8's tempFileDir is on a different fs from
      // <rootDir>/uploads/ — config error, propagate.
      await fsp.rename(tempPath, p.bin);
      await fsp.writeFile(p.sha, sha256);
      await fsp.writeFile(p.meta, JSON.stringify(meta, null, 2));
    } catch (err) {
      // Symmetric persist-phase rollback. Blind unlink with swallow —
      // ENOENT for files that weren't created yet is fine. Includes the
      // tempPath in case rename failed before consuming it.
      await Promise.all([
        fsp.unlink(tempPath).catch(() => undefined),
        fsp.unlink(p.bin).catch(() => undefined),
        fsp.unlink(p.sha).catch(() => undefined),
        fsp.unlink(p.meta).catch(() => undefined),
      ]);
      throw err;
    }

    return { path: p.bin, sha256, sizeBytes, meta };
  }

  // Returns the most-recent stored upload, or null on cold cache /
  // partial-write / corruption. Mirrors c.4 lookup()'s defensive
  // behavior: any missing or malformed sidecar maps to a null miss
  // rather than an obscure read error.
  async latest(): Promise<StoredUpload | null> {
    const uploadsDir = path.join(this.rootDir, UPLOADS_SUBDIR);

    let entries: string[];
    try {
      entries = await fsp.readdir(uploadsDir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }

    const metaFiles = entries.filter((name) => UPLOAD_META_RE.test(name));
    if (metaFiles.length === 0) return null;

    let chosenName: string;
    if (metaFiles.length === 1) {
      chosenName = metaFiles[0];
    } else {
      // Multiple meta files imply corruption or external intervention.
      // Pick newest by mtime so the operator's most-recent action wins,
      // log a warning so the noise is visible.
      logger.warn(
        { uploadsDir, metaFiles },
        'multiple firmware-upload meta files detected; picking newest by mtime',
      );
      const stats = await Promise.all(
        metaFiles.map(async (name) => ({
          name,
          mtimeMs: (await fsp.stat(path.join(uploadsDir, name))).mtimeMs,
        })),
      );
      stats.sort((a, b) => b.mtimeMs - a.mtimeMs);
      chosenName = stats[0].name;
    }

    const match = chosenName.match(UPLOAD_META_RE);
    if (!match) return null;
    const uploadId = match[1];
    const p = pathsFor(this.rootDir, uploadId);

    try {
      const [binStat, shaText, metaText] = await Promise.all([
        fsp.stat(p.bin),
        fsp.readFile(p.sha, 'utf8'),
        fsp.readFile(p.meta, 'utf8'),
      ]);
      const sha256 = shaText.trim();
      if (!SHA256_HEX_RE.test(sha256)) return null;
      const parsed: unknown = JSON.parse(metaText);
      if (!isValidUploadMeta(parsed)) return null;
      return { path: p.bin, sha256, sizeBytes: binStat.size, meta: parsed };
    } catch {
      // ENOENT, EACCES, malformed JSON — all map to miss so callers
      // get a clean null rather than an obscure read error.
      return null;
    }
  }

  private async wipePriorUploads(uploadsDir: string): Promise<void> {
    let entries: string[];
    try {
      entries = await fsp.readdir(uploadsDir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw err;
    }
    const targets = entries.filter((name) => ANY_UPLOAD_FILE_RE.test(name));
    await Promise.all(
      targets.map((name) =>
        fsp.unlink(path.join(uploadsDir, name)).catch((err: NodeJS.ErrnoException) => {
          if (err.code !== 'ENOENT') {
            logger.warn({ uploadsDir, name, err }, 'failed to unlink prior upload sibling');
          }
        }),
      ),
    );
  }
}
