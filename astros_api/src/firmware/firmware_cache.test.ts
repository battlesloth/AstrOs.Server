import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import fs, { promises as fsp } from 'fs';
import os from 'os';
import path from 'path';
import appdata from 'appdata-path';
import { FirmwareCache, resolveFirmwareCacheDir } from './firmware_cache.js';
import { logger } from '../logger.js';
import type { CachedAssetMeta } from '../models/firmware/cache.js';
import type { AssetInfo, ReleaseInfo } from '../models/firmware/release.js';

// ---------------------------------------------------------------------------
// resolveFirmwareCacheDir — env-var resolution mirrors resolveDatabaseDir's
// %appdata% sentinel pattern. Tests intentionally parallel the DB tests so
// the two pieces of state share one mental model.
// ---------------------------------------------------------------------------

describe('resolveFirmwareCacheDir', () => {
  const defaultDir = path.join(appdata('astrosserver'), 'firmware-cache');

  it('falls back to appdata/firmware-cache when env is undefined', () => {
    expect(resolveFirmwareCacheDir(undefined)).toBe(defaultDir);
  });

  it('falls back to appdata/firmware-cache when env is empty string', () => {
    expect(resolveFirmwareCacheDir('')).toBe(defaultDir);
  });

  it('falls back to appdata/firmware-cache for %AppData% sentinel', () => {
    expect(resolveFirmwareCacheDir('%AppData%')).toBe(defaultDir);
  });

  it('falls back to appdata/firmware-cache for lowercase %appdata%', () => {
    expect(resolveFirmwareCacheDir('%appdata%')).toBe(defaultDir);
  });

  it('falls back to appdata/firmware-cache for uppercase %APPDATA%', () => {
    expect(resolveFirmwareCacheDir('%APPDATA%')).toBe(defaultDir);
  });

  it('returns the env value verbatim for a custom path', () => {
    expect(resolveFirmwareCacheDir('/var/lib/astros/firmware-cache')).toBe(
      '/var/lib/astros/firmware-cache',
    );
  });
});

// ---------------------------------------------------------------------------
// Test helpers — build the on-disk filename triple (bin + .bin.sha256 +
// .meta.json) for a given (version, variant). Mirrors the layout the cache
// itself produces so tests can pre-populate state for read-side assertions.
// ---------------------------------------------------------------------------

function pathsFor(rootDir: string, version: string, variant: string) {
  const baseName = `astros-esp-${version}-${variant}-app`;
  const githubDir = path.join(rootDir, 'github');
  return {
    githubDir,
    bin: path.join(githubDir, `${baseName}.bin`),
    sha: path.join(githubDir, `${baseName}.bin.sha256`),
    meta: path.join(githubDir, `${baseName}.meta.json`),
  };
}

function makeMeta(overrides: Partial<CachedAssetMeta> = {}): CachedAssetMeta {
  return {
    tag: 'v1.0.0',
    version: '1.0.0',
    variant: 'metro_s3',
    downloadedAt: '2026-05-01T07:30:00Z',
    publishedAt: '2026-04-15T00:00:00Z',
    sourceUrl: 'https://example.test/astros-esp-1.0.0-metro_s3-app.bin',
    sizeBytes: 1234567,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// FirmwareCache.lookup — stat-based existence check; reads sidecars when all
// three files are present; returns null on partial state (defensive against
// an interrupted earlier write).
// ---------------------------------------------------------------------------

describe('FirmwareCache.lookup', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fw-cache-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns null when nothing is cached', async () => {
    const cache = new FirmwareCache({ rootDir: tmpDir });
    expect(await cache.lookup('1.0.0', 'metro_s3')).toBeNull();
  });

  it('returns the cached asset when all three files exist', async () => {
    const p = pathsFor(tmpDir, '1.0.0', 'metro_s3');
    fs.mkdirSync(p.githubDir, { recursive: true });
    const binBytes = Buffer.from('fake-firmware-bytes');
    const sha = 'abc123def456';
    const meta = makeMeta();
    fs.writeFileSync(p.bin, binBytes);
    fs.writeFileSync(p.sha, sha);
    fs.writeFileSync(p.meta, JSON.stringify(meta));

    const cache = new FirmwareCache({ rootDir: tmpDir });
    const result = await cache.lookup('1.0.0', 'metro_s3');

    expect(result).not.toBeNull();
    expect(result?.path).toBe(p.bin);
    expect(result?.sha256).toBe(sha);
    expect(result?.sizeBytes).toBe(binBytes.length);
    expect(result?.meta).toEqual(meta);
  });

  it('returns null when only the .bin exists (no sidecars)', async () => {
    const p = pathsFor(tmpDir, '1.0.0', 'metro_s3');
    fs.mkdirSync(p.githubDir, { recursive: true });
    fs.writeFileSync(p.bin, 'data');
    // No .sha256, no .meta.json — interrupted earlier write would look like this.

    const cache = new FirmwareCache({ rootDir: tmpDir });
    expect(await cache.lookup('1.0.0', 'metro_s3')).toBeNull();
  });

  it('returns null when only the .meta.json exists (no .bin)', async () => {
    const p = pathsFor(tmpDir, '1.0.0', 'metro_s3');
    fs.mkdirSync(p.githubDir, { recursive: true });
    fs.writeFileSync(p.meta, JSON.stringify(makeMeta()));

    const cache = new FirmwareCache({ rootDir: tmpDir });
    expect(await cache.lookup('1.0.0', 'metro_s3')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// FirmwareCache.fetch — cold-cache download path. Streams the body through a
// SHA-256 hasher into a .tmp file, writes the two sidecars, atomic-renames
// .tmp → .bin. Mid-stream failures must remove the .tmp.
// ---------------------------------------------------------------------------

function makeRelease(overrides: Partial<ReleaseInfo> = {}): ReleaseInfo {
  return {
    tag: 'v1.0.0',
    version: '1.0.0',
    publishedAt: '2026-04-15T00:00:00Z',
    prerelease: false,
    assets: [],
    ...overrides,
  };
}

function makeAsset(overrides: Partial<AssetInfo> = {}): AssetInfo {
  return {
    variant: 'metro_s3',
    version: '1.0.0',
    assetName: 'astros-esp-1.0.0-metro_s3-app.bin',
    assetUrl: 'https://example.test/astros-esp-1.0.0-metro_s3-app.bin',
    sizeBytes: 19,
    ...overrides,
  };
}

function makeFetcherReturning(body: Buffer | Uint8Array): typeof fetch {
  return vi.fn(
    async () =>
      new Response(body, { status: 200, headers: { 'content-type': 'application/octet-stream' } }),
  ) as unknown as typeof fetch;
}

describe('FirmwareCache.fetch', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fw-cache-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('on cold cache: downloads, writes all three files, returns CachedAsset', async () => {
    const bytes = Buffer.from('fake-firmware-bytes');
    const expectedSha = crypto.createHash('sha256').update(bytes).digest('hex');
    const fetcher = makeFetcherReturning(bytes);
    const cache = new FirmwareCache({ rootDir: tmpDir, fetcher });
    const release = makeRelease();
    const asset = makeAsset({ sizeBytes: bytes.length });

    const result = await cache.fetch(release, asset);

    const p = pathsFor(tmpDir, '1.0.0', 'metro_s3');
    expect(fs.existsSync(p.bin)).toBe(true);
    expect(fs.existsSync(p.sha)).toBe(true);
    expect(fs.existsSync(p.meta)).toBe(true);
    // No leftover .tmp on success.
    expect(fs.existsSync(p.bin + '.tmp')).toBe(false);

    expect(fs.readFileSync(p.bin)).toEqual(bytes);
    expect(fs.readFileSync(p.sha, 'utf8')).toBe(expectedSha);
    expect(result.path).toBe(p.bin);
    expect(result.sha256).toBe(expectedSha);
    expect(result.sizeBytes).toBe(bytes.length);
    expect(result.meta.tag).toBe('v1.0.0');
    expect(result.meta.version).toBe('1.0.0');
    expect(result.meta.variant).toBe('metro_s3');
    expect(result.meta.publishedAt).toBe('2026-04-15T00:00:00Z');
    expect(result.meta.sourceUrl).toBe(asset.assetUrl);
  });

  it('on warm cache: returns the cached entry without re-fetching', async () => {
    const bytes = Buffer.from('fake-firmware-bytes');
    const fetcher = makeFetcherReturning(bytes);
    const cache = new FirmwareCache({ rootDir: tmpDir, fetcher });
    const release = makeRelease();
    const asset = makeAsset({ sizeBytes: bytes.length });

    await cache.fetch(release, asset); // warm
    const result = await cache.fetch(release, asset); // should hit cache

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.path).toBe(pathsFor(tmpDir, '1.0.0', 'metro_s3').bin);
  });

  it('cleans up the .tmp and rejects when the download stream errors mid-flight', async () => {
    const fetcher: typeof fetch = vi.fn(async () => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3, 4]));
          // Error after one chunk — simulates a connection drop mid-download.
          queueMicrotask(() => controller.error(new Error('connection lost')));
        },
      });
      return new Response(body, { status: 200 });
    }) as unknown as typeof fetch;

    const cache = new FirmwareCache({ rootDir: tmpDir, fetcher });
    const release = makeRelease();
    const asset = makeAsset();

    await expect(cache.fetch(release, asset)).rejects.toThrow(/connection lost/);

    const p = pathsFor(tmpDir, '1.0.0', 'metro_s3');
    // .tmp must not be left behind so a retry has a clean slate.
    expect(fs.existsSync(p.bin + '.tmp')).toBe(false);
    // The .bin must NOT have been promoted from a partial .tmp.
    expect(fs.existsSync(p.bin)).toBe(false);
    // Sidecars must not exist either.
    expect(fs.existsSync(p.sha)).toBe(false);
    expect(fs.existsSync(p.meta)).toBe(false);
  });

  it('rejects when the downloaded size does not match AssetInfo.sizeBytes', async () => {
    // A truncated response that ends cleanly (CDN drops mid-transfer, server
    // sends fewer bytes than Content-Length declared) would otherwise be
    // cached as legitimate firmware. Flashing a truncated binary bricks the
    // controller — this MUST be a hard failure with cleanup, not a warning.
    const bytes = Buffer.from('shorter-than-claimed');
    const fetcher = makeFetcherReturning(bytes);
    const cache = new FirmwareCache({ rootDir: tmpDir, fetcher });

    await expect(
      cache.fetch(makeRelease(), makeAsset({ sizeBytes: bytes.length + 100 })),
    ).rejects.toThrow(/size mismatch/i);

    // .tmp removed; canonical .bin never promoted; sidecars never written.
    const p = pathsFor(tmpDir, '1.0.0', 'metro_s3');
    expect(fs.existsSync(p.bin + '.tmp')).toBe(false);
    expect(fs.existsSync(p.bin)).toBe(false);
    expect(fs.existsSync(p.sha)).toBe(false);
    expect(fs.existsSync(p.meta)).toBe(false);
  });

  it('overwrites a stale .bin left by an interrupted earlier write (Windows-rename semantics)', async () => {
    // Scenario: an earlier fetch wrote the .bin but crashed before sidecars
    // landed (or sidecars went malformed). lookup() correctly returns null
    // — partial state is treated as miss — but the leftover .bin is still
    // on disk. On POSIX, fs.rename overwrites atomically; on Windows it
    // throws EEXIST. fetch() must recover on either platform.
    //
    // The Linux runner can't naturally exhibit the Windows behavior, so
    // spy on fsp.rename to simulate it: throw EEXIST when the destination
    // already exists, otherwise delegate to the real rename. This forces
    // fetch() to either unlink-before-rename or otherwise tolerate the
    // existing destination — passing on every supported platform.
    const realRename = fsp.rename.bind(fsp);
    vi.spyOn(fsp, 'rename').mockImplementation(async (oldPath, newPath) => {
      let destExists = true;
      try {
        await fsp.access(newPath as fs.PathLike);
      } catch {
        destExists = false;
      }
      if (destExists) {
        throw Object.assign(
          new Error(`EEXIST: file exists, rename '${String(oldPath)}' -> '${String(newPath)}'`),
          { code: 'EEXIST' },
        );
      }
      return realRename(oldPath as fs.PathLike, newPath as fs.PathLike);
    });

    // Pre-create a stale .bin (no sidecars — lookup returns null).
    const p = pathsFor(tmpDir, '1.0.0', 'metro_s3');
    fs.mkdirSync(p.githubDir, { recursive: true });
    fs.writeFileSync(p.bin, Buffer.from('STALE-CONTENT-FROM-CRASHED-WRITE'));

    const fresh = Buffer.from('fresh-firmware-bytes');
    const fetcher = makeFetcherReturning(fresh);
    const cache = new FirmwareCache({ rootDir: tmpDir, fetcher });

    await cache.fetch(makeRelease(), makeAsset({ sizeBytes: fresh.length }));

    // .bin now contains the new bytes; sidecars present; no .tmp leftover.
    expect(fs.readFileSync(p.bin)).toEqual(fresh);
    expect(fs.existsSync(p.sha)).toBe(true);
    expect(fs.existsSync(p.meta)).toBe(true);
    expect(fs.existsSync(p.bin + '.tmp')).toBe(false);

    vi.restoreAllMocks();
  });

  it('rejects on non-2xx HTTP response', async () => {
    const fetcher: typeof fetch = vi.fn(
      async () => new Response('Not Found', { status: 404, statusText: 'Not Found' }),
    ) as unknown as typeof fetch;
    const cache = new FirmwareCache({ rootDir: tmpDir, fetcher });

    await expect(cache.fetch(makeRelease(), makeAsset())).rejects.toThrow(/404/);
  });

  // -------------------------------------------------------------------------
  // Eviction — pruneToN(5) fires after every successful fetch() write. The
  // unit is the release (= unique tag), not the individual binary, so both
  // variants of a release are evicted together.
  // -------------------------------------------------------------------------

  function populateCache(
    rootDir: string,
    version: string,
    variant: string,
    publishedAt: string,
    body = `bytes-${version}-${variant}`,
  ) {
    const p = pathsFor(rootDir, version, variant);
    fs.mkdirSync(p.githubDir, { recursive: true });
    const bytes = Buffer.from(body);
    const sha = crypto.createHash('sha256').update(bytes).digest('hex');
    fs.writeFileSync(p.bin, bytes);
    fs.writeFileSync(p.sha, sha);
    fs.writeFileSync(
      p.meta,
      JSON.stringify(
        makeMeta({
          tag: `v${version}`,
          version,
          variant,
          publishedAt,
          sizeBytes: bytes.length,
        }),
      ),
    );
  }

  it('evicts the oldest release when adding a 6th (single-variant releases)', async () => {
    // Pre-populate v1.0.0..v1.4.0, single-variant each. Note: publishedAt
    // descends with version so tiebreak doesn't kick in — pure semver order.
    populateCache(tmpDir, '1.0.0', 'metro_s3', '2026-01-01T00:00:00Z');
    populateCache(tmpDir, '1.1.0', 'metro_s3', '2026-02-01T00:00:00Z');
    populateCache(tmpDir, '1.2.0', 'metro_s3', '2026-03-01T00:00:00Z');
    populateCache(tmpDir, '1.3.0', 'metro_s3', '2026-04-01T00:00:00Z');
    populateCache(tmpDir, '1.4.0', 'metro_s3', '2026-04-15T00:00:00Z');

    const bytes = Buffer.from('v1.5.0-bytes');
    const fetcher = makeFetcherReturning(bytes);
    const cache = new FirmwareCache({ rootDir: tmpDir, fetcher });
    await cache.fetch(
      makeRelease({ tag: 'v1.5.0', version: '1.5.0', publishedAt: '2026-04-30T00:00:00Z' }),
      makeAsset({ version: '1.5.0', sizeBytes: bytes.length }),
    );

    // Oldest gone (all three sidecars).
    const evicted = pathsFor(tmpDir, '1.0.0', 'metro_s3');
    expect(fs.existsSync(evicted.bin)).toBe(false);
    expect(fs.existsSync(evicted.sha)).toBe(false);
    expect(fs.existsSync(evicted.meta)).toBe(false);

    // Newest five still present.
    for (const v of ['1.1.0', '1.2.0', '1.3.0', '1.4.0', '1.5.0']) {
      expect(fs.existsSync(pathsFor(tmpDir, v, 'metro_s3').bin)).toBe(true);
    }
  });

  it('evicts both variants of the oldest release together (multi-variant)', async () => {
    // 5 releases × 2 variants = 10 cached entries. Adding a 6th release
    // pushes us past N=5; eviction must drop both variants of v1.0.0
    // together (not split lolin and metro across the eviction boundary).
    populateCache(tmpDir, '1.0.0', 'metro_s3', '2026-01-01T00:00:00Z');
    populateCache(tmpDir, '1.0.0', 'lolin_d32_pro', '2026-01-01T00:00:00Z');
    populateCache(tmpDir, '1.1.0', 'metro_s3', '2026-02-01T00:00:00Z');
    populateCache(tmpDir, '1.1.0', 'lolin_d32_pro', '2026-02-01T00:00:00Z');
    populateCache(tmpDir, '1.2.0', 'metro_s3', '2026-03-01T00:00:00Z');
    populateCache(tmpDir, '1.2.0', 'lolin_d32_pro', '2026-03-01T00:00:00Z');
    populateCache(tmpDir, '1.3.0', 'metro_s3', '2026-04-01T00:00:00Z');
    populateCache(tmpDir, '1.3.0', 'lolin_d32_pro', '2026-04-01T00:00:00Z');
    populateCache(tmpDir, '1.4.0', 'metro_s3', '2026-04-15T00:00:00Z');
    populateCache(tmpDir, '1.4.0', 'lolin_d32_pro', '2026-04-15T00:00:00Z');

    const bytes = Buffer.from('v1.5.0-bytes');
    const fetcher = makeFetcherReturning(bytes);
    const cache = new FirmwareCache({ rootDir: tmpDir, fetcher });
    await cache.fetch(
      makeRelease({ tag: 'v1.5.0', version: '1.5.0', publishedAt: '2026-04-30T00:00:00Z' }),
      makeAsset({ version: '1.5.0', sizeBytes: bytes.length }),
    );

    // Both variants of v1.0.0 gone (the oldest release).
    expect(fs.existsSync(pathsFor(tmpDir, '1.0.0', 'metro_s3').bin)).toBe(false);
    expect(fs.existsSync(pathsFor(tmpDir, '1.0.0', 'lolin_d32_pro').bin)).toBe(false);

    // Pre-populated newer releases survive in both variants.
    for (const v of ['1.1.0', '1.2.0', '1.3.0', '1.4.0']) {
      expect(fs.existsSync(pathsFor(tmpDir, v, 'metro_s3').bin)).toBe(true);
      expect(fs.existsSync(pathsFor(tmpDir, v, 'lolin_d32_pro').bin)).toBe(true);
    }
    // The just-fetched v1.5.0 only had its metro_s3 variant downloaded —
    // lolin would arrive on a separate fetch() call from the orchestrator.
    expect(fs.existsSync(pathsFor(tmpDir, '1.5.0', 'metro_s3').bin)).toBe(true);
  });

  it('skips structurally-valid-but-malformed meta.json files during eviction', async () => {
    // JSON.parse({}) yields an object that satisfies the CachedAssetMeta
    // type assertion at compile time but has all-undefined fields at
    // runtime. Without explicit validation, eviction would push this entry
    // into the sort and `b[0].publishedAt.localeCompare(...)` would throw
    // "Cannot read properties of undefined" — taking the whole prune pass
    // out and triggering the (now-logging) outer catch on every fetch().
    //
    // The 6 well-formed entries plus 1 malformed should evict v1.0.0 (the
    // oldest of the well-formed ones), the malformed entry should be
    // ignored entirely, and the just-fetched v1.5.0 should land cleanly.
    populateCache(tmpDir, '1.0.0', 'metro_s3', '2026-01-01T00:00:00Z');
    populateCache(tmpDir, '1.1.0', 'metro_s3', '2026-02-01T00:00:00Z');
    populateCache(tmpDir, '1.2.0', 'metro_s3', '2026-03-01T00:00:00Z');
    populateCache(tmpDir, '1.3.0', 'metro_s3', '2026-04-01T00:00:00Z');
    populateCache(tmpDir, '1.4.0', 'metro_s3', '2026-04-15T00:00:00Z');
    // Drop a `{}` meta into the cache directory — would crash compareVersions
    // / localeCompare without validation.
    const githubDir = path.join(tmpDir, 'github');
    fs.writeFileSync(path.join(githubDir, 'astros-esp-malformed-app.meta.json'), '{}');

    const bytes = Buffer.from('v1.5.0-bytes');
    const fetcher = makeFetcherReturning(bytes);
    const cache = new FirmwareCache({ rootDir: tmpDir, fetcher });
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);

    // fetch must succeed; eviction must NOT throw because of the bad file.
    await cache.fetch(
      makeRelease({ tag: 'v1.5.0', version: '1.5.0', publishedAt: '2026-04-30T00:00:00Z' }),
      makeAsset({ version: '1.5.0', sizeBytes: bytes.length }),
    );

    // The legitimate eviction still happened (oldest well-formed entry gone).
    expect(fs.existsSync(pathsFor(tmpDir, '1.0.0', 'metro_s3').bin)).toBe(false);
    expect(fs.existsSync(pathsFor(tmpDir, '1.5.0', 'metro_s3').bin)).toBe(true);
    // No warn — malformed-file skipping is in-band, not an error condition.
    expect(warnSpy).not.toHaveBeenCalled();

    vi.restoreAllMocks();
  });

  it('logs a warning when eviction fails so operators can diagnose disk growth', async () => {
    // pruneToN swallows ENOENT (cold-cache, no github/ dir yet) but lets
    // other readdir failures propagate. The fetch() call site catches and
    // logs without rethrowing, so the just-cached asset is still returned
    // even though the bookkeeping pass blew up. Without the log, an EACCES
    // (or anything else preventing pruneToN from running) would silently
    // let the cache grow past N=5 and the operator would have no signal.
    const bytes = Buffer.from('test-bytes');
    const fetcher = makeFetcherReturning(bytes);
    const cache = new FirmwareCache({ rootDir: tmpDir, fetcher });

    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    // Force readdir to fail with a non-ENOENT — only fires on the prune
    // pass after the .bin write completes (lookup uses stat/readFile, not
    // readdir, so the warm-cache check isn't affected).
    vi.spyOn(fsp, 'readdir').mockRejectedValueOnce(
      Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' }),
    );

    // fetch() must STILL succeed — eviction failures are non-fatal.
    const result = await cache.fetch(makeRelease(), makeAsset({ sizeBytes: bytes.length }));
    expect(result.path).toBe(pathsFor(tmpDir, '1.0.0', 'metro_s3').bin);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toMatch(/EACCES/);

    vi.restoreAllMocks();
  });

  it('breaks semver ties by publishedAt (older publishedAt evicted first)', async () => {
    // compareVersions treats `1.2.0` and `1.2.0-RC.1` as equal (pre-release
    // suffix is stripped for gating purposes). Eviction must therefore
    // disambiguate via publishedAt — the older publishedAt loses.
    populateCache(tmpDir, '1.0.0', 'metro_s3', '2026-01-01T00:00:00Z');
    populateCache(tmpDir, '1.1.0', 'metro_s3', '2026-02-01T00:00:00Z');
    populateCache(tmpDir, '1.2.0', 'metro_s3', '2026-04-01T00:00:00Z'); // newer same-base
    populateCache(tmpDir, '1.2.0-RC.1', 'metro_s3', '2026-03-15T00:00:00Z'); // older same-base
    populateCache(tmpDir, '1.3.0', 'metro_s3', '2026-04-15T00:00:00Z');

    const bytes = Buffer.from('v1.4.0-bytes');
    const fetcher = makeFetcherReturning(bytes);
    const cache = new FirmwareCache({ rootDir: tmpDir, fetcher });
    await cache.fetch(
      makeRelease({ tag: 'v1.4.0', version: '1.4.0', publishedAt: '2026-04-30T00:00:00Z' }),
      makeAsset({ version: '1.4.0', sizeBytes: bytes.length }),
    );

    // v1.0.0 is the oldest in pure semver — that's the eviction target, NOT
    // the RC (which loses its tiebreak with v1.2.0 but is still newer than v1.0.0).
    expect(fs.existsSync(pathsFor(tmpDir, '1.0.0', 'metro_s3').bin)).toBe(false);
    expect(fs.existsSync(pathsFor(tmpDir, '1.2.0-RC.1', 'metro_s3').bin)).toBe(true);
    expect(fs.existsSync(pathsFor(tmpDir, '1.2.0', 'metro_s3').bin)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Download timeout — without this, a stalled fetch (server accepts the
  // connection but never sends the body) would leave the inFlight entry
  // stuck and hang every subsequent fetch() for the same key. The real-prod
  // timeout is 60s; tests inject a tiny one (50ms) so the timeout path runs
  // in actual real time without the fragility of fake-timer microtask flushes.
  // -------------------------------------------------------------------------

  it('aborts a hanging download after the timeout with a URL-naming error', async () => {
    // Hanging fetcher: only rejects when the AbortController fires. Without
    // the signal-respecting branch in streamDownload, this test would hit
    // vitest's default 5s timeout — a generic "test timed out" rather than
    // the descriptive "Firmware download timed out" we want surfaced to ops.
    const hangingFetcher: typeof fetch = vi.fn(async (_url, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    }) as unknown as typeof fetch;

    const cache = new FirmwareCache({
      rootDir: tmpDir,
      fetcher: hangingFetcher,
      downloadTimeoutMs: 50,
    });

    await expect(cache.fetch(makeRelease(), makeAsset())).rejects.toThrow(
      /timed out.*example\.test/i,
    );
  });

  it('clears the inFlight slot on timeout so a retry can proceed', async () => {
    // Critical: a stalled download must not poison the inFlight Map. After
    // the timeout aborts the first fetch, a second fetch for the same key
    // must invoke the fetcher again rather than awaiting the dead promise.
    let mode: 'hang' | 'ok' = 'hang';
    const bytes = Buffer.from('post-retry-bytes');
    const fetcher: typeof fetch = vi.fn(async (_url, init?: RequestInit) => {
      if (mode === 'hang') {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      }
      return new Response(bytes, { status: 200 });
    }) as unknown as typeof fetch;

    const cache = new FirmwareCache({
      rootDir: tmpDir,
      fetcher,
      downloadTimeoutMs: 50,
    });
    const release = makeRelease();
    const asset = makeAsset({ sizeBytes: bytes.length });

    // First call hangs and times out.
    await expect(cache.fetch(release, asset)).rejects.toThrow(/timed out/i);

    // Flip to success and retry — this MUST call the fetcher again
    // (i.e., not be hung on the dead inFlight slot).
    mode = 'ok';
    const second = await cache.fetch(release, asset);
    expect(second.path).toBe(pathsFor(tmpDir, '1.0.0', 'metro_s3').bin);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('dedups concurrent fetch() calls for the same (version, variant)', async () => {
    // Stampede scenario: two callers race to materialize the same asset on
    // a cold cache. Without dedup, both would download independently — wasting
    // bandwidth and racing on the same .tmp filename. With dedup, the second
    // caller awaits the first's in-flight promise.
    const bytes = Buffer.from('fake-firmware-bytes');
    let resolveFetch: ((response: Response) => void) | null = null;
    const fetcher: typeof fetch = vi.fn(
      async () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    ) as unknown as typeof fetch;

    const cache = new FirmwareCache({ rootDir: tmpDir, fetcher });
    const release = makeRelease();
    const asset = makeAsset({ sizeBytes: bytes.length });

    const p1 = cache.fetch(release, asset);
    const p2 = cache.fetch(release, asset);

    // The first call's lookup() must finish (multiple async fs reads on a
    // cold cache, each ENOENT-rejecting) before streamDownload calls the
    // fetcher. Poll rather than wait a fixed delay so the test stays fast.
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));

    if (resolveFetch === null) throw new Error('expected fetcher to have captured its resolver');
    (resolveFetch as (r: Response) => void)(new Response(bytes, { status: 200 }));

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toEqual(r2);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
