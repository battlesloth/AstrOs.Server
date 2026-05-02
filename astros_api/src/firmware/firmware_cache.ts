import crypto from 'crypto';
import fs, { promises as fsp } from 'fs';
import path from 'path';
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';
import type { ReadableStream as NodeWebReadableStream } from 'stream/web';
import appdata from 'appdata-path';
import { logger } from '../logger.js';
import type { CachedAsset, CachedAssetMeta } from '../models/firmware/cache.js';
import type { AssetInfo, ReleaseInfo } from '../models/firmware/release.js';
import { compareVersions } from '../utility/semver.js';

// On-disk firmware cache. Materializes -app.bin assets onto local disk,
// stream-hashes during download, and prunes to N=5 releases. See the c.4
// plan for context.

// Mirrors `resolveDatabaseDir`'s `%appdata%` sentinel so cache and SQLite
// DB share the same OS-resolved appdata parent.
export function resolveFirmwareCacheDir(envValue: string | undefined): string {
  if (!envValue || envValue.toLowerCase() === '%appdata%') {
    return path.join(appdata('astrosserver'), 'firmware-cache');
  }
  return envValue;
}

const GITHUB_SUBDIR = 'github';

// Eviction unit is the *release*, not the binary; multi-variant releases
// count as one. Worst-case ~12 MB at 5 × 2 variants × ~1.2 MB.
const MAX_RELEASES = 5;

// `crypto.createHash('sha256').digest('hex')` is 64 lowercase hex chars.
// Anything else in a .bin.sha256 means corruption — treat as a miss.
const SHA256_HEX_RE = /^[0-9a-f]{64}$/;

// Allowlist for `version`/`variant` interpolated into cache filenames.
// First char alphanumeric (forbids leading-dot hidden files and
// leading-hyphen flag lookalikes); body allows the chars real semver and
// PlatformIO env names use — '.' for version dots, '-' for pre-release
// labels (1.2.0-RC.1), '+' for build metadata (1.0.0+build.123), '_' for
// variant underscores (lolin_d32_pro). Excludes path separators, drive
// letters, parent refs, embedded nulls. Upstream c.3 captures version as
// `(.+)` so this is the only guard for it; variant is defense-in-depth.
const PATH_SAFE_RE = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/;

function assertPathSafe(value: string, kind: 'version' | 'variant'): void {
  if (!PATH_SAFE_RE.test(value)) {
    throw new Error(
      `Invalid firmware ${kind} for cache path: ${JSON.stringify(value)} contains characters that aren't filename-safe`,
    );
  }
}

// User-Agent is required by GitHub's CDN; Accept is omitted because asset
// download isn't a v3 API call.
const DOWNLOAD_HEADERS: Readonly<Record<string, string>> = {
  'User-Agent': 'AstrOs.Server',
};

// Without a timeout, a stalled connection would pin the inFlight entry
// and hang every subsequent fetch() for the same key.
const DOWNLOAD_TIMEOUT_MS = 60_000;

interface PathTriple {
  githubDir: string;
  bin: string;
  sha: string;
  meta: string;
}

// Validates every field of CachedAssetMeta so the type narrowing is
// sound for all consumers, and so a partial-write that's parseable-JSON
// but missing trailing fields fails here and triggers a re-download.
function isValidMeta(value: unknown): value is CachedAssetMeta {
  if (value === null || typeof value !== 'object') return false;
  const m = value as Record<string, unknown>;
  return (
    typeof m.tag === 'string' &&
    typeof m.version === 'string' &&
    typeof m.variant === 'string' &&
    typeof m.downloadedAt === 'string' &&
    typeof m.publishedAt === 'string' &&
    typeof m.sourceUrl === 'string' &&
    typeof m.sizeBytes === 'number'
  );
}

function pathsFor(rootDir: string, version: string, variant: string): PathTriple {
  // Validate at the chokepoint so both lookup() and fetch() are covered
  // by a single check before any filesystem work happens.
  assertPathSafe(version, 'version');
  assertPathSafe(variant, 'variant');
  const baseName = `astros-esp-${version}-${variant}-app`;
  const githubDir = path.join(rootDir, GITHUB_SUBDIR);
  return {
    githubDir,
    bin: path.join(githubDir, `${baseName}.bin`),
    sha: path.join(githubDir, `${baseName}.bin.sha256`),
    meta: path.join(githubDir, `${baseName}.meta.json`),
  };
}

export interface FirmwareCacheOptions {
  rootDir?: string;
  fetcher?: typeof fetch;
  // Tests override this to drive the timeout path in real time without
  // faking timers.
  downloadTimeoutMs?: number;
}

export class FirmwareCache {
  private readonly rootDir: string;
  private readonly fetcher: typeof fetch;
  private readonly downloadTimeoutMs: number;
  // Keyed by `${version}::${variant}`. Cleared on completion so a retry
  // after a failed fetch can actually run.
  private readonly inFlight = new Map<string, Promise<CachedAsset>>();

  constructor(opts: FirmwareCacheOptions = {}) {
    this.rootDir = opts.rootDir ?? resolveFirmwareCacheDir(process.env.FIRMWARE_CACHE_PATH);
    this.fetcher = opts.fetcher ?? fetch;
    this.downloadTimeoutMs = opts.downloadTimeoutMs ?? DOWNLOAD_TIMEOUT_MS;
  }

  // Returns the cached asset when all three sidecar files are present
  // and well-formed; null on partial/missing/malformed state so fetch()
  // re-downloads instead of returning a half-written entry.
  async lookup(version: string, variant: string): Promise<CachedAsset | null> {
    const p = pathsFor(this.rootDir, version, variant);
    try {
      const [binStat, shaText, metaText] = await Promise.all([
        fsp.stat(p.bin),
        fsp.readFile(p.sha, 'utf8'),
        fsp.readFile(p.meta, 'utf8'),
      ]);

      const sha256 = shaText.trim();
      if (!SHA256_HEX_RE.test(sha256)) return null;
      const parsed: unknown = JSON.parse(metaText);
      if (!isValidMeta(parsed)) return null;

      return {
        path: p.bin,
        sha256,
        sizeBytes: binStat.size,
        meta: parsed,
      };
    } catch {
      // ENOENT, permissions, malformed JSON — all map to miss so callers
      // get a clean fetch() fallthrough rather than an obscure read error.
      return null;
    }
  }

  // Materializes the asset on disk if not already cached. Stream-hashes
  // bytes through a `.tmp` file, writes sidecars, atomic-renames to
  // `.bin`. `release` is needed alongside `asset` because the meta
  // sidecar persists `tag` and `publishedAt` (which AssetInfo lacks) so
  // eviction's semver+publishedAt sort is stable across restarts.
  async fetch(release: ReleaseInfo, asset: AssetInfo): Promise<CachedAsset> {
    const key = `${asset.version}::${asset.variant}`;
    const existing = this.inFlight.get(key);
    if (existing) return existing;

    // Wrap lookup+download together so a second caller can't slip in
    // between lookup() and download-start and trigger an independent fetch.
    const work = this.fetchInternal(release, asset).finally(() => {
      this.inFlight.delete(key);
    });
    this.inFlight.set(key, work);
    return work;
  }

  private async fetchInternal(release: ReleaseInfo, asset: AssetInfo): Promise<CachedAsset> {
    const cached = await this.lookup(asset.version, asset.variant);
    if (cached) return cached;

    const p = pathsFor(this.rootDir, asset.version, asset.variant);
    await fsp.mkdir(p.githubDir, { recursive: true });
    const tmpPath = `${p.bin}.tmp`;

    let computedSha: string;
    let actualSize: number;
    try {
      computedSha = await this.streamDownload(asset.assetUrl, tmpPath);
      // A truncated CDN response would close cleanly without a stream
      // error; only a stat comparison catches it. Flashing a truncated
      // firmware would brick the controller, so hard-fail.
      const tmpStat = await fsp.stat(tmpPath);
      actualSize = tmpStat.size;
      if (actualSize !== asset.sizeBytes) {
        throw new Error(
          `Firmware size mismatch for ${asset.assetName}: expected ${asset.sizeBytes} bytes, got ${actualSize}`,
        );
      }
    } catch (err) {
      await fsp.unlink(tmpPath).catch(() => undefined);
      throw err;
    }

    const meta: CachedAssetMeta = {
      tag: release.tag,
      version: asset.version,
      variant: asset.variant,
      downloadedAt: new Date().toISOString(),
      publishedAt: release.publishedAt,
      sourceUrl: asset.assetUrl,
      sizeBytes: actualSize,
    };
    try {
      // Promote .bin BEFORE writing sidecars so any mid-persist crash
      // yields lookup-miss state, not a mismatched 3-file hit (stale
      // .bin + new sidecars). Windows fs.rename throws EEXIST if dest
      // exists; POSIX overwrites atomically. Unlink any stale .bin
      // first so rename always promotes; ENOENT is the normal case.
      await fsp.unlink(p.bin).catch((err: unknown) => {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      });
      await fsp.rename(tmpPath, p.bin);
      await fsp.writeFile(p.sha, computedSha);
      await fsp.writeFile(p.meta, JSON.stringify(meta, null, 2));
    } catch (err) {
      // Persist-phase failure (ENOSPC on writeFile, EACCES on rename,
      // EXDEV across filesystems...). Roll back to a clean miss state.
      // The just-promoted .bin gets unlinked too — without sidecars
      // it would otherwise sit as a ~1.2 MB orphan until the next
      // fetch on the same key, since pruneToN's sweep only handles .tmp.
      await Promise.all([
        fsp.unlink(tmpPath).catch(() => undefined),
        fsp.unlink(p.bin).catch(() => undefined),
        fsp.unlink(p.sha).catch(() => undefined),
        fsp.unlink(p.meta).catch(() => undefined),
      ]);
      throw err;
    }

    // Best-effort eviction: log-and-continue so a bookkeeping failure
    // doesn't fail the just-cached fetch. release.tag pins the
    // just-written entry so an older-version fetch into a full cache
    // doesn't see its own .bin evicted as the "oldest" of N+1.
    await this.pruneToN(MAX_RELEASES, release.tag).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(
        `firmware-cache eviction failed; cache may exceed ${MAX_RELEASES} releases until next successful fetch: ${message}`,
      );
    });

    const binStat = await fsp.stat(p.bin);
    return { path: p.bin, sha256: computedSha, sizeBytes: binStat.size, meta };
  }

  // Drops releases past `maxReleases` (sorted semver desc, publishedAt
  // desc as tiebreak) and sweeps orphan `.bin.tmp` files. Eviction unit
  // is the release (= unique tag), so both variants are removed
  // together. `keepTag` pins a tag against eviction — typically the
  // just-fetched release.tag, so an older-version fetch into a full
  // cache doesn't self-destruct. Malformed/unreadable meta.json files
  // are skipped, not crashed-on.
  private async pruneToN(maxReleases: number, keepTag?: string): Promise<void> {
    const githubDir = path.join(this.rootDir, GITHUB_SUBDIR);
    let entries: import('fs').Dirent[];
    try {
      entries = await fsp.readdir(githubDir, { withFileTypes: true });
    } catch (err) {
      // ENOENT = cold cache, nothing to do. Other errors (EACCES, EIO,
      // ENOTDIR) propagate so the caller's catch can log them.
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw err;
    }

    const META_SUFFIX = '.meta.json';
    const TMP_SUFFIX = '.bin.tmp';

    const SHA_SUFFIX = '.bin.sha256';
    const BIN_SUFFIX = '.bin';

    // Sweep three classes of garbage that lookup() can't return AND
    // meta-based eviction can't see, so none contribute to the
    // MAX_RELEASES accounting:
    //   1) orphan .tmp files (process killed mid-download)
    //   2) malformed/unreadable meta.json files
    //   3) orphan .bin / .bin.sha256 with no .meta.json (process
    //      killed during the persist phase between rename and the
    //      writeFile of either sidecar)
    // Without explicit cleanup, all three classes accumulate
    // indefinitely and defeat the advertised retention policy.
    //
    // Snapshot in-flight basenames synchronously (before any await)
    // so a concurrent fetch's mid-persist files are preserved.
    // Protects three distinct races: orphan .tmp during streamDownload,
    // promoted .bin between rename and sidecar writes, and partially-
    // written .meta.json mid-writeFile that would otherwise read as
    // malformed JSON. Residual race: a fetch whose `inFlight.set` runs
    // after this snapshot could lose any of its files; consequence is
    // bounded — stream error or hash mismatch on the protocol layer,
    // user retries succeed, never a partial .bin promoted to canonical.
    const liveBasenames = new Set<string>();
    for (const key of this.inFlight.keys()) {
      const [version, variant] = key.split('::');
      liveBasenames.add(`astros-esp-${version}-${variant}-app`);
    }

    // Dirent.name is guaranteed by Node to be a basename, so paths
    // derived from it stay inside githubDir even if a meta sidecar's
    // JSON content carries path-traversal payloads.
    const trackedBasenames = new Set<string>();
    const metaFiles: Array<{ name: string; meta: CachedAssetMeta }> = [];
    const sweepPaths: string[] = [];

    // Pass 1: validate metas. The just-fetched fetch's own meta IS
    // fully written by the time pruneToN runs (writeFile meta is the
    // last persist step before this call), so we read every meta —
    // skipping all in-flight basenames here would lose the just-
    // fetched entry from trackedBasenames and the eviction sort.
    // The in-flight skip applies only to the malformed-meta cleanup:
    // a CONCURRENT fetch's mid-writeFile-meta could read as partial
    // JSON and fail validation; we mustn't unlink that.
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(META_SUFFIX)) continue;
      const baseName = entry.name.slice(0, -META_SUFFIX.length);
      let valid = false;
      try {
        const text = await fsp.readFile(path.join(githubDir, entry.name), 'utf8');
        const parsed: unknown = JSON.parse(text);
        if (isValidMeta(parsed)) {
          metaFiles.push({ name: entry.name, meta: parsed });
          trackedBasenames.add(baseName);
          valid = true;
        }
      } catch {
        // Unreadable / malformed JSON — fall through to cleanup.
      }
      if (!valid && !liveBasenames.has(baseName)) {
        // Sweep the bad meta. Siblings (if any) get caught by the
        // orphan-by-no-meta pass below since their basename is now
        // neither tracked nor in-flight.
        sweepPaths.push(path.join(githubDir, entry.name));
      }
    }

    // Pass 2: any .tmp / .bin / .bin.sha256 whose basename is neither
    // tracked (= valid meta exists) nor in-flight is sweep-eligible.
    for (const entry of entries) {
      if (!entry.isFile() || entry.name.endsWith(META_SUFFIX)) continue;
      let baseName: string;
      // Order matters: .bin.tmp and .bin.sha256 must match before .bin.
      if (entry.name.endsWith(TMP_SUFFIX)) {
        baseName = entry.name.slice(0, -TMP_SUFFIX.length);
      } else if (entry.name.endsWith(SHA_SUFFIX)) {
        baseName = entry.name.slice(0, -SHA_SUFFIX.length);
      } else if (entry.name.endsWith(BIN_SUFFIX)) {
        baseName = entry.name.slice(0, -BIN_SUFFIX.length);
      } else {
        continue;
      }
      if (liveBasenames.has(baseName)) continue;
      if (trackedBasenames.has(baseName)) continue;
      sweepPaths.push(path.join(githubDir, entry.name));
    }

    if (sweepPaths.length > 0) {
      await Promise.all(sweepPaths.map((p) => fsp.unlink(p).catch(() => undefined)));
    }

    // Group by tag so both variants of the same release stay together.
    const byTag = new Map<string, Array<{ name: string; meta: CachedAssetMeta }>>();
    for (const e of metaFiles) {
      const arr = byTag.get(e.meta.tag);
      if (arr) arr.push(e);
      else byTag.set(e.meta.tag, [e]);
    }

    if (byTag.size <= maxReleases) return;

    // First member of each group represents the tag — all members share
    // tag/version/publishedAt by construction.
    const sortedTagGroups = [...byTag.entries()].sort(([, a], [, b]) => {
      const cmp = compareVersions(a[0].meta.version, b[0].meta.version);
      if (!Number.isNaN(cmp) && cmp !== 0) return -cmp;
      return b[0].meta.publishedAt.localeCompare(a[0].meta.publishedAt);
    });

    // Pin keepTag first, then fill remaining slots with newest others.
    // Set.add is idempotent if keepTag is already in sortedTagGroups,
    // so the size check is what bounds the loop.
    const keepers = new Set<string>();
    if (keepTag !== undefined && byTag.has(keepTag)) {
      keepers.add(keepTag);
    }
    for (const [tag] of sortedTagGroups) {
      if (keepers.size >= maxReleases) break;
      keepers.add(tag);
    }

    for (const [tag, members] of sortedTagGroups) {
      if (keepers.has(tag)) continue;
      for (const e of members) {
        const baseName = e.name.slice(0, -META_SUFFIX.length);
        const metaPath = path.join(githubDir, e.name);
        const binPath = path.join(githubDir, `${baseName}.bin`);
        const shaPath = path.join(githubDir, `${baseName}.bin.sha256`);
        await Promise.all([
          fsp.unlink(binPath).catch(() => undefined),
          fsp.unlink(shaPath).catch(() => undefined),
          fsp.unlink(metaPath).catch(() => undefined),
        ]);
      }
    }
  }

  // Streams the response body into `dest` while updating a SHA-256
  // hash, returning the lowercase hex digest. The shared AbortController
  // bounds both the fetch() call and the pipeline, so a stall at the
  // connect phase OR mid-body surfaces as a rejection. On error the
  // `.tmp` is left for the caller to unlink.
  private async streamDownload(url: string, dest: string): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.downloadTimeoutMs);
    try {
      const response = await this.fetcher(url, {
        headers: DOWNLOAD_HEADERS,
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(
          `Firmware download failed: ${url} returned ${response.status} ${response.statusText}`,
        );
      }
      if (!response.body) {
        throw new Error(`Firmware download has no body: ${url}`);
      }

      const hash = crypto.createHash('sha256');
      const hasher = new Transform({
        transform(chunk: Buffer, _enc, cb) {
          hash.update(chunk);
          cb(null, chunk);
        },
      });

      // Readable.fromWeb's TS type wants `stream/web`'s ReadableStream
      // but accepts the global one at runtime; the cast bridges the
      // nominal mismatch without runtime cost.
      const webBody = response.body as unknown as NodeWebReadableStream<Uint8Array>;
      await pipeline(Readable.fromWeb(webBody), hasher, fs.createWriteStream(dest), {
        signal: controller.signal,
      });
      return hash.digest('hex');
    } catch (err) {
      // If the abort fired, surface a URL-naming error instead of an
      // opaque AbortError so logs identify what stalled. Otherwise
      // normalize non-Error rejections (mock fetchers, unusual runtimes).
      if (controller.signal.aborted) {
        throw new Error(`Firmware download timed out after ${this.downloadTimeoutMs}ms: ${url}`);
      }
      throw err instanceof Error ? err : new Error(String(err));
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
