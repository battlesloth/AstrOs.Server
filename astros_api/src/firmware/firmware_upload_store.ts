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
// `<rootDir>/uploads/upload-<uuid>.bin` with sha + meta sidecars; each
// successful store() wipes any prior triple.

const UPLOADS_SUBDIR = 'uploads';
const PARSE_BUFFER_LEN = ESP_APP_DESC_OFFSET + ESP_APP_DESC_SIZE;
// CMake `project()` name embedded by ESP-IDF into esp_app_desc_t.project_name.
// NOT the asset-filename prefix `astros-esp-…-app.bin` (set independently by CI).
const DEFAULT_PROJECT_NAME = 'AstrOs.ESP';

// `git describe --tags --dirty` suffix ESP-IDF appends to esp_app_desc_t.version
// by default. The 4-hex minimum on <sha> guards against false-positive matches
// on short pre-release labels like `-1-gA`.
const GIT_DESCRIBE_SUFFIX_RE = /-\d+-g[0-9a-f]{4,}(?:-dirty)?$/;

// "v1.0.0-RC.1-71-g9a55936-dirty" → "1.0.0-RC.1"
function normalizeEspVersion(raw: string): string {
  let v = raw.replace(GIT_DESCRIBE_SUFFIX_RE, '');
  if (v.startsWith('v') || v.startsWith('V')) {
    v = v.slice(1);
  }
  return v;
}

const SHA256_HEX_RE = /^[0-9a-f]{64}$/;
// Canonical uuid v4 shape (8-4-4-4-12 with `4` version + `[89ab]` variant
// nibbles) — matches exactly what the `uuid` package produces, so
// non-v4 names planted by manual intervention are filtered as
// inconsistent state. ANY_UPLOAD_FILE_RE below is intentionally
// broader: wipe paths must be a superset of read paths so names
// `latest()` rejects can still be cleaned up.
const UPLOAD_META_RE =
  /^upload-([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.meta\.json$/;
// Wipe regex — broader than UPLOAD_META_RE on purpose; see above.
// Case-insensitive extension catches `.BIN` etc. on Windows / macOS HFS+.
const ANY_UPLOAD_FILE_RE = /^upload-.+\.(?:bin|bin\.sha256|meta\.json)$/i;

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

// Typed error for operator-fixable upload failures. The controller maps
// `instanceof FirmwareUploadValidationError` to HTTP 400; everything
// else (IO, permissions, EXDEV) maps to 500.
export type FirmwareUploadValidationCode =
  | 'invalid_header'
  | 'too_short'
  | 'project_mismatch'
  | 'unparseable_version';

export class FirmwareUploadValidationError extends Error {
  readonly code: FirmwareUploadValidationCode;
  constructor(code: FirmwareUploadValidationCode, message: string) {
    super(message);
    this.name = 'FirmwareUploadValidationError';
    this.code = code;
  }
}

// Catches the partial-write case where `.meta.json` is parseable JSON
// but missing fields — type narrowing here, null-miss in latest().
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
  // Serializes store() calls. Two concurrent stores would otherwise race
  // their wipe passes against each other's just-renamed .bin files
  // (A.rename → B.wipe unlinks A.bin → A.writeFile(sha,meta) → A returns
  // success on a missing bin). Last-writer-wins requires the second
  // writer to see the first's *completed* state, not its mid-promote state.
  private inFlightStore: Promise<unknown> = Promise.resolve();

  constructor(opts: FirmwareUploadStoreOptions = {}) {
    this.rootDir = opts.rootDir ?? resolveFirmwareCacheDir(process.env.FIRMWARE_CACHE_PATH);
    this.expectedProjectName = opts.expectedProjectName ?? DEFAULT_PROJECT_NAME;
  }

  // Validates the upload's esp_app_desc header, stream-hashes the
  // file, and atomically promotes it into the single upload slot.
  //
  // **Public contract:** `store()` unconditionally consumes `tempPath`.
  // On success it's renamed into `upload-<uuid>.bin`; on any failure
  // (open, read, parse, validation, hash, mkdir, persist) the catch
  // unlinks it. Callers do not need to clean up tempPath on a throw.
  //
  // Validation failures (bad project, unparseable version) throw
  // before the wipe pass runs, so a rejected upload never destroys
  // the prior firmware. Persist-phase failures attempt to leave the
  // slot empty, but both the wipe and the rollback are best-effort —
  // EACCES/EBUSY on a sibling unlink is logged and swallowed, so a
  // failed store can leave the prior triple, partial new state, or
  // both on disk. latest()'s uuid + sizeBytes cross-checks turn any
  // inconsistent combination into a null miss, and the next
  // successful store retries the wipe.
  async store(tempPath: string, originalFilename: string): Promise<StoredUpload> {
    // Chain through the in-flight promise so concurrent calls run in
    // submission order. The .catch()s prevent a rejection (here or in
    // a prior call) from poisoning the chain for subsequent callers.
    const next = this.inFlightStore
      .catch(() => undefined)
      .then(() => this.doStore(tempPath, originalFilename));
    this.inFlightStore = next.catch(() => undefined);
    return next;
  }

  private async doStore(tempPath: string, originalFilename: string): Promise<StoredUpload> {
    const uploadId = uuid_v4();
    const p = pathsFor(this.rootDir, uploadId);

    try {
      // Read just the header — avoids materializing the whole 1.2 MB binary.
      const headBuf = Buffer.alloc(PARSE_BUFFER_LEN);
      const fh = await fsp.open(tempPath);
      try {
        const { bytesRead } = await fh.read(headBuf, 0, PARSE_BUFFER_LEN, 0);
        if (bytesRead < PARSE_BUFFER_LEN) {
          throw new FirmwareUploadValidationError(
            'too_short',
            `firmware upload too short: read ${bytesRead} bytes, need at least ${PARSE_BUFFER_LEN}`,
          );
        }
      } finally {
        await fh.close();
      }
      // parseEspAppDesc throws plain Error on magic/control/null-term/UTF-8/
      // buffer-too-short failures — wrap as a typed validation error so the
      // controller's 400-vs-500 dispatch keys off `instanceof` rather than
      // message text.
      let desc;
      try {
        desc = parseEspAppDesc(headBuf);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        throw new FirmwareUploadValidationError('invalid_header', detail);
      }

      if (desc.projectName !== this.expectedProjectName) {
        throw new FirmwareUploadValidationError(
          'project_mismatch',
          `firmware upload project name mismatch: got ${JSON.stringify(desc.projectName)}, expected ${JSON.stringify(this.expectedProjectName)}`,
        );
      }
      // ESP-IDF embeds `git describe --tags --dirty` into the version field
      // by default; normalize so meta.version aligns with the clean semver
      // that GitHub-release filenames produce.
      const normalizedVersion = normalizeEspVersion(desc.version);
      // compareVersions returns NaN for unparseable input — self-compare is 0 iff well-formed.
      if (Number.isNaN(compareVersions(normalizedVersion, normalizedVersion))) {
        throw new FirmwareUploadValidationError(
          'unparseable_version',
          `firmware upload version unparseable: ${JSON.stringify(desc.version)} (normalized: ${JSON.stringify(normalizedVersion)})`,
        );
      }

      // for-await over createReadStream rather than stream/promises.pipeline:
      // we don't have (or want) a Writable destination — the bytes already
      // live at tempPath. The loop handles backpressure and auto-closes the
      // fd on exit/error.
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

      await this.wipePriorUploads(p.uploadsDir);
      // EXDEV here = caller's tempFileDir is on a different filesystem
      // from <rootDir>/uploads/. Config error; propagate.
      await fsp.rename(tempPath, p.bin);
      await fsp.writeFile(p.sha, sha256);
      await fsp.writeFile(p.meta, JSON.stringify(meta, null, 2));

      return { path: p.bin, sha256, sizeBytes, meta };
    } catch (err) {
      // Blind unlink: ENOENT on files that weren't created (early failure)
      // or vanished pre-call (`tempPath` on fh.open ENOENT) is harmless.
      await Promise.all([
        fsp.unlink(tempPath).catch(() => undefined),
        fsp.unlink(p.bin).catch(() => undefined),
        fsp.unlink(p.sha).catch(() => undefined),
        fsp.unlink(p.meta).catch(() => undefined),
      ]);
      throw err;
    }
  }

  // Returns the most-recent stored upload, or null on cold cache,
  // partial-write, or any inconsistency. Defensive by design — any
  // missing or malformed sidecar, or any cross-file mismatch, maps
  // to a null miss rather than throwing.
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
      // Multiple meta files = corruption or external intervention.
      // Newest-by-mtime so the operator's most-recent action wins.
      logger.warn(
        { uploadsDir, metaFiles },
        'multiple firmware-upload meta files detected; picking newest by mtime',
      );
      // Per-stat .catch: a file deleted between readdir and stat (race
      // with a concurrent store()'s wipe pass) is skipped rather than
      // failing the whole batch.
      const stats = await Promise.all(
        metaFiles.map(async (name) => {
          try {
            const st = await fsp.stat(path.join(uploadsDir, name));
            return { name, mtimeMs: st.mtimeMs };
          } catch {
            return null;
          }
        }),
      );
      const valid = stats.filter((s): s is { name: string; mtimeMs: number } => s !== null);
      if (valid.length === 0) return null;
      valid.sort((a, b) => b.mtimeMs - a.mtimeMs);
      chosenName = valid[0].name;
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
      // Cross-checks for triple consistency: filename-uuid mismatch
      // means a sidecar was copied/renamed across uploads; size
      // mismatch means meta is stale relative to bin (truncation /
      // partial-write recovery). Sha-vs-bin would be stronger but
      // costs ~80–100 ms per call; the orchestrator re-hashes anyway.
      if (parsed.uploadId !== uploadId) return null;
      if (parsed.sizeBytes !== binStat.size) return null;
      return { path: p.bin, sha256, sizeBytes: binStat.size, meta: parsed };
    } catch (err) {
      // Intentional broad catch: ENOENT / JSON parse / shape-validation
      // misses all map to null per the method's contract (operator sees
      // "no upload available; pick a firmware binary"). But EACCES /
      // EISDIR / EIO mean the on-disk state is something the operator
      // can't fix from the UI alone — log so an admin can distinguish
      // "no sidecar" from "permission denied on the uploads dir." Use
      // warn (not error) because the path is part of normal "no upload
      // yet" startup state; an admin reading the logs sorts by error
      // code, not by frequency.
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== undefined && code !== 'ENOENT') {
        logger.warn(
          { uploadId, code, err },
          'firmware_upload_store.latest(): treating non-ENOENT failure as a null miss',
        );
      }
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
