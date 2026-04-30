# c.3 — GitHub release service + 5-min in-memory cache

Light plan for the next server-orchestrator PR. Builds the source-acquisition layer for `GitHub` mode of the firmware-OTA UI: a service that fetches the release list from `api.github.com`, picks the right `.bin` asset, and caches the result for 5 minutes. No route, no orchestrator wiring — c.8 wires the route, c.6 wires the orchestrator.

**Branch:** `feature/firmware-ota-c-3-github-releases-service` (off `develop`).
**PR target base:** `develop`.
**References:** [decomposition plan](./20260427-2202-firmware-ota-decomposition.md) § "Source acquisition + caching", [c.2 plan](./20260429-0655-firmware-ota-c-2-full-write-route-lock.md).

## Context

The firmware-OTA UI's "GitHub" source toggle needs an authoritative release list. The decomposition spec calls for:

- `GET https://api.github.com/repos/<owner>/AstrOs.ESP/releases` (anonymous, 60 req/hr per IP).
- Filter assets to `^astros-esp-v\d+\.\d+\.\d+\.bin$`; prefer the asset whose name matches `astros-esp-v${tag_name#v}.bin` exactly.
- Reject assets whose `content_type` isn't `application/octet-stream` (or similar).
- 5-minute in-memory cache; serve stale on fetch error with a `staleSince` warning surfaced in the API response.

c.3 ships the service in isolation. No route, no orchestrator integration. Tests use HTTP fixtures (no live calls in CI). The route comes in **c.8**, the cache becomes a c.6 dependency.

## Tasks

- [ ] **Typed models** (new `astros_api/src/models/firmware/release.ts`). At minimum: `ReleaseInfo` (the per-release shape we surface — `tag`, `version`, `publishedAt`, `assetName`, `assetUrl`, `sizeBytes`), `ReleaseListResult` (list + `staleSince: string | null` so consumers can distinguish a fresh fetch from a served-stale response), and the GitHub API DTO subset we parse (`GitHubReleaseDto`, `GitHubAssetDto`).
- [ ] **GitHub release service** (new `astros_api/src/firmware/github_release_service.ts`). Class `GitHubReleaseService` constructor takes `(repoSlug: string, fetcher: typeof fetch = fetch)` for DI / test mocking. Single public method: `getReleases(): Promise<ReleaseListResult>`. Internals: 5-min TTL in-memory cache; on cache miss, call `fetcher` against `https://api.github.com/repos/<repoSlug>/releases`; on success, parse + filter assets + write to cache + return; on fetch error, return last cached value (if any) with `staleSince` set to its fetch timestamp; on cold-cache fetch error, throw.
- [ ] **Asset selection logic.** Helper `pickFirmwareAsset(release: GitHubReleaseDto): GitHubAssetDto | null`. Filters to assets matching `^astros-esp-v\d+\.\d+\.\d+\.bin$`. Prefers exact match against `astros-esp-v${tag_name#v}.bin`; falls back to first match otherwise; returns null if nothing matches or if the matching asset's content_type isn't `application/octet-stream` / `application/macbinary`. Releases whose pickFirmwareAsset returns null are filtered out of the result.
- [ ] **Tests** (new `astros_api/src/firmware/github_release_service.test.ts`). Cover: cache miss → fetch → fresh result; cache hit within 5 min → no fetch; cache miss after 5 min → re-fetch; fetch error with cold cache → throws; fetch error with warm cache → returns stale with `staleSince`; asset filtering (exact match preferred, no-match release skipped, wrong content-type skipped); date math is mocked via `vi.useFakeTimers()` so the 5-min TTL is testable without sleep.

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
- Release-list refresh strategy beyond "fetch on getReleases() with 5-min TTL" — no background polling, no manual-refresh endpoint. Cache is lazy.
- GitHub authentication / PAT support — decomp explicitly chose anonymous fetch. The 60 req/hr limit is fine for this caching strategy (12 fetches/hr worst case, shared across all clients of the running server).

## Notes for the reviewer

- **Repo slug source.** The plan calls for `api.github.com/repos/<owner>/AstrOs.ESP/releases`. Owner needs to live in env (`GITHUB_REPO_SLUG=battlesloth/AstrOs.ESP` or equivalent); the service constructor takes a slug so tests can pass a stub. Will document the env var in the c.3 PR description.
- **Cache shape.** Single-keyed cache (the release list itself, no per-tag entries). One in-flight fetch only — if a second `getReleases()` arrives while a fetch is in flight, both await the same promise. Prevents stampede on cold cache.
- **Stale-on-error semantics.** Per decomp: "Serve stale on fetch error with a staleSince field surfaced in the API response." `ReleaseListResult.staleSince` is the ISO timestamp of the entry's original fetch; null when fresh. Callers (UI) display a "showing cached releases from X" banner when non-null.
- **Fake timers.** Vitest's `vi.useFakeTimers()` lets us advance time deterministically across the 5-min TTL boundary in tests. Avoids any real-time waits, keeps the suite fast.
- The asset-selection helper is exported separately from the service so a future module (likely c.4 for the on-disk cache or c.6 for the orchestrator) can call it directly against a release dto.
