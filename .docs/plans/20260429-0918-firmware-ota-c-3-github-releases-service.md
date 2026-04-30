# c.3 — GitHub release service + 5-min in-memory cache

Light plan for the next server-orchestrator PR. Builds the source-acquisition layer for `GitHub` mode of the firmware-OTA UI: a service that fetches the release list from `api.github.com`, picks the right `.bin` asset, and caches the result for 5 minutes. No route, no orchestrator wiring — c.8 wires the route, c.6 wires the orchestrator.

**Branch:** `feature/firmware-ota-c-3-github-releases-service` (off `develop`).
**PR target base:** `develop`.
**References:** [decomposition plan](./20260427-2202-firmware-ota-decomposition.md) § "Source acquisition + caching", [c.2 plan](./20260429-0655-firmware-ota-c-2-full-write-route-lock.md).

## Context

The firmware-OTA UI's "GitHub" source toggle needs an authoritative release list. AstrOs.ESP's CI workflows (`rc-build.yml`, `release-build.yml`) currently produce two artifacts per build env per release:

- `astros-esp-${VERSION}-${ENV}-app.bin` — application partition (what OTA flashes).
- `astros-esp-${VERSION}-${ENV}-flash.bin` — full flash image including bootloader, for first-time USB bootstrap. Out of scope for OTA.

`${ENV}` is the PlatformIO env name (currently `lolin_d32_pro` and `metro_s3`); each is a different chip family + partition layout, so binaries are not interchangeable across variants. `${VERSION}` follows semver and may include pre-release labels (e.g., `1.0.0`, `1.2.0-RC.1`).

c.3 fetches the GitHub release list, picks all `-app.bin` assets per release (one per variant), and exposes them as a typed list with each asset's variant captured. The orchestrator (**c.6**) is what eventually matches each controller's reported variant to the correct asset; c.3 returns the full set of variants without picking.

Service-level spec from the decomposition:

- `GET https://api.github.com/repos/<owner>/AstrOs.ESP/releases` (anonymous, 60 req/hr per IP).
- Asset filter: `^astros-esp-(.+)-([a-z][a-z0-9_]*)-app\.bin$` — captures `version` and `variant`. The `-app.bin` suffix anchors against `-flash.bin`. The `[a-z][a-z0-9_]*` variant pattern excludes the hyphens that semver pre-release labels can contain, so the regex backtracks correctly on names like `astros-esp-1.2.0-RC.1-lolin_d32_pro-app.bin`.
- Reject assets whose `content_type` isn't `application/octet-stream` (or similar).
- 5-minute in-memory cache; serve stale on fetch error with a `staleSince` warning surfaced in the API response.

c.3 ships the service in isolation. No route, no orchestrator integration. Tests use HTTP fixtures (no live calls in CI). The route comes in **c.8**, the cache becomes a **c.6** dependency.

## Tasks

- [ ] **Typed models** (new `astros_api/src/models/firmware/release.ts`). At minimum:
    - `AssetInfo` — `{ variant: string, version: string, assetName: string, assetUrl: string, sizeBytes: number }` (one per matched `-app.bin`).
    - `ReleaseInfo` — `{ tag: string, version: string, publishedAt: string, assets: AssetInfo[] }` (one or more matched assets per release).
    - `ReleaseListResult` — `{ releases: ReleaseInfo[], staleSince: string | null }` so consumers can distinguish a fresh fetch from a served-stale response.
    - The GitHub API DTO subset we parse (`GitHubReleaseDto`, `GitHubAssetDto`) with only the fields we need (`tag_name`, `published_at`, `assets[].name|browser_download_url|size|content_type`).
- [ ] **GitHub release service** (new `astros_api/src/firmware/github_release_service.ts`). Class `GitHubReleaseService` constructor takes `(repoSlug: string, fetcher: typeof fetch = fetch)` for DI / test mocking. Single public method: `getReleases(): Promise<ReleaseListResult>`. Internals: 5-min TTL in-memory cache; on cache miss, call `fetcher` against `https://api.github.com/repos/<repoSlug>/releases`; on success, parse + extract per-variant assets + write to cache + return; on fetch error, return last cached value (if any) with `staleSince` set to its fetch timestamp; on cold-cache fetch error, throw. In-flight fetch deduplication so a stampede of `getReleases()` calls during a cold-cache fetch awaits one promise.
- [ ] **Asset selection logic.** Exported helper `extractFirmwareAssets(release: GitHubReleaseDto): AssetInfo[]`. Walks `release.assets`, applies the regex `^astros-esp-(.+)-([a-z][a-z0-9_]*)-app\.bin$` (capturing version + variant), rejects entries whose `content_type` isn't octet-stream-flavored, returns the array of matched assets. Releases that yield no assets are filtered out of `ReleaseInfo[]` entirely. (Optional sanity check: warn-and-skip if the parsed `version` from the asset name doesn't match the release's `tag_name` minus a leading `v` — catches misnamed assets at parse time rather than at flash time.)
- [ ] **Tests** (new `astros_api/src/firmware/github_release_service.test.ts`). Cover: cache miss → fetch → fresh result; cache hit within 5 min → no fetch; cache miss after 5 min → re-fetch; fetch error with cold cache → throws; fetch error with warm cache → returns stale with `staleSince`; asset filtering (multi-variant release returns multiple assets, `-flash.bin` excluded, no-match release skipped, wrong content-type skipped, asset whose parsed version disagrees with tag is skipped); pre-release version like `1.2.0-RC.1` parses correctly; date math is mocked via `vi.useFakeTimers()` so the 5-min TTL is testable without sleep.

## Verification

- [ ] `npm run build` clean (lint + tsc).
- [ ] `npm run test` green (existing + new c.3 tests).
- [ ] `npm run prettier:write` and `npm run lint:fix` clean.
- [ ] Verify the asset matcher against representative GitHub release fixtures (one with a single matching asset, one with multiple non-matching assets, one with no `.bin` at all).

## Files in scope (3)

1. `astros_api/src/models/firmware/release.ts` — new typed models for the release-list result, the GitHub API DTO subset, and the asset shape
2. `astros_api/src/firmware/github_release_service.ts` — new service: fetcher DI, 5-min cache, asset selection, stale-on-error fallback
3. `astros_api/src/firmware/github_release_service.test.ts` — new tests with mocked fetch + fake timers

3 files, well under the soft cap. The `firmware/` folder is new at this layer (we have `models/firmware/` from c.1; this is the matching service layer).

## Out of scope

- Route exposure (`GET /firmware/releases`) — **c.8**.
- On-disk `.bin` cache for downloaded firmware files — **c.4**.
- Upload mode + `esp_app_desc_t` parsing — **c.5**.
- FlashJob orchestrator integration — **c.6**.
- **Heartbeat-variant extension.** c.6 will need POLL_ACK extended from `name<US>fingerprint<US>version` to `name<US>fingerprint<US>version<US>variant` so the orchestrator can match each controller to the correct asset variant. That's a paired cross-repo protocol amendment best done alongside c.6 (where it's actually consumed); doing it in c.3 would ship dead code on both sides. c.3's service returns all matched variants per release without picking; the picker logic + heartbeat amendment land together.
- Release-list refresh strategy beyond "fetch on getReleases() with 5-min TTL" — no background polling, no manual-refresh endpoint. Cache is lazy.
- GitHub authentication / PAT support — decomp explicitly chose anonymous fetch. The 60 req/hr limit is fine for this caching strategy (12 fetches/hr worst case, shared across all clients of the running server).

## Notes for the reviewer

- **Repo slug source.** The plan calls for `api.github.com/repos/<owner>/AstrOs.ESP/releases`. Owner needs to live in env (`GITHUB_REPO_SLUG=battlesloth/AstrOs.ESP` or equivalent); the service constructor takes a slug so tests can pass a stub. Will document the env var in the c.3 PR description.
- **Cache shape.** Single-keyed cache (the release list itself, no per-tag entries). One in-flight fetch only — if a second `getReleases()` arrives while a fetch is in flight, both await the same promise. Prevents stampede on cold cache.
- **Stale-on-error semantics.** Per decomp: "Serve stale on fetch error with a staleSince field surfaced in the API response." `ReleaseListResult.staleSince` is the ISO timestamp of the entry's original fetch; null when fresh. Callers (UI) display a "showing cached releases from X" banner when non-null.
- **Fake timers.** Vitest's `vi.useFakeTimers()` lets us advance time deterministically across the 5-min TTL boundary in tests. Avoids any real-time waits, keeps the suite fast.
- The asset-selection helper is exported separately from the service so a future module (likely c.4 for the on-disk cache or c.6 for the orchestrator) can call it directly against a release dto.
