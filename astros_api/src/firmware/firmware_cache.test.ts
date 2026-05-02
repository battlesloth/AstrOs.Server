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

describe('FirmwareCache.lookup', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fw-cache-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    // Globally restore here, not inline in tests, so a spy can't leak
    // when an assertion throws before reaching the restore call.
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
    // JSON.parse('{}') typecasts cleanly to CachedAssetMeta but leaves
    // every field undefined; consumers (eviction sort, returned meta)
    // would NPE later. Treat as a miss so fetch() re-downloads.
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
    // The type predicate narrows to the FULL CachedAssetMeta, not just
    // the 4 fields eviction consults. A 4-field-only predicate would
    // let callers read result.meta.sourceUrl as undefined despite the
    // type system promising `string`.
    const p = pathsFor(tmpDir, '1.0.0', 'metro_s3');
    fs.mkdirSync(p.githubDir, { recursive: true });
    const binBytes = Buffer.from('fake-firmware-bytes');
    const sha = crypto.createHash('sha256').update(binBytes).digest('hex');
    fs.writeFileSync(p.bin, binBytes);
    fs.writeFileSync(p.sha, sha);
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
    // A malformed digest would surface as a far-downstream protocol-
    // layer verify mismatch; treat as a miss and re-download instead.
    const p = pathsFor(tmpDir, '1.0.0', 'metro_s3');
    fs.mkdirSync(p.githubDir, { recursive: true });
    fs.writeFileSync(p.bin, 'data');
    fs.writeFileSync(p.sha, 'abc123def456'); // 12 chars — wrong length
    fs.writeFileSync(p.meta, JSON.stringify(makeMeta()));

    const cache = new FirmwareCache({ rootDir: tmpDir });
    expect(await cache.lookup('1.0.0', 'metro_s3')).toBeNull();
  });
});

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

describe('FirmwareCache filename-safety validation', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fw-cache-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  // Each value is something path.join() would normalize into an escape
  // or hidden-file write if pathsFor didn't validate first.
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
    // Sentinel outside the cache dir: if validation fired late,
    // '../foo' would resolve to <tmpDir>/foo and we'd see a write.
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
    // '.', '-', '+' must remain allowed — they appear in real semver.
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
    // Globally restore here, not inline in tests, so a spy can't leak
    // when an assertion throws before reaching the restore call.
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

    await cache.fetch(release, asset);
    const result = await cache.fetch(release, asset);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.path).toBe(pathsFor(tmpDir, '1.0.0', 'metro_s3').bin);
  });

  it('cleans up the .tmp and rejects when the download stream errors mid-flight', async () => {
    // Simulate a connection drop after one chunk.
    const fetcher: typeof fetch = vi.fn(async () => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3, 4]));
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
    expect(fs.existsSync(p.bin + '.tmp')).toBe(false);
    expect(fs.existsSync(p.bin)).toBe(false);
    expect(fs.existsSync(p.sha)).toBe(false);
    expect(fs.existsSync(p.meta)).toBe(false);
  });

  it('cleans up the .tmp and partially-written sidecars when the persist phase fails after a successful download', async () => {
    // ENOSPC on the SECOND writeFile (.meta.json), so .sha has already
    // landed when the failure fires; cleanup must remove all three.
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

  it('cleans up when the rename to .bin fails (no sidecars yet, .bin not promoted)', async () => {
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

  it('does not leave a mismatched 3-file state if persist is interrupted (sidecars only land after .bin is promoted)', async () => {
    // Stale .bin from a prior crashed write — lookup() correctly
    // returns null because there are no sidecars. On the next fetch,
    // sidecars must NOT be written while the stale .bin is still on
    // disk: a crash between sidecar-write and rename would leave all
    // three files present, with the new sidecars describing the OLD
    // bytes. lookup() would then return a mismatched hit (sha != bytes).
    //
    // Invariant: at sidecar-write time, p.bin is either (a) the fresh
    // bytes already, or (b) absent — never the stale content.
    const p = pathsFor(tmpDir, '1.0.0', 'metro_s3');
    fs.mkdirSync(p.githubDir, { recursive: true });
    const stale = Buffer.from('STALE-CONTENT-FROM-CRASHED-WRITE');
    fs.writeFileSync(p.bin, stale);

    const fresh = Buffer.from('fresh-firmware-bytes');
    const fetcher = makeFetcherReturning(fresh);
    const cache = new FirmwareCache({ rootDir: tmpDir, fetcher });

    const binSnapshotsAtSidecarWrite: Array<Buffer | null> = [];
    const realWriteFile = fsp.writeFile.bind(fsp);
    vi.spyOn(fsp, 'writeFile').mockImplementation(async (file, data) => {
      const fileStr = String(file);
      if (fileStr.endsWith('.meta.json') || fileStr.endsWith('.bin.sha256')) {
        try {
          binSnapshotsAtSidecarWrite.push(fs.readFileSync(p.bin));
        } catch {
          binSnapshotsAtSidecarWrite.push(null);
        }
      }
      return realWriteFile(file as fs.PathLike, data as Parameters<typeof realWriteFile>[1]);
    });

    await cache.fetch(makeRelease(), makeAsset({ sizeBytes: fresh.length }));

    // Both sidecar writes were observed (sha + meta).
    expect(binSnapshotsAtSidecarWrite).toHaveLength(2);
    // Neither snapshot is the stale content — fresh or absent are both safe.
    for (const snap of binSnapshotsAtSidecarWrite) {
      expect(snap).not.toEqual(stale);
    }
  });

  it('rejects when the downloaded size does not match AssetInfo.sizeBytes', async () => {
    // A cleanly-closed but truncated response would cache as legitimate
    // firmware otherwise; flashing a truncated binary bricks the
    // controller, so this is a hard failure.
    const bytes = Buffer.from('shorter-than-claimed');
    const fetcher = makeFetcherReturning(bytes);
    const cache = new FirmwareCache({ rootDir: tmpDir, fetcher });

    await expect(
      cache.fetch(makeRelease(), makeAsset({ sizeBytes: bytes.length + 100 })),
    ).rejects.toThrow(/size mismatch/i);

    const p = pathsFor(tmpDir, '1.0.0', 'metro_s3');
    expect(fs.existsSync(p.bin + '.tmp')).toBe(false);
    expect(fs.existsSync(p.bin)).toBe(false);
    expect(fs.existsSync(p.sha)).toBe(false);
    expect(fs.existsSync(p.meta)).toBe(false);
  });

  it('overwrites a stale .bin left by an interrupted earlier write (Windows-rename semantics)', async () => {
    // POSIX rename overwrites atomically; Windows throws EEXIST. The
    // Linux runner can't natively exhibit Windows behavior, so spy on
    // fsp.rename to throw EEXIST when the destination exists.
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

    const evicted = pathsFor(tmpDir, '1.0.0', 'metro_s3');
    expect(fs.existsSync(evicted.bin)).toBe(false);
    expect(fs.existsSync(evicted.sha)).toBe(false);
    expect(fs.existsSync(evicted.meta)).toBe(false);

    for (const v of ['1.1.0', '1.2.0', '1.3.0', '1.4.0', '1.5.0']) {
      expect(fs.existsSync(pathsFor(tmpDir, v, 'metro_s3').bin)).toBe(true);
    }
  });

  it('evicts both variants of the oldest release together (multi-variant)', async () => {
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

    expect(fs.existsSync(pathsFor(tmpDir, '1.0.0', 'metro_s3').bin)).toBe(false);
    expect(fs.existsSync(pathsFor(tmpDir, '1.0.0', 'lolin_d32_pro').bin)).toBe(false);

    for (const v of ['1.1.0', '1.2.0', '1.3.0', '1.4.0']) {
      expect(fs.existsSync(pathsFor(tmpDir, v, 'metro_s3').bin)).toBe(true);
      expect(fs.existsSync(pathsFor(tmpDir, v, 'lolin_d32_pro').bin)).toBe(true);
    }
    expect(fs.existsSync(pathsFor(tmpDir, '1.5.0', 'metro_s3').bin)).toBe(true);
  });

  it('keeps the just-fetched release even when it sorts oldest (older-version fetch into a full cache)', async () => {
    // Without the keepTag anchor, the just-renamed .bin would sort as
    // "oldest" of N+1 and be evicted, then the post-prune stat() would
    // ENOENT and the fetch would reject for a successfully-downloaded
    // firmware (rollback / regression-hunt scenarios).
    populateCache(tmpDir, '2.0.0', 'metro_s3', '2026-02-01T00:00:00Z');
    populateCache(tmpDir, '2.1.0', 'metro_s3', '2026-02-15T00:00:00Z');
    populateCache(tmpDir, '2.2.0', 'metro_s3', '2026-03-01T00:00:00Z');
    populateCache(tmpDir, '2.3.0', 'metro_s3', '2026-03-15T00:00:00Z');
    populateCache(tmpDir, '2.4.0', 'metro_s3', '2026-04-01T00:00:00Z');

    const bytes = Buffer.from('v1.0.0-bytes');
    const fetcher = makeFetcherReturning(bytes);
    const cache = new FirmwareCache({ rootDir: tmpDir, fetcher });
    const result = await cache.fetch(
      makeRelease({ tag: 'v1.0.0', version: '1.0.0', publishedAt: '2026-01-01T00:00:00Z' }),
      makeAsset({ version: '1.0.0', sizeBytes: bytes.length }),
    );

    const just = pathsFor(tmpDir, '1.0.0', 'metro_s3');
    expect(fs.existsSync(just.bin)).toBe(true);
    expect(fs.existsSync(just.sha)).toBe(true);
    expect(fs.existsSync(just.meta)).toBe(true);
    expect(result.path).toBe(just.bin);
    expect(fs.readFileSync(just.bin)).toEqual(bytes);

    // Oldest of the OTHERS (v2.0.0) evicted; v1.0.0 retained at the
    // expense of the absolute oldest, keeping cache size at maxReleases.
    expect(fs.existsSync(pathsFor(tmpDir, '2.0.0', 'metro_s3').bin)).toBe(false);
    for (const v of ['2.1.0', '2.2.0', '2.3.0', '2.4.0']) {
      expect(fs.existsSync(pathsFor(tmpDir, v, 'metro_s3').bin)).toBe(true);
    }
  });

  it('cleans up structurally-valid-but-malformed meta.json files during eviction', async () => {
    // Without isValidMeta, an empty `{}` would slip into the sort and
    // crash `localeCompare(undefined)`. Without the cleanup pass,
    // it would also evade MAX_RELEASES accounting forever.
    populateCache(tmpDir, '1.0.0', 'metro_s3', '2026-01-01T00:00:00Z');
    populateCache(tmpDir, '1.1.0', 'metro_s3', '2026-02-01T00:00:00Z');
    populateCache(tmpDir, '1.2.0', 'metro_s3', '2026-03-01T00:00:00Z');
    populateCache(tmpDir, '1.3.0', 'metro_s3', '2026-04-01T00:00:00Z');
    populateCache(tmpDir, '1.4.0', 'metro_s3', '2026-04-15T00:00:00Z');
    const githubDir = path.join(tmpDir, 'github');
    const malformedMetaPath = path.join(githubDir, 'astros-esp-malformed-app.meta.json');
    fs.writeFileSync(malformedMetaPath, '{}');

    const bytes = Buffer.from('v1.5.0-bytes');
    const fetcher = makeFetcherReturning(bytes);
    const cache = new FirmwareCache({ rootDir: tmpDir, fetcher });
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);

    await cache.fetch(
      makeRelease({ tag: 'v1.5.0', version: '1.5.0', publishedAt: '2026-04-30T00:00:00Z' }),
      makeAsset({ version: '1.5.0', sizeBytes: bytes.length }),
    );

    expect(fs.existsSync(pathsFor(tmpDir, '1.0.0', 'metro_s3').bin)).toBe(false);
    expect(fs.existsSync(pathsFor(tmpDir, '1.5.0', 'metro_s3').bin)).toBe(true);
    // The malformed meta is gone — pruneToN cleaned it up rather than
    // letting it sit forever evading both lookup and eviction.
    expect(fs.existsSync(malformedMetaPath)).toBe(false);
    // Cleanup is in-band, not an error condition.
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('cleans up sibling .bin and .bin.sha256 when a meta.json is malformed', async () => {
    // Corruption scenario: a complete cached entry on disk (.bin +
    // .sha256 + .meta.json) where the meta is malformed (truncated
    // mid-write, partial flush, intentional tampering). lookup() can
    // never serve it (isValidMeta gates the hit) and the meta-based
    // eviction can't see it (skipped from metaFiles), so without an
    // explicit sweep its ~1.2 MB sits forever beyond MAX_RELEASES.
    const githubDir = path.join(tmpDir, 'github');
    fs.mkdirSync(githubDir, { recursive: true });
    const baseName = 'astros-esp-9.9.9-metro_s3-app';
    const ghostBin = path.join(githubDir, `${baseName}.bin`);
    const ghostSha = path.join(githubDir, `${baseName}.bin.sha256`);
    const ghostMeta = path.join(githubDir, `${baseName}.meta.json`);
    fs.writeFileSync(ghostBin, Buffer.from('orphan-binary-bytes'));
    fs.writeFileSync(ghostSha, 'a'.repeat(64));
    fs.writeFileSync(ghostMeta, '{"tag":"v9.9.9",'); // truncated JSON

    const bytes = Buffer.from('v1.0.0-bytes');
    const fetcher = makeFetcherReturning(bytes);
    const cache = new FirmwareCache({ rootDir: tmpDir, fetcher });
    await cache.fetch(makeRelease(), makeAsset({ sizeBytes: bytes.length }));

    expect(fs.existsSync(ghostBin)).toBe(false);
    expect(fs.existsSync(ghostSha)).toBe(false);
    expect(fs.existsSync(ghostMeta)).toBe(false);
  });

  it('cleans up sibling .bin and .bin.sha256 when a meta.json is unreadable', async () => {
    // EACCES on readFile (different from malformed JSON) — same
    // outcome: the entry can never be served, so it must be swept.
    const githubDir = path.join(tmpDir, 'github');
    fs.mkdirSync(githubDir, { recursive: true });
    const baseName = 'astros-esp-7.7.7-metro_s3-app';
    const ghostBin = path.join(githubDir, `${baseName}.bin`);
    const ghostSha = path.join(githubDir, `${baseName}.bin.sha256`);
    const ghostMeta = path.join(githubDir, `${baseName}.meta.json`);
    fs.writeFileSync(ghostBin, Buffer.from('orphan-binary-bytes'));
    fs.writeFileSync(ghostSha, 'b'.repeat(64));
    fs.writeFileSync(ghostMeta, JSON.stringify(makeMeta()));

    // Force readFile to throw EACCES specifically for the ghost meta;
    // delegate everything else to the real readFile.
    const realReadFile = fsp.readFile.bind(fsp);
    vi.spyOn(fsp, 'readFile').mockImplementation((async (file: fs.PathLike, ...rest: unknown[]) => {
      if (String(file) === ghostMeta) {
        throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
      }
      return realReadFile(file, ...(rest as [BufferEncoding]));
    }) as typeof fsp.readFile);

    const bytes = Buffer.from('v1.0.0-bytes');
    const fetcher = makeFetcherReturning(bytes);
    const cache = new FirmwareCache({ rootDir: tmpDir, fetcher });
    await cache.fetch(makeRelease(), makeAsset({ sizeBytes: bytes.length }));

    expect(fs.existsSync(ghostBin)).toBe(false);
    expect(fs.existsSync(ghostSha)).toBe(false);
    expect(fs.existsSync(ghostMeta)).toBe(false);
  });

  it('sweeps orphan .tmp files left by a prior crash', async () => {
    populateCache(tmpDir, '1.0.0', 'metro_s3', '2026-01-01T00:00:00Z');
    populateCache(tmpDir, '1.1.0', 'metro_s3', '2026-02-01T00:00:00Z');
    populateCache(tmpDir, '1.2.0', 'metro_s3', '2026-03-01T00:00:00Z');
    populateCache(tmpDir, '1.3.0', 'metro_s3', '2026-04-01T00:00:00Z');
    populateCache(tmpDir, '1.4.0', 'metro_s3', '2026-04-15T00:00:00Z');

    const githubDir = path.join(tmpDir, 'github');
    const orphanA = path.join(githubDir, 'astros-esp-0.5.0-metro_s3-app.bin.tmp');
    const orphanB = path.join(githubDir, 'astros-esp-0.6.0-lolin_d32_pro-app.bin.tmp');
    fs.writeFileSync(orphanA, Buffer.from('partial-from-crash-A'));
    fs.writeFileSync(orphanB, Buffer.from('partial-from-crash-B'));

    const bytes = Buffer.from('v1.5.0-bytes');
    const fetcher = makeFetcherReturning(bytes);
    const cache = new FirmwareCache({ rootDir: tmpDir, fetcher });
    await cache.fetch(
      makeRelease({ tag: 'v1.5.0', version: '1.5.0', publishedAt: '2026-04-30T00:00:00Z' }),
      makeAsset({ version: '1.5.0', sizeBytes: bytes.length }),
    );

    expect(fs.existsSync(orphanA)).toBe(false);
    expect(fs.existsSync(orphanB)).toBe(false);
    expect(fs.existsSync(pathsFor(tmpDir, '1.0.0', 'metro_s3').bin)).toBe(false);
    expect(fs.existsSync(pathsFor(tmpDir, '1.5.0', 'metro_s3').bin)).toBe(true);
  });

  it('sweeps orphan .tmp files even when no release eviction is needed', async () => {
    // Pins the sweep-before-early-return ordering: only one release
    // after the fetch (below N=5) but the orphan must still go.
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
    // A hanging fetch (one chunk landed, body paused) while another
    // fetch on a different key completes and triggers pruneToN. The
    // in-flight fetch's .tmp must survive via the inFlight skip.
    populateCache(tmpDir, '1.0.0', 'metro_s3', '2026-01-01T00:00:00Z');
    populateCache(tmpDir, '1.1.0', 'metro_s3', '2026-02-01T00:00:00Z');
    populateCache(tmpDir, '1.2.0', 'metro_s3', '2026-03-01T00:00:00Z');
    populateCache(tmpDir, '1.3.0', 'metro_s3', '2026-04-01T00:00:00Z');
    populateCache(tmpDir, '1.4.0', 'metro_s3', '2026-04-15T00:00:00Z');

    // Emit one chunk to force the .tmp onto disk, then leave the
    // controller open so pipeline() pauses indefinitely.
    let hangingController: ReadableStreamDefaultController<Uint8Array> | null = null;
    const hangingUrl = 'https://example.test/astros-esp-2.0.0-lolin_d32_pro-app.bin';
    const fetcher: typeof fetch = vi.fn(async (url: URL | RequestInfo) => {
      if (String(url) === hangingUrl) {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            hangingController = controller;
            controller.enqueue(new Uint8Array([1, 2, 3, 4, 5]));
          },
        });
        return new Response(body, { status: 200 });
      }
      return new Response(Buffer.from('v1.5.0-bytes'), { status: 200 });
    }) as unknown as typeof fetch;

    const cache = new FirmwareCache({ rootDir: tmpDir, fetcher });

    // makeAsset defaults are pinned to 1.0.0-metro_s3 so the URL match
    // in the fetcher needs explicit overrides for routing.
    const hangingFetch = cache.fetch(
      makeRelease({ tag: 'v2.0.0', version: '2.0.0', publishedAt: '2026-05-01T00:00:00Z' }),
      makeAsset({
        version: '2.0.0',
        variant: 'lolin_d32_pro',
        assetName: 'astros-esp-2.0.0-lolin_d32_pro-app.bin',
        assetUrl: hangingUrl,
        sizeBytes: 5,
      }),
    );

    // Poll for .tmp to land — pipeline() runs on microtasks. Capped so
    // a regression doesn't spin forever.
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
    // readdir is only used by pruneToN, not by lookup, so a non-ENOENT
    // error here only fires on the post-write eviction pass.
    vi.spyOn(fsp, 'readdir').mockRejectedValueOnce(
      Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' }),
    );

    const result = await cache.fetch(makeRelease(), makeAsset({ sizeBytes: bytes.length }));
    expect(result.path).toBe(pathsFor(tmpDir, '1.0.0', 'metro_s3').bin);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toMatch(/EACCES/);
  });

  it('breaks semver ties by publishedAt (older publishedAt evicted first)', async () => {
    // compareVersions treats `1.2.0` and `1.2.0-RC.1` as equal because
    // pre-release suffixes are stripped for gating; publishedAt breaks
    // the tie.
    populateCache(tmpDir, '1.0.0', 'metro_s3', '2026-01-01T00:00:00Z');
    populateCache(tmpDir, '1.1.0', 'metro_s3', '2026-02-01T00:00:00Z');
    populateCache(tmpDir, '1.2.0', 'metro_s3', '2026-04-01T00:00:00Z');
    populateCache(tmpDir, '1.2.0-RC.1', 'metro_s3', '2026-03-15T00:00:00Z');
    populateCache(tmpDir, '1.3.0', 'metro_s3', '2026-04-15T00:00:00Z');

    const bytes = Buffer.from('v1.4.0-bytes');
    const fetcher = makeFetcherReturning(bytes);
    const cache = new FirmwareCache({ rootDir: tmpDir, fetcher });
    await cache.fetch(
      makeRelease({ tag: 'v1.4.0', version: '1.4.0', publishedAt: '2026-04-30T00:00:00Z' }),
      makeAsset({ version: '1.4.0', sizeBytes: bytes.length }),
    );

    // v1.0.0 is the absolute oldest; the RC loses its tie to v1.2.0
    // but is still newer than v1.0.0.
    expect(fs.existsSync(pathsFor(tmpDir, '1.0.0', 'metro_s3').bin)).toBe(false);
    expect(fs.existsSync(pathsFor(tmpDir, '1.2.0-RC.1', 'metro_s3').bin)).toBe(true);
    expect(fs.existsSync(pathsFor(tmpDir, '1.2.0', 'metro_s3').bin)).toBe(true);
  });

  it('does not unlink files outside github/ even when meta.json carries path-traversal payloads', async () => {
    // pruneToN derives sibling paths from each meta file's Dirent name
    // (a guaranteed basename), so JSON content can only influence sort
    // ordering — never path construction.
    const githubDir = path.join(tmpDir, 'github');
    fs.mkdirSync(githubDir, { recursive: true });

    // With version='/../../foo' and variant='bar', a buggy basename
    // 'astros-esp-/../../foo-bar-app.bin' would normalize to
    // <tmpDir>/foo-bar-app.bin.
    const sentinelPath = path.join(tmpDir, 'foo-bar-app.bin');
    fs.writeFileSync(sentinelPath, 'do-not-delete');

    populateCache(tmpDir, '1.0.0', 'metro_s3', '2026-01-01T00:00:00Z');
    populateCache(tmpDir, '1.1.0', 'metro_s3', '2026-02-01T00:00:00Z');
    populateCache(tmpDir, '1.2.0', 'metro_s3', '2026-03-01T00:00:00Z');
    populateCache(tmpDir, '1.3.0', 'metro_s3', '2026-04-01T00:00:00Z');
    populateCache(tmpDir, '1.4.0', 'metro_s3', '2026-04-15T00:00:00Z');

    // tag='v0.0.0' sorts oldest, so this group will be chosen for eviction.
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

    expect(fs.existsSync(sentinelPath)).toBe(true);
    // Malicious meta is removed via its real Dirent-derived path.
    expect(fs.existsSync(path.join(githubDir, maliciousMetaName))).toBe(false);
  });

  it('aborts a hanging download after the timeout with a URL-naming error', async () => {
    // Without the signal-respecting branch in streamDownload, this test
    // would hit vitest's 5s default — a generic "test timed out" rather
    // than the URL-naming error ops needs.
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
    // A timed-out fetch must not poison inFlight — the retry has to
    // call the fetcher again rather than await the dead promise.
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

    await expect(cache.fetch(release, asset)).rejects.toThrow(/timed out/i);

    mode = 'ok';
    const second = await cache.fetch(release, asset);
    expect(second.path).toBe(pathsFor(tmpDir, '1.0.0', 'metro_s3').bin);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('dedups concurrent fetch() calls for the same (version, variant)', async () => {
    // Two callers racing on a cold cache must NOT both download — they'd
    // race on the same .tmp filename and double the bandwidth.
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

    // Wait for the first lookup() to finish (multiple async fs reads on
    // a cold cache) before streamDownload calls the fetcher.
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));

    if (resolveFetch === null) throw new Error('expected fetcher to have captured its resolver');
    (resolveFetch as (r: Response) => void)(new Response(bytes, { status: 200 }));

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toEqual(r2);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
