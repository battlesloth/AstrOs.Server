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

// ---------------------------------------------------------------------------
// On-disk firmware cache. Materializes selected -app.bin assets (from c.3's
// GitHub release listing) onto local disk during a flash job, stream-hashes
// them during download, and prunes older versions to N=5 releases.
//
// Population is strictly on-demand — the orchestrator (c.6) calls fetch()
// when a flash job starts. No prefetch, no background polling.
// See the c.4 plan for context.
// ---------------------------------------------------------------------------

/**
 * Resolves the cache root directory from an env value (typically
 * `process.env.FIRMWARE_CACHE_PATH`). Mirrors `resolveDatabaseDir`'s
 * `%appdata%` sentinel pattern so the two pieces of app state share one
 * mental model:
 *
 *   - unset / empty / `%appdata%` (any case) → `appdata('astrosserver')/firmware-cache`
 *   - any other value → returned verbatim (treated as an absolute or
 *     repo-relative path the operator chose).
 */
export function resolveFirmwareCacheDir(envValue: string | undefined): string {
  if (!envValue || envValue.toLowerCase() === '%appdata%') {
    return path.join(appdata('astrosserver'), 'firmware-cache');
  }
  return envValue;
}

// Subdirectory under the cache root for binaries pulled from GitHub
// releases. `uploads/` will live alongside this in c.5; both share the
// same root so eviction policies and operator-facing paths stay together.
const GITHUB_SUBDIR = 'github';

// Maximum number of *releases* to keep on disk. Multi-variant releases
// (currently 2 variants — lolin_d32_pro + metro_s3) count as one release,
// so worst-case footprint is ~12 MB at full cache (5 × 2 × ~1.2 MB).
const MAX_RELEASES = 5;

// Canonical form of `crypto.createHash('sha256').digest('hex')`: 64 chars
// of [0-9a-f]. Anything else in a .bin.sha256 sidecar means the file is
// corrupted or wasn't written by us — lookup() treats it as a cache miss.
const SHA256_HEX_RE = /^[0-9a-f]{64}$/;

// User-Agent is required by GitHub's CDN-fronted asset endpoints (some
// proxies reject unidentified clients). Accept is intentionally permissive
// here — unlike the API endpoint (where v3 negotiation matters), the asset
// download is just bytes.
const DOWNLOAD_HEADERS: Readonly<Record<string, string>> = {
  'User-Agent': 'AstrOs.Server',
};

// Wall-clock bound on a single download. Without this, a stalled connection
// (server accepts but never sends the body, or a CDN that hangs mid-stream)
// would leave the inFlight entry stuck and hang every subsequent fetch()
// for the same (version, variant). 60 seconds is generous for a 1.2 MB
// firmware binary on slow links while still detecting a true stall.
const DOWNLOAD_TIMEOUT_MS = 60_000;

interface PathTriple {
  githubDir: string;
  bin: string;
  sha: string;
  meta: string;
}

/**
 * Type predicate for meta.json content read off disk. Validates every
 * field of CachedAssetMeta so the predicate is sound: anything narrowed
 * to `value is CachedAssetMeta` here is safe to pass to any consumer of
 * the type — pruneToN's eviction sort (uses tag/version/publishedAt),
 * lookup()'s returned CachedAsset (exposes the whole meta to callers),
 * and any future code that reads sourceUrl/downloadedAt/sizeBytes —
 * without runtime undefined-field crashes despite the compile-time
 * non-null typing. JSON.parse can legitimately yield arrays, null,
 * primitives, or objects with wrong shapes; this predicate is the
 * boundary that keeps any of those out of typed code.
 *
 * Tightening from a partial check (4 fields) to the full interface also
 * acts as defense-in-depth against partial-write corruption: a crash
 * mid-JSON-write that left a truncated-but-parseable object missing
 * trailing fields fails validation here and triggers a re-download
 * rather than poisoning the cache.
 */
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
  // Wall-clock bound on a single download. Tests override this to a tiny
  // value to drive the timeout path in real time without faking timers.
  downloadTimeoutMs?: number;
}

export class FirmwareCache {
  private readonly rootDir: string;
  private readonly fetcher: typeof fetch;
  private readonly downloadTimeoutMs: number;
  // Concurrent fetch() calls for the same key share one underlying download.
  // Keyed by `${version}::${variant}` since those are what determine the
  // on-disk filename triple. Cleared on completion (success or error) so a
  // retry after a failed fetch can actually run.
  private readonly inFlight = new Map<string, Promise<CachedAsset>>();

  constructor(opts: FirmwareCacheOptions = {}) {
    this.rootDir = opts.rootDir ?? resolveFirmwareCacheDir(process.env.FIRMWARE_CACHE_PATH);
    this.fetcher = opts.fetcher ?? fetch;
    this.downloadTimeoutMs = opts.downloadTimeoutMs ?? DOWNLOAD_TIMEOUT_MS;
  }

  /**
   * Stat-based existence check. Returns the cached asset when all three
   * files (.bin, .bin.sha256, .meta.json) are present; null on partial
   * state — an interrupted earlier write left some-but-not-all of the
   * files, and the cache should treat that as a miss rather than risk
   * returning a half-written entry.
   */
  async lookup(version: string, variant: string): Promise<CachedAsset | null> {
    const p = pathsFor(this.rootDir, version, variant);
    try {
      const [binStat, shaText, metaText] = await Promise.all([
        fsp.stat(p.bin),
        fsp.readFile(p.sha, 'utf8'),
        fsp.readFile(p.meta, 'utf8'),
      ]);

      // Validate sidecar contents before returning. JSON.parse('{}') would
      // otherwise typecast cleanly to CachedAssetMeta but leave all fields
      // undefined, crashing later callers that touch meta.tag / meta.publishedAt.
      // A malformed .sha256 (wrong length, non-hex, mixed case) would feed
      // garbage into the protocol layer's hash compare. Treat both cases as
      // a miss so fetch() re-downloads with a fresh, canonical sidecar pair.
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
      // ENOENT on any of the three reads ⇒ partial-or-missing state ⇒ miss.
      // Other errors (permissions, malformed JSON) also count as miss so the
      // orchestrator falls through to fetch() and overwrites, rather than
      // surfacing an obscure read error to a caller that just wanted to know
      // "is this cached?".
      return null;
    }
  }

  /**
   * Materializes the asset on disk if not already cached, then returns
   * the cached entry. The download is streamed: bytes flow through a
   * SHA-256 hasher into a `.tmp` file; on success the sidecars are
   * written and the `.tmp` is atomic-renamed to `.bin`. On any error
   * mid-download, the `.tmp` is unlinked so a retry has a clean slate
   * — the canonical `.bin` is never promoted from a partial body.
   *
   * The `release` parameter supplies metadata (`tag`, `publishedAt`)
   * that the orchestrator has but `AssetInfo` doesn't carry. Both are
   * persisted to the meta sidecar so eviction can sort by semver with
   * `publishedAt` as the tiebreaker even after a container restart.
   */
  async fetch(release: ReleaseInfo, asset: AssetInfo): Promise<CachedAsset> {
    const key = `${asset.version}::${asset.variant}`;
    const existing = this.inFlight.get(key);
    if (existing) return existing;

    // Wrap the whole operation (including the lookup) in the in-flight
    // promise so a second caller can't slip in between lookup() and the
    // download starting and trigger an independent fetch.
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
      // Verify the body landed at the size GitHub claimed. A truncated
      // response that ends cleanly (CDN drops mid-transfer, server sends
      // fewer bytes than Content-Length declared) wouldn't surface as a
      // stream error — only a stat comparison catches it. Flashing a
      // truncated firmware would brick the controller, so this is a hard
      // failure, not a warning.
      const tmpStat = await fsp.stat(tmpPath);
      actualSize = tmpStat.size;
      if (actualSize !== asset.sizeBytes) {
        throw new Error(
          `Firmware size mismatch for ${asset.assetName}: expected ${asset.sizeBytes} bytes, got ${actualSize}`,
        );
      }
    } catch (err) {
      // Best-effort cleanup. `unlink` may itself ENOENT (e.g., the stream
      // errored before any bytes hit disk) — swallow that.
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
      // Use the stat'd size, not asset.sizeBytes — the size-mismatch check
      // above guarantees they're equal at this point, so the sidecar always
      // reflects the bytes actually on disk regardless of input source.
      sizeBytes: actualSize,
    };
    await fsp.writeFile(p.sha, computedSha);
    await fsp.writeFile(p.meta, JSON.stringify(meta, null, 2));
    // Windows fs.rename throws EEXIST if the destination already exists
    // (POSIX overwrites atomically). Recover from a stale .bin left by
    // a crashed earlier write — lookup() would have returned null on
    // partial state, but the orphaned binary itself still occupies the
    // canonical path. Unlink it first so the rename always promotes.
    // ENOENT is the normal case (no stale file); ignore it.
    await fsp.unlink(p.bin).catch((err: unknown) => {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    });
    await fsp.rename(tmpPath, p.bin);

    // Eviction is best-effort and runs after the new entry is fully on disk;
    // a failure here doesn't invalidate the just-cached asset, so log-and-go
    // (no rethrow) — the orchestrator that called fetch() shouldn't fail
    // because of bookkeeping cleanup. The warn surfaces conditions like a
    // permissions issue on the cache dir that would otherwise let the cache
    // grow past MAX_RELEASES forever with no operator-visible signal.
    await this.pruneToN(MAX_RELEASES).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(
        `firmware-cache eviction failed; cache may exceed ${MAX_RELEASES} releases until next successful fetch: ${message}`,
      );
    });

    const binStat = await fsp.stat(p.bin);
    return { path: p.bin, sha256: computedSha, sizeBytes: binStat.size, meta };
  }

  /**
   * Drops cached releases past index `maxReleases - 1` when sorted by semver
   * desc with `publishedAt` desc as tiebreaker. The unit is the release (=
   * unique tag), so both variants of an evicted release are removed together.
   *
   * Read-side robustness: malformed or unreadable meta.json files are
   * skipped (not crashed-on); the rest of the cache continues to be
   * managed normally.
   */
  private async pruneToN(maxReleases: number): Promise<void> {
    const githubDir = path.join(this.rootDir, GITHUB_SUBDIR);
    let entries: import('fs').Dirent[];
    try {
      entries = await fsp.readdir(githubDir, { withFileTypes: true });
    } catch (err) {
      // ENOENT ⇒ cold cache (no github/ dir yet). Silent return is correct;
      // there's nothing to evict. Anything else (EACCES, EIO, ENOTDIR ...)
      // is a real failure that needs operator attention — propagate so the
      // caller's catch can log it.
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw err;
    }

    const META_SUFFIX = '.meta.json';

    // Each entry keeps its source Dirent name alongside the parsed meta.
    // The Dirent name is guaranteed by Node to be a basename (no path
    // separators), so deriving sibling .bin / .bin.sha256 paths from it
    // is safe by construction. JSON content (m.version / m.variant) is
    // consulted only for sort ordering — never for path construction —
    // so a meta sidecar with path-traversal payloads in those fields
    // can't influence which files get unlinked.
    const metaFiles: Array<{ name: string; meta: CachedAssetMeta }> = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(META_SUFFIX)) continue;
      try {
        const text = await fsp.readFile(path.join(githubDir, entry.name), 'utf8');
        const parsed: unknown = JSON.parse(text);
        // Validate the fields that eviction actually consults. JSON.parse('{}')
        // would otherwise typecast cleanly to CachedAssetMeta but blow up
        // later in compareVersions/localeCompare on undefined fields. Skip
        // anything that doesn't carry the four load-bearing strings.
        if (isValidMeta(parsed)) metaFiles.push({ name: entry.name, meta: parsed });
      } catch {
        // Unreadable / malformed-JSON sidecar — skip rather than abort.
      }
    }

    // Group by tag so both variants of the same release stay together.
    const byTag = new Map<string, Array<{ name: string; meta: CachedAssetMeta }>>();
    for (const e of metaFiles) {
      const arr = byTag.get(e.meta.tag);
      if (arr) arr.push(e);
      else byTag.set(e.meta.tag, [e]);
    }

    if (byTag.size <= maxReleases) return;

    // Sort tags by version desc, then publishedAt desc as tiebreak. Use the
    // first member of each group as the representative — all members of a
    // group share the same tag/version/publishedAt by construction.
    const sortedTagGroups = [...byTag.entries()].sort(([, a], [, b]) => {
      const cmp = compareVersions(a[0].meta.version, b[0].meta.version);
      if (!Number.isNaN(cmp) && cmp !== 0) return -cmp; // desc
      // Tied or unparseable: publishedAt desc.
      return b[0].meta.publishedAt.localeCompare(a[0].meta.publishedAt);
    });

    // Evict everything past the keep-window. Paths are derived from each
    // meta file's Dirent name (a guaranteed basename), so unlink targets
    // always live inside githubDir even if the JSON content is hostile.
    for (const [, members] of sortedTagGroups.slice(maxReleases)) {
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

  /**
   * Pipes the response body through a passthrough that updates a SHA-256
   * digest as bytes flow, into a write stream targeting `dest`. Resolves
   * with the lowercase hex digest. `pipeline()` propagates errors across
   * all three streams atomically — a mid-stream abort surfaces as a
   * single rejection, after which the caller is responsible for `unlink`.
   *
   * Bounded by `DOWNLOAD_TIMEOUT_MS`: an `AbortController` is wired into
   * both the `fetch()` call and the pipeline, so a stall at *either* the
   * connection-establishment phase OR mid-body-stream surfaces as a
   * rejection rather than a hang. The catch normalizes the abort path
   * into a URL-naming error so logs and ops responses point at the right
   * thing to investigate.
   */
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

      // Node's `Readable.fromWeb` types its arg as `stream/web`'s ReadableStream
      // even though it accepts the global one at runtime. The cast bridges the
      // nominal mismatch without runtime cost.
      const webBody = response.body as unknown as NodeWebReadableStream<Uint8Array>;
      await pipeline(Readable.fromWeb(webBody), hasher, fs.createWriteStream(dest), {
        signal: controller.signal,
      });
      return hash.digest('hex');
    } catch (err) {
      // If the abort fired we know the cause; turn the (possibly opaque)
      // AbortError into a URL-naming error so logs say what stalled.
      // Otherwise normalize a non-Error rejection (mock fetchers, unusual
      // runtimes) so callers always get an `instanceof Error`.
      if (controller.signal.aborted) {
        throw new Error(`Firmware download timed out after ${this.downloadTimeoutMs}ms: ${url}`);
      }
      throw err instanceof Error ? err : new Error(String(err));
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
