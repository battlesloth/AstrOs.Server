import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { extractFirmwareAssets, GitHubReleaseService } from './github_release_service.js';
import type { GitHubAssetDto, GitHubReleaseDto } from '../models/firmware/release.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function asset(overrides: Partial<GitHubAssetDto> = {}): GitHubAssetDto {
  return {
    name: 'astros-esp-1.0.0-metro_s3-app.bin',
    browser_download_url: 'https://example.test/astros-esp-1.0.0-metro_s3-app.bin',
    size: 1234567,
    content_type: 'application/octet-stream',
    ...overrides,
  };
}

function release(overrides: Partial<GitHubReleaseDto> = {}): GitHubReleaseDto {
  return {
    tag_name: 'v1.0.0',
    published_at: '2026-04-01T00:00:00Z',
    draft: false,
    prerelease: false,
    assets: [asset()],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// extractFirmwareAssets — pure asset-name parser + filter.
// ---------------------------------------------------------------------------

describe('extractFirmwareAssets', () => {
  it('extracts a single matched -app.bin asset with variant + version', () => {
    const r = release();
    const assets = extractFirmwareAssets(r);
    expect(assets).toHaveLength(1);
    expect(assets[0]).toEqual({
      variant: 'metro_s3',
      version: '1.0.0',
      assetName: 'astros-esp-1.0.0-metro_s3-app.bin',
      assetUrl: 'https://example.test/astros-esp-1.0.0-metro_s3-app.bin',
      sizeBytes: 1234567,
    });
  });

  it('returns multiple assets when a release has multiple variants', () => {
    const r = release({
      assets: [
        asset({ name: 'astros-esp-1.0.0-metro_s3-app.bin' }),
        asset({ name: 'astros-esp-1.0.0-lolin_d32_pro-app.bin' }),
      ],
    });
    const assets = extractFirmwareAssets(r);
    expect(assets.map((a) => a.variant).sort()).toEqual(['lolin_d32_pro', 'metro_s3']);
  });

  it('skips -flash.bin (USB-bootstrap image)', () => {
    const r = release({
      assets: [
        asset({ name: 'astros-esp-1.0.0-metro_s3-app.bin' }),
        asset({ name: 'astros-esp-1.0.0-metro_s3-flash.bin' }),
      ],
    });
    const assets = extractFirmwareAssets(r);
    expect(assets).toHaveLength(1);
    expect(assets[0].assetName).toBe('astros-esp-1.0.0-metro_s3-app.bin');
  });

  it('parses pre-release versions correctly (1.2.0-RC.1 has a hyphen)', () => {
    const r = release({
      tag_name: 'v1.2.0-RC.1',
      assets: [asset({ name: 'astros-esp-1.2.0-RC.1-lolin_d32_pro-app.bin' })],
    });
    const assets = extractFirmwareAssets(r);
    expect(assets).toHaveLength(1);
    expect(assets[0].variant).toBe('lolin_d32_pro');
    expect(assets[0].version).toBe('1.2.0-RC.1');
  });

  it('rejects assets whose content_type is not octet-stream-flavored', () => {
    const r = release({
      assets: [asset({ content_type: 'text/plain' })],
    });
    const assets = extractFirmwareAssets(r);
    expect(assets).toHaveLength(0);
  });

  it('skips assets whose parsed version disagrees with the release tag', () => {
    const r = release({
      tag_name: 'v1.0.0',
      assets: [asset({ name: 'astros-esp-9.9.9-metro_s3-app.bin' })],
    });
    const assets = extractFirmwareAssets(r);
    expect(assets).toHaveLength(0);
  });

  it('returns empty array when no asset name matches the pattern', () => {
    const r = release({
      assets: [
        asset({ name: 'README.md', content_type: 'text/markdown' }),
        asset({ name: 'random-firmware.bin' }),
      ],
    });
    expect(extractFirmwareAssets(r)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// GitHubReleaseService — caching + stale-on-error.
// ---------------------------------------------------------------------------

describe('GitHubReleaseService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-29T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function makeFetcherReturning(releases: GitHubReleaseDto[]): typeof fetch {
    return vi.fn(async () => {
      return new Response(JSON.stringify(releases), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;
  }

  function makeFetcherFailing(error = new Error('network down')): typeof fetch {
    return vi.fn(async () => {
      throw error;
    }) as unknown as typeof fetch;
  }

  it('on cold cache, fetches and returns releases with staleSince=null', async () => {
    const fetcher = makeFetcherReturning([release()]);
    const svc = new GitHubReleaseService('test/dummy', fetcher);

    const result = await svc.getReleases();

    expect(result.staleSince).toBeNull();
    expect(result.releases).toHaveLength(1);
    expect(result.releases[0].tag).toBe('v1.0.0');
    expect(result.releases[0].assets).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('serves cached result without re-fetching within the 5-min TTL', async () => {
    const fetcher = makeFetcherReturning([release()]);
    const svc = new GitHubReleaseService('test/dummy', fetcher);

    await svc.getReleases();
    vi.advanceTimersByTime(4 * 60 * 1000); // 4 minutes
    await svc.getReleases();
    vi.advanceTimersByTime(59 * 1000); // total 4:59
    await svc.getReleases();

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('re-fetches after the 5-min TTL expires', async () => {
    const fetcher = makeFetcherReturning([release()]);
    const svc = new GitHubReleaseService('test/dummy', fetcher);

    await svc.getReleases();
    vi.advanceTimersByTime(5 * 60 * 1000 + 1); // just past 5 min
    await svc.getReleases();

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('throws on cold-cache fetch error', async () => {
    const svc = new GitHubReleaseService('test/dummy', makeFetcherFailing());
    await expect(svc.getReleases()).rejects.toThrow();
  });

  it('serves stale cache on fetch error after expiry, with staleSince set', async () => {
    const releases = [release()];
    let shouldFail = false;
    const fetcher: typeof fetch = vi.fn(async () => {
      if (shouldFail) throw new Error('network down');
      return new Response(JSON.stringify(releases), { status: 200 });
    }) as unknown as typeof fetch;

    const svc = new GitHubReleaseService('test/dummy', fetcher);

    // Warm the cache.
    const fresh = await svc.getReleases();
    expect(fresh.staleSince).toBeNull();
    const fetchedAtIso = '2026-04-29T12:00:00.000Z';

    // Expire it, then fail the next fetch.
    vi.advanceTimersByTime(6 * 60 * 1000);
    shouldFail = true;

    const stale = await svc.getReleases();
    expect(stale.releases).toHaveLength(1);
    expect(stale.staleSince).toBe(fetchedAtIso);
  });

  it('deduplicates concurrent in-flight fetches', async () => {
    let resolveFetch: (() => void) | null = null;
    const releases = [release()];
    const fetcher: typeof fetch = vi.fn(async () => {
      await new Promise<void>((resolve) => {
        resolveFetch = resolve;
      });
      return new Response(JSON.stringify(releases), { status: 200 });
    }) as unknown as typeof fetch;

    const svc = new GitHubReleaseService('test/dummy', fetcher);

    const a = svc.getReleases();
    const b = svc.getReleases();
    const c = svc.getReleases();

    // All three calls should be awaiting the same in-flight fetch.
    expect(fetcher).toHaveBeenCalledTimes(1);
    if (resolveFetch === null) throw new Error('expected fetcher to have captured its resolver');

    // Release the fetch.
    resolveFetch();
    const [ra, rb, rc] = await Promise.all([a, b, c]);
    expect(ra.releases).toHaveLength(1);
    expect(rb.releases).toHaveLength(1);
    expect(rc.releases).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('targets the correct GitHub URL based on the repo slug', async () => {
    const fetcher = makeFetcherReturning([]);
    const svc = new GitHubReleaseService('battlesloth/AstrOs.ESP', fetcher);

    await svc.getReleases();

    expect(fetcher).toHaveBeenCalledTimes(1);
    const url = (fetcher as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(String(url)).toBe('https://api.github.com/repos/battlesloth/AstrOs.ESP/releases');
  });

  it('sends User-Agent and Accept headers on every fetch (and keeps the abort signal)', async () => {
    // GitHub's REST API requires a User-Agent on anonymous requests (otherwise
    // returns 403). Accept: application/vnd.github+json pins the v3 response
    // shape across runtimes. The signal assertion is a regression guard so a
    // future header refactor can't silently drop the AbortController wiring.
    const fetcher = makeFetcherReturning([]);
    const svc = new GitHubReleaseService('test/dummy', fetcher);

    await svc.getReleases();

    expect(fetcher).toHaveBeenCalledTimes(1);
    const init = (fetcher as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as
      | RequestInit
      | undefined;
    const headers = new Headers(init?.headers);
    expect(headers.get('User-Agent')).toMatch(/AstrOs\.Server/);
    expect(headers.get('Accept')).toBe('application/vnd.github+json');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('aborts a hanging fetch after the timeout with an error mentioning the URL', async () => {
    // Hanging fetcher: never resolves; only rejects when the AbortController
    // fires. Without the signal-respecting branch, this test would also hang.
    const hangingFetcher: typeof fetch = vi.fn(async (_url, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const abortErr = new Error('aborted');
          abortErr.name = 'AbortError';
          reject(abortErr);
        });
      });
    }) as unknown as typeof fetch;

    const svc = new GitHubReleaseService('test/dummy', hangingFetcher);
    const promise = svc.getReleases();

    // Catch unhandled-rejection warning before the assertion runs.
    const expectation = expect(promise).rejects.toThrow(/timed out.*test\/dummy/i);
    await vi.advanceTimersByTimeAsync(15_000);
    await expectation;
  });

  it('serves stale cache when a re-fetch times out (does not hang)', async () => {
    let mode: 'fast' | 'hang' = 'fast';
    const releases = [release()];
    const fetcher: typeof fetch = vi.fn(async (_url, init?: RequestInit) => {
      if (mode === 'fast') {
        return new Response(JSON.stringify(releases), { status: 200 });
      }
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const abortErr = new Error('aborted');
          abortErr.name = 'AbortError';
          reject(abortErr);
        });
      });
    }) as unknown as typeof fetch;

    const svc = new GitHubReleaseService('test/dummy', fetcher);
    await svc.getReleases(); // warm cache

    vi.advanceTimersByTime(6 * 60 * 1000); // expire it
    mode = 'hang';

    const stalePromise = svc.getReleases();
    await vi.advanceTimersByTimeAsync(15_000); // trip the timeout

    const stale = await stalePromise;
    expect(stale.releases).toHaveLength(1);
    expect(stale.staleSince).not.toBeNull();
  });

  it('includes URL and status text in the non-2xx error', async () => {
    const fetcher: typeof fetch = vi.fn(
      async () => new Response('Not Found', { status: 404, statusText: 'Not Found' }),
    ) as unknown as typeof fetch;

    const svc = new GitHubReleaseService('battlesloth/AstrOs.ESP', fetcher);

    await expect(svc.getReleases()).rejects.toThrow(/AstrOs\.ESP.*404.*Not Found/);
  });

  it('does not retry the upstream within the backoff window after a failure', async () => {
    const fetcher = makeFetcherFailing();
    const svc = new GitHubReleaseService('test/dummy', fetcher);

    // First call: fetch attempted, fails, throws.
    await expect(svc.getReleases()).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);

    // Within the backoff window — caller still gets an error but the
    // fetcher is NOT invoked again (no upstream hammering).
    vi.advanceTimersByTime(30_000);
    await expect(svc.getReleases()).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);

    // Past the backoff window — retry happens.
    vi.advanceTimersByTime(31_000); // total 61s past first failure
    await expect(svc.getReleases()).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('serves stale within the backoff window without re-fetching after a re-fetch fails', async () => {
    const releases = [release()];
    let mode: 'fast' | 'fail' = 'fast';
    const fetcher: typeof fetch = vi.fn(async () => {
      if (mode === 'fail') throw new Error('network down');
      return new Response(JSON.stringify(releases), { status: 200 });
    }) as unknown as typeof fetch;

    const svc = new GitHubReleaseService('test/dummy', fetcher);
    await svc.getReleases(); // warm cache
    expect(fetcher).toHaveBeenCalledTimes(1);

    // Expire the cache and switch to a failing upstream.
    vi.advanceTimersByTime(6 * 60 * 1000);
    mode = 'fail';
    const stale1 = await svc.getReleases();
    expect(stale1.staleSince).not.toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);

    // Within the backoff window — stale served, NO additional upstream call.
    vi.advanceTimersByTime(30_000);
    const stale2 = await svc.getReleases();
    expect(stale2.staleSince).not.toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('filters out draft releases (even with otherwise-valid assets)', async () => {
    const published = release();
    const draft = release({
      tag_name: 'v0.9.0',
      draft: true,
      published_at: null,
      // Asset is well-formed for v0.9.0 — without the draft filter, this
      // release would surface in the list. The draft filter must drop it.
      assets: [
        asset({
          name: 'astros-esp-0.9.0-metro_s3-app.bin',
          browser_download_url: 'https://example.test/astros-esp-0.9.0-metro_s3-app.bin',
        }),
      ],
    });
    const fetcher = makeFetcherReturning([published, draft]);

    const svc = new GitHubReleaseService('test/dummy', fetcher);
    const result = await svc.getReleases();

    expect(result.releases.map((r) => r.tag)).toEqual(['v1.0.0']);
  });

  it('surfaces pre-release releases with prerelease=true (does NOT filter them)', async () => {
    // Pre-releases (RC builds) are valid OTA targets — the UI's "Pre-release"
    // pill flags them visually rather than hiding them.
    const stable = release();
    const rc = release({
      tag_name: 'v1.2.0-RC.1',
      prerelease: true,
      assets: [
        asset({
          name: 'astros-esp-1.2.0-RC.1-metro_s3-app.bin',
          browser_download_url: 'https://example.test/astros-esp-1.2.0-RC.1-metro_s3-app.bin',
        }),
      ],
    });
    const fetcher = makeFetcherReturning([stable, rc]);

    const svc = new GitHubReleaseService('test/dummy', fetcher);
    const result = await svc.getReleases();

    expect(result.releases).toHaveLength(2);
    const stableInfo = result.releases.find((r) => r.tag === 'v1.0.0');
    const rcInfo = result.releases.find((r) => r.tag === 'v1.2.0-RC.1');
    expect(stableInfo?.prerelease).toBe(false);
    expect(rcInfo?.prerelease).toBe(true);
  });

  it('filters out non-draft releases with null published_at (defense in depth)', async () => {
    const published = release();
    const weird = release({
      tag_name: 'v0.9.0',
      draft: false,
      published_at: null,
      assets: [
        asset({
          name: 'astros-esp-0.9.0-metro_s3-app.bin',
          browser_download_url: 'https://example.test/astros-esp-0.9.0-metro_s3-app.bin',
        }),
      ],
    });
    const fetcher = makeFetcherReturning([published, weird]);

    const svc = new GitHubReleaseService('test/dummy', fetcher);
    const result = await svc.getReleases();

    expect(result.releases.map((r) => r.tag)).toEqual(['v1.0.0']);
  });

  it('filters out releases with zero matched assets', async () => {
    const releaseWithMatches = release();
    const releaseWithoutMatches = release({
      tag_name: 'v0.5.0',
      assets: [asset({ name: 'random.zip', content_type: 'application/zip' })],
    });
    const fetcher = makeFetcherReturning([releaseWithMatches, releaseWithoutMatches]);

    const svc = new GitHubReleaseService('test/dummy', fetcher);
    const result = await svc.getReleases();

    expect(result.releases).toHaveLength(1);
    expect(result.releases[0].tag).toBe('v1.0.0');
  });
});
