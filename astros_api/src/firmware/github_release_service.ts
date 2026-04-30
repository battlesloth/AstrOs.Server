import { logger } from '../logger.js';
import type {
  AssetInfo,
  GitHubReleaseDto,
  ReleaseInfo,
  ReleaseListResult,
} from '../models/firmware/release.js';

// Asset name pattern: astros-esp-${VERSION}-${ENV}-app.bin
//   - ${VERSION} can be plain semver (1.0.0) or include pre-release labels
//     containing hyphens (1.2.0-RC.1).
//   - ${ENV} is the PlatformIO env name; lowercase letters/digits/underscores
//     only — no hyphens. That asymmetry is what lets the regex backtrack
//     correctly past hyphens inside the version.
//   - The -app.bin suffix anchors against -flash.bin (USB-bootstrap image).
const ASSET_PATTERN = /^astros-esp-(.+)-([a-z][a-z0-9_]*)-app\.bin$/;

// Acceptable content types for a firmware binary. GitHub assets typically
// arrive as application/octet-stream; macbinary is occasionally seen on
// macOS-built artifacts.
const OCTET_CONTENT_TYPES: ReadonlySet<string> = new Set([
  'application/octet-stream',
  'application/macbinary',
]);

const TTL_MS = 5 * 60 * 1000;

// Per-fetch timeout. Without this, a stalled GitHub request would hang
// indefinitely, leaving `inFlight` unresolved and blocking every future
// caller until the process restarts. 10 seconds is generous enough for
// slow networks and tight enough that the UI degrades to stale-cache
// fallback (or a fast error) rather than a perceived freeze.
const FETCH_TIMEOUT_MS = 10_000;

/**
 * Pure helper: walks a GitHub release's assets, extracts the matched
 * `-app.bin` firmware binaries, returns them as typed AssetInfo entries.
 * Skips:
 *   - assets whose name doesn't match the firmware naming convention
 *   - assets whose content_type isn't octet-stream-flavored
 *   - assets whose parsed version disagrees with the release tag (likely a
 *     misnamed CI artifact; better to fail fast at parse time than at flash
 *     time)
 *
 * Exported so consumers (the service here today, future modules later) can
 * reuse the parsing without going through the cache layer.
 */
export function extractFirmwareAssets(release: GitHubReleaseDto): AssetInfo[] {
  const expectedVersion = stripLeadingV(release.tag_name);
  const result: AssetInfo[] = [];

  for (const asset of release.assets) {
    if (!OCTET_CONTENT_TYPES.has(asset.content_type)) continue;
    const match = ASSET_PATTERN.exec(asset.name);
    if (!match) continue;

    const [, version, variant] = match;
    if (version !== expectedVersion) {
      logger.warn(
        `firmware asset ${asset.name} version ${version} disagrees with release tag ${release.tag_name}; skipping`,
      );
      continue;
    }

    result.push({
      variant,
      version,
      assetName: asset.name,
      assetUrl: asset.browser_download_url,
      sizeBytes: asset.size,
    });
  }

  return result;
}

interface CacheEntry {
  releases: ReleaseInfo[];
  fetchedAt: number;
}

/**
 * Fetches the AstrOs.ESP release list from GitHub and caches it for 5 minutes.
 * Anonymous fetches are subject to GitHub's 60 req/hr per-IP rate limit; a
 * 5-min TTL keeps worst-case at 12 fetches/hour shared across all clients of
 * the running server.
 *
 * The fetcher is dependency-injected so tests can pass a mock; production
 * uses Node 18+ global fetch.
 *
 * Concurrency: a single in-flight promise is reused for any callers that
 * arrive while a fetch is already underway, so a stampede on cold cache only
 * triggers one upstream request.
 *
 * Failure mode: when fetch fails AND the cache holds a previous successful
 * result, the service returns that stale data with `staleSince` set to the
 * ISO timestamp of the original fetch. When fetch fails on a cold cache,
 * the error propagates.
 */
export class GitHubReleaseService {
  private cache: CacheEntry | null = null;
  private inFlight: Promise<ReleaseListResult> | null = null;
  private readonly url: string;

  constructor(
    repoSlug: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    this.url = `https://api.github.com/repos/${repoSlug}/releases`;
  }

  async getReleases(): Promise<ReleaseListResult> {
    if (this.inFlight) return this.inFlight;

    if (this.cache && Date.now() - this.cache.fetchedAt < TTL_MS) {
      return { releases: this.cache.releases, staleSince: null };
    }

    this.inFlight = this.fetchOnce();
    try {
      return await this.inFlight;
    } finally {
      this.inFlight = null;
    }
  }

  private async fetchOnce(): Promise<ReleaseListResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await this.fetcher(this.url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(
          `GitHub releases endpoint ${this.url} returned ${response.status} ${response.statusText}`,
        );
      }
      const dtos = (await response.json()) as GitHubReleaseDto[];
      const releases = dtos.map(toReleaseInfo).filter((info) => info.assets.length > 0);
      this.cache = { releases, fetchedAt: Date.now() };
      return { releases, staleSince: null };
    } catch (err) {
      // If the abort fired we know the cause; convert the (possibly opaque)
      // AbortError into a message that names the URL + timeout duration so
      // logs and error responses point at the right thing to investigate.
      const surfaced = controller.signal.aborted
        ? new Error(`GitHub releases fetch timed out after ${FETCH_TIMEOUT_MS}ms: ${this.url}`)
        : (err as Error);

      if (this.cache) {
        logger.warn(
          `GitHub releases fetch failed; serving stale cache from ${new Date(
            this.cache.fetchedAt,
          ).toISOString()}: ${surfaced.message}`,
        );
        return {
          releases: this.cache.releases,
          staleSince: new Date(this.cache.fetchedAt).toISOString(),
        };
      }
      throw surfaced;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

function toReleaseInfo(dto: GitHubReleaseDto): ReleaseInfo {
  return {
    tag: dto.tag_name,
    version: stripLeadingV(dto.tag_name),
    publishedAt: dto.published_at,
    assets: extractFirmwareAssets(dto),
  };
}

function stripLeadingV(tag: string): string {
  return tag.startsWith('v') ? tag.slice(1) : tag;
}
