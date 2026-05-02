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
    // Restore globally so spies set up inside individual tests can't leak
    // into later tests when an assertion throws before the test reaches
    // its own restore call. Without this, a single failing test that
    // spied on fs/logger would mutate live module exports for the rest
    // of the run, producing misleading downstream failures.
    vi.restoreAllMocks();
  });

  it('returns null when nothing is cached', async () => {
    const cache = new FirmwareCache({ rootDir: tmpDir });
    expect(await cache.lookup('1.0.0', 'metro_s3')).toBeNull();
  });

  it('returns the cached asset when all three files exist', async () => {
    const p = pathsFor(tmpDir, '1.0.0', 'metro_s3');
    fs.mkdirSync(p.githubDir, { recursive: true });
    const binBytes = Buffer.from('fake-firmware-bytes');
    const sha = crypto.createHash('sha256').update(binBytes).digest('hex');
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

  it('returns null when meta.json parses but is missing required fields', async () => {
    // Defensive: JSON.parse('{}') succeeds and would type-cast cleanly to
    // CachedAssetMeta, but the resulting object has all-undefined fields.
    // Returning that to a caller would crash downstream code that touches
    // meta.tag.localeCompare(...), meta.publishedAt, etc. Treat as a miss
    // so the orchestrator falls through to fetch() and re-downloads.
    const p = pathsFor(tmpDir, '1.0.0', 'metro_s3');
    fs.mkdirSync(p.githubDir, { recursive: true });
    const binBytes = Buffer.from('fake-firmware-bytes');
    const sha = crypto.createHash('sha256').update(binBytes).digest('hex');
    fs.writeFileSync(p.bin, binBytes);
    fs.writeFileSync(p.sha, sha);
    fs.writeFileSync(p.meta, '{}');

    const cache = new FirmwareCache({ rootDir: tmpDir });
    expect(await cache.lookup('1.0.0', 'metro_s3')).toBeNull();
  });

  it('returns null when meta.json has the eviction fields but is missing other required fields', async () => {
    // Soundness: isValidMeta's type predicate narrows to the full
    // CachedAssetMeta interface, so any meta returned from lookup() must
    // carry every interface field — not just the four the eviction sort
    // consults. Otherwise callers reading result.meta.sourceUrl /
    // .sizeBytes / .downloadedAt would get `undefined` despite the type
    // system promising `string` / `number`. Treating as a miss keeps the
    // narrowed type honest.
    const p = pathsFor(tmpDir, '1.0.0', 'metro_s3');
    fs.mkdirSync(p.githubDir, { recursive: true });
    const binBytes = Buffer.from('fake-firmware-bytes');
    const sha = crypto.createHash('sha256').update(binBytes).digest('hex');
    fs.writeFileSync(p.bin, binBytes);
    fs.writeFileSync(p.sha, sha);
    // Has tag/version/variant/publishedAt (the eviction quartet) but
    // omits downloadedAt, sourceUrl, sizeBytes — would slip past a
    // 4-field-only predicate.
    fs.writeFileSync(
      p.meta,
      JSON.stringify({
        tag: 'v1.0.0',
        version: '1.0.0',
        variant: 'metro_s3',
        publishedAt: '2026-04-15T00:00:00Z',
      }),
    );

    const cache = new FirmwareCache({ rootDir: tmpDir });
    expect(await cache.lookup('1.0.0', 'metro_s3')).toBeNull();
  });

  it('returns null when sha256 sidecar is not a 64-char lowercase hex digest', async () => {
    // crypto.createHash('sha256').digest('hex') always produces 64 chars
    // of [0-9a-f], so anything else means the sidecar is corrupted or
    // wasn't written by us. Returning a malformed digest to the protocol
    // layer would surface as a far-downstream verify mismatch — better
    // to treat as a miss and re-download.
    const p = pathsFor(tmpDir, '1.0.0', 'metro_s3');
    fs.mkdirSync(p.githubDir, { recursive: true });
    fs.writeFileSync(p.bin, 'data');
    fs.writeFileSync(p.sha, 'abc123def456'); // 12 chars — wrong length
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

// ---------------------------------------------------------------------------
// Filename-safety validation — pathsFor() interpolates `version` and
// `variant` into cache filenames before passing them to path.join(). The
// upstream c.3 ASSET_PATTERN constrains variant to [a-z0-9_]+ but captures
// version as `(.+)` — so a release asset named with path separators or
// parent-dir refs in the version slot would parse cleanly into AssetInfo
// and let the cache write outside <rootDir>/github/. The cache must
// validate both inputs at the chokepoint and fail fast.
// ---------------------------------------------------------------------------

describe('FirmwareCache filename-safety validation', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fw-cache-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  // Each value is something path.join() would happily absorb into an escape
  // or hidden-file write if the cache didn't validate first. The label is
  // for test-output readability only.
  const UNSAFE_INPUTS: Array<[string, string]> = [
    ['forward slash (POSIX separator)', '1.0.0/../../etc'],
    ['backslash (Windows separator)', '1.0.0\\..\\..\\etc'],
    ['parent reference alone', '..'],
    ['drive letter (Windows)', 'C:foo'],
    ['empty string', ''],
    ['leading dot (hidden file)', '.hidden'],
    ['embedded null byte', '1.0.0\x00.bin'],
  ];

  for (const [label, unsafeVersion] of UNSAFE_INPUTS) {
    it(`lookup rejects an unsafe version: ${label}`, async () => {
      const cache = new FirmwareCache({ rootDir: tmpDir });
      await expect(cache.lookup(unsafeVersion, 'metro_s3')).rejects.toThrow(/filename-safe/);
    });
  }

  it('lookup rejects an unsafe variant for defense-in-depth (upstream regex normally constrains it)', async () => {
    const cache = new FirmwareCache({ rootDir: tmpDir });
    await expect(cache.lookup('1.0.0', 'metro/../../foo')).rejects.toThrow(/filename-safe/);
  });

  it('fetch rejects unsafe input without invoking the fetcher or touching disk', async () => {
    // Sentinel outside the cache dir to prove validation runs BEFORE any
    // path.join could normalize the unsafe input into an escape — if
    // validation fired late, '../foo' would resolve to <tmpDir>/foo and
    // we'd see a write there.
    const sentinel = path.join(tmpDir, 'foo');
    const fetcher = vi.fn() as unknown as typeof fetch;
    const cache = new FirmwareCache({ rootDir: tmpDir, fetcher });

    await expect(cache.fetch(makeRelease(), makeAsset({ version: '1.0.0/foo' }))).rejects.toThrow(
      /filename-safe/,
    );

    expect(fetcher).not.toHaveBeenCalled();
    expect(fs.existsSync(sentinel)).toBe(false);
  });

  it('lookup accepts a valid semver pre-release with build metadata (regression guard)', async () => {
    // '.', '-', '+' MUST remain allowed — they appear in legitimate semver
    // versions (`1.2.0-rc.1+build.123`). A regression here would break
    // real releases for no security gain.
    const cache = new FirmwareCache({ rootDir: tmpDir });
    expect(await cache.lookup('1.2.0-rc.1+build.123', 'metro_s3')).toBeNull();
  });
});

describe('FirmwareCache.fetch', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fw-cache-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    // Restore globally so spies set up inside individual tests can't leak
    // into later tests when an assertion throws before the test reaches
    // its own restore call. Without this, a single failing test that
    // spied on fs/logger would mutate live module exports for the rest
    // of the run, producing misleading downstream failures.
    vi.restoreAllMocks();
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

  it('cleans up the .tmp and partially-written sidecars when the persist phase fails after a successful download', async () => {
    // Disk-full or permissions error during writeFile/rename: the download
    // already succeeded (.tmp on disk, hash computed) but persisting the
    // sidecars or promoting .tmp → .bin failed. Without cleanup, .tmp plus
    // any sidecars written before the failure would accumulate — lookup()
    // treats that as a miss so reads don't break, but the cold-cache dir
    // grows with junk on every retry against a persistent failure
    // (permanently full disk, EACCES on the cache dir, ...).
    //
    // Simulate ENOSPC on the second writeFile (the meta.json one) so .sha
    // has already landed when the failure fires. Cleanup must remove all
    // three: .tmp, .sha, .meta — the same clean slate the download-phase
    // catch produces.
    const bytes = Buffer.from('fake-firmware-bytes');
    const fetcher = makeFetcherReturning(bytes);
    const cache = new FirmwareCache({ rootDir: tmpDir, fetcher });

    const realWriteFile = fsp.writeFile.bind(fsp);
    vi.spyOn(fsp, 'writeFile').mockImplementation(async (file, data) => {
      if (String(file).endsWith('.meta.json')) {
        throw Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' });
      }
      return realWriteFile(file as fs.PathLike, data as Parameters<typeof realWriteFile>[1]);
    });

    await expect(
      cache.fetch(makeRelease(), makeAsset({ sizeBytes: bytes.length })),
    ).rejects.toThrow(/ENOSPC/);

    const p = pathsFor(tmpDir, '1.0.0', 'metro_s3');
    expect(fs.existsSync(p.bin + '.tmp')).toBe(false);
    expect(fs.existsSync(p.bin)).toBe(false);
    expect(fs.existsSync(p.sha)).toBe(false);
    expect(fs.existsSync(p.meta)).toBe(false);
  });

  it('cleans up the .tmp when the rename to .bin fails after sidecars are written', async () => {
    // Sidecars wrote OK but rename(.tmp → .bin) failed (e.g., EACCES on the
    // canonical filename, or an EXDEV on a host where someone bind-mounted
    // a different filesystem under the cache dir). Both sidecars have to
    // be removed too — they describe a .bin that doesn't exist — so the
    // retry sees the same clean slate as any other persist-phase failure.
    const bytes = Buffer.from('fake-firmware-bytes');
    const fetcher = makeFetcherReturning(bytes);
    const cache = new FirmwareCache({ rootDir: tmpDir, fetcher });

    vi.spyOn(fsp, 'rename').mockRejectedValueOnce(
      Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' }),
    );

    await expect(
      cache.fetch(makeRelease(), makeAsset({ sizeBytes: bytes.length })),
    ).rejects.toThrow(/EACCES/);

    const p = pathsFor(tmpDir, '1.0.0', 'metro_s3');
    expect(fs.existsSync(p.bin + '.tmp')).toBe(false);
    expect(fs.existsSync(p.bin)).toBe(false);
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

  it('keeps the just-fetched release even when it sorts oldest (older-version fetch into a full cache)', async () => {
    // Edge case identified in PR review: cache full of NEWER releases,
    // user fetches an OLDER one (rollback / regression hunt). The
    // pre-fix pruneToN sorted by semver desc and sliced past
    // maxReleases, evicting the just-renamed .bin/.sha/.meta because
    // they were the "oldest" of N+1 — then the post-prune stat(p.bin)
    // in fetchInternal would ENOENT and the entire fetch would reject
    // with a misleading stat error. The fix: pruneToN excludes
    // release.tag from eviction and instead drops the oldest of the
    // OTHER tags, so the cache holds "the just-fetched + the (N-1)
    // newest others" rather than "the N newest, period."

    // Pre-populate 5 NEWER releases.
    populateCache(tmpDir, '2.0.0', 'metro_s3', '2026-02-01T00:00:00Z');
    populateCache(tmpDir, '2.1.0', 'metro_s3', '2026-02-15T00:00:00Z');
    populateCache(tmpDir, '2.2.0', 'metro_s3', '2026-03-01T00:00:00Z');
    populateCache(tmpDir, '2.3.0', 'metro_s3', '2026-03-15T00:00:00Z');
    populateCache(tmpDir, '2.4.0', 'metro_s3', '2026-04-01T00:00:00Z');

    // Fetch v1.0.0 — older than every cached release.
    const bytes = Buffer.from('v1.0.0-bytes');
    const fetcher = makeFetcherReturning(bytes);
    const cache = new FirmwareCache({ rootDir: tmpDir, fetcher });
    const result = await cache.fetch(
      makeRelease({ tag: 'v1.0.0', version: '1.0.0', publishedAt: '2026-01-01T00:00:00Z' }),
      makeAsset({ version: '1.0.0', sizeBytes: bytes.length }),
    );

    // Just-fetched v1.0.0 survives — all three sidecars on disk and
    // the returned CachedAsset.path resolves to the on-disk .bin.
    const just = pathsFor(tmpDir, '1.0.0', 'metro_s3');
    expect(fs.existsSync(just.bin)).toBe(true);
    expect(fs.existsSync(just.sha)).toBe(true);
    expect(fs.existsSync(just.meta)).toBe(true);
    expect(result.path).toBe(just.bin);
    expect(fs.readFileSync(just.bin)).toEqual(bytes);

    // Cache size remains at MAX_RELEASES (5). Oldest of the OTHERS
    // (v2.0.0) was evicted, not the just-fetched v1.0.0.
    expect(fs.existsSync(pathsFor(tmpDir, '2.0.0', 'metro_s3').bin)).toBe(false);
    for (const v of ['2.1.0', '2.2.0', '2.3.0', '2.4.0']) {
      expect(fs.existsSync(pathsFor(tmpDir, v, 'metro_s3').bin)).toBe(true);
    }
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
  });

  it('sweeps orphan .tmp files left by a prior crash', async () => {
    // Process killed mid-download (OOM, container kill, host reboot)
    // leaves <name>.tmp on disk: the in-process catch/.finally never
    // ran. lookup() doesn't return it (no .bin) and the meta-based
    // eviction below doesn't see it (no .meta.json), so without a sweep
    // it would persist forever — every aborted fetch leaks ~1.2 MB.
    populateCache(tmpDir, '1.0.0', 'metro_s3', '2026-01-01T00:00:00Z');
    populateCache(tmpDir, '1.1.0', 'metro_s3', '2026-02-01T00:00:00Z');
    populateCache(tmpDir, '1.2.0', 'metro_s3', '2026-03-01T00:00:00Z');
    populateCache(tmpDir, '1.3.0', 'metro_s3', '2026-04-01T00:00:00Z');
    populateCache(tmpDir, '1.4.0', 'metro_s3', '2026-04-15T00:00:00Z');

    // Two orphans simulating two prior aborted downloads on different keys.
    const githubDir = path.join(tmpDir, 'github');
    const orphanA = path.join(githubDir, 'astros-esp-0.5.0-metro_s3-app.bin.tmp');
    const orphanB = path.join(githubDir, 'astros-esp-0.6.0-lolin_d32_pro-app.bin.tmp');
    fs.writeFileSync(orphanA, Buffer.from('partial-from-crash-A'));
    fs.writeFileSync(orphanB, Buffer.from('partial-from-crash-B'));

    // Trigger pruneToN via a 6th fetch (post-rename eviction pathway).
    const bytes = Buffer.from('v1.5.0-bytes');
    const fetcher = makeFetcherReturning(bytes);
    const cache = new FirmwareCache({ rootDir: tmpDir, fetcher });
    await cache.fetch(
      makeRelease({ tag: 'v1.5.0', version: '1.5.0', publishedAt: '2026-04-30T00:00:00Z' }),
      makeAsset({ version: '1.5.0', sizeBytes: bytes.length }),
    );

    // Orphans gone; legitimate eviction still happened.
    expect(fs.existsSync(orphanA)).toBe(false);
    expect(fs.existsSync(orphanB)).toBe(false);
    expect(fs.existsSync(pathsFor(tmpDir, '1.0.0', 'metro_s3').bin)).toBe(false);
    expect(fs.existsSync(pathsFor(tmpDir, '1.5.0', 'metro_s3').bin)).toBe(true);
  });

  it('sweeps orphan .tmp files even when no release eviction is needed', async () => {
    // The orphan sweep must run BEFORE the byTag.size <= maxReleases
    // early-return — otherwise a cache with only a few releases would
    // never clean up orphans. This test pins that ordering: only one
    // release after the fetch, well below N=5, but the orphan must
    // still go.
    const githubDir = path.join(tmpDir, 'github');
    fs.mkdirSync(githubDir, { recursive: true });
    const orphan = path.join(githubDir, 'astros-esp-0.9.0-metro_s3-app.bin.tmp');
    fs.writeFileSync(orphan, Buffer.from('partial'));

    const bytes = Buffer.from('v1.0.0-bytes');
    const fetcher = makeFetcherReturning(bytes);
    const cache = new FirmwareCache({ rootDir: tmpDir, fetcher });
    await cache.fetch(makeRelease(), makeAsset({ sizeBytes: bytes.length }));

    expect(fs.existsSync(orphan)).toBe(false);
  });

  it('preserves a .tmp file for a fetch currently in flight (concurrency safety)', async () => {
    // Engineer a fetch that is actively writing to its .tmp (one chunk
    // landed, body stream paused) while another fetch on a different
    // key completes and triggers pruneToN. The in-flight fetch's .tmp
    // MUST NOT be swept — pruneToN consults the inFlight Map for live
    // .tmp filenames and skips them.
    populateCache(tmpDir, '1.0.0', 'metro_s3', '2026-01-01T00:00:00Z');
    populateCache(tmpDir, '1.1.0', 'metro_s3', '2026-02-01T00:00:00Z');
    populateCache(tmpDir, '1.2.0', 'metro_s3', '2026-03-01T00:00:00Z');
    populateCache(tmpDir, '1.3.0', 'metro_s3', '2026-04-01T00:00:00Z');
    populateCache(tmpDir, '1.4.0', 'metro_s3', '2026-04-15T00:00:00Z');

    // Hanging body for key 2.0.0::lolin_d32_pro — emit one chunk to
    // force the .tmp onto disk, then leave the controller open so the
    // pipeline pauses indefinitely. Sync fetcher for everything else.
    let hangingController: ReadableStreamDefaultController<Uint8Array> | null = null;
    const hangingUrl = 'https://example.test/astros-esp-2.0.0-lolin_d32_pro-app.bin';
    const fetcher: typeof fetch = vi.fn(async (url: URL | RequestInfo) => {
      if (String(url) === hangingUrl) {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            hangingController = controller;
            controller.enqueue(new Uint8Array([1, 2, 3, 4, 5]));
            // Don't close — body pauses, .tmp stays on disk mid-stream.
          },
        });
        return new Response(body, { status: 200 });
      }
      return new Response(Buffer.from('v1.5.0-bytes'), { status: 200 });
    }) as unknown as typeof fetch;

    const cache = new FirmwareCache({ rootDir: tmpDir, fetcher });

    // Start the hanging fetch — populates inFlight, .tmp eventually
    // appears on disk after the chunk flows through pipeline().
    // Override assetName + assetUrl so the URL match in the fetcher
    // routes correctly (makeAsset's defaults are pinned to 1.0.0-metro_s3).
    const hangingFetch = cache.fetch(
      makeRelease({ tag: 'v2.0.0', version: '2.0.0', publishedAt: '2026-05-01T00:00:00Z' }),
      makeAsset({
        version: '2.0.0',
        variant: 'lolin_d32_pro',
        assetName: 'astros-esp-2.0.0-lolin_d32_pro-app.bin',
        assetUrl: hangingUrl,
        // Set to 5 (the chunk size) so a successful complete-then-error
        // wouldn't fail the size check before the cleanup; the test
        // errors the stream so this fetch always rejects regardless.
        sizeBytes: 5,
      }),
    );

    // Poll for the .tmp to land. The pipeline runs on microtasks — a
    // few short setTimeout yields are enough; cap iterations so a
    // regression doesn't spin forever.
    const hangingTmpPath = path.join(
      tmpDir,
      'github',
      'astros-esp-2.0.0-lolin_d32_pro-app.bin.tmp',
    );
    for (let i = 0; i < 50 && !fs.existsSync(hangingTmpPath); i++) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(fs.existsSync(hangingTmpPath)).toBe(true);

    // Successful fetch on a different key — triggers pruneToN, which
    // now sees the hanging .tmp as a *.bin.tmp candidate but must skip
    // it because its key is in inFlight.
    await cache.fetch(
      makeRelease({ tag: 'v1.5.0', version: '1.5.0', publishedAt: '2026-04-30T00:00:00Z' }),
      makeAsset({
        version: '1.5.0',
        assetName: 'astros-esp-1.5.0-metro_s3-app.bin',
        assetUrl: 'https://example.test/astros-esp-1.5.0-metro_s3-app.bin',
        sizeBytes: 'v1.5.0-bytes'.length,
      }),
    );

    expect(fs.existsSync(hangingTmpPath)).toBe(true);

    // Cleanup: error the hanging stream so the fetch rejects and the
    // afterEach rmSync can clean the temp dir.
    hangingController?.error(new Error('test cleanup: aborting hanging fetch'));
    await expect(hangingFetch).rejects.toThrow();
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

  it('does not unlink files outside github/ even when meta.json carries path-traversal payloads', async () => {
    // Defense-in-depth: a malicious or corrupted .meta.json containing path
    // separators in `version` / `variant` must NOT cause eviction to walk
    // out of the cache subdirectory via path.join's `..` normalization.
    // pruneToN derives sibling .bin / .bin.sha256 paths from each meta
    // file's own Dirent name (a guaranteed basename), so JSON content can
    // only influence sort ordering — never path construction.
    const githubDir = path.join(tmpDir, 'github');
    fs.mkdirSync(githubDir, { recursive: true });

    // Sentinel one level above github/ at the path the malicious meta
    // would target if pruneToN built unlink paths from JSON values.
    // With version='/../../foo' and variant='bar', the buggy basename
    // 'astros-esp-/../../foo-bar-app.bin' normalizes (under path.join
    // from githubDir) to <tmpDir>/foo-bar-app.bin.
    const sentinelPath = path.join(tmpDir, 'foo-bar-app.bin');
    fs.writeFileSync(sentinelPath, 'do-not-delete');

    populateCache(tmpDir, '1.0.0', 'metro_s3', '2026-01-01T00:00:00Z');
    populateCache(tmpDir, '1.1.0', 'metro_s3', '2026-02-01T00:00:00Z');
    populateCache(tmpDir, '1.2.0', 'metro_s3', '2026-03-01T00:00:00Z');
    populateCache(tmpDir, '1.3.0', 'metro_s3', '2026-04-01T00:00:00Z');
    populateCache(tmpDir, '1.4.0', 'metro_s3', '2026-04-15T00:00:00Z');

    // Malicious meta whose tag sorts oldest under semver desc, so its
    // group is the one chosen for eviction.
    const maliciousMetaName = 'astros-esp-malicious-app.meta.json';
    fs.writeFileSync(
      path.join(githubDir, maliciousMetaName),
      JSON.stringify(
        makeMeta({
          tag: 'v0.0.0',
          version: '/../../foo',
          variant: 'bar',
          publishedAt: '2025-01-01T00:00:00Z',
        }),
      ),
    );

    const bytes = Buffer.from('v1.5.0-bytes');
    const fetcher = makeFetcherReturning(bytes);
    const cache = new FirmwareCache({ rootDir: tmpDir, fetcher });
    await cache.fetch(
      makeRelease({ tag: 'v1.5.0', version: '1.5.0', publishedAt: '2026-04-30T00:00:00Z' }),
      makeAsset({ version: '1.5.0', sizeBytes: bytes.length }),
    );

    // The sentinel outside github/ must still exist — eviction stayed
    // inside the subdirectory it owns.
    expect(fs.existsSync(sentinelPath)).toBe(true);

    // The malicious meta itself was correctly removed from its real
    // on-disk location: pruneToN selected its tag-group for eviction
    // and unlinked using paths derived from the meta file's Dirent name.
    expect(fs.existsSync(path.join(githubDir, maliciousMetaName))).toBe(false);
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
