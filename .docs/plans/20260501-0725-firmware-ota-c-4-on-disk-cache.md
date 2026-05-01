# c.4 — On-disk firmware cache + newest-N retention + SHA-256 stream-hash

Light plan for the next server-orchestrator PR. Builds the on-disk binary cache that the FlashJob orchestrator (c.6) will consume: when a user selects a release to flash, the cache materializes the matched `-app.bin` from GitHub onto local disk, stream-hashes it during download, and prunes older versions to N=5.

**Branch:** `feature/firmware-ota-c-4-on-disk-cache` (off `develop`).
**PR target base:** `develop`.
**References:** [decomposition plan](./20260427-2202-firmware-ota-decomposition.md) § "Source acquisition + caching", [c.3 plan](./20260429-0918-firmware-ota-c-3-github-releases-service.md).

## Context

c.3 ships the GitHub release listing (metadata only — no binaries). c.4 ships the layer that actually puts a `.bin` on disk when one is needed. The orchestrator (c.6) is what calls into c.4; the route layer (c.8) doesn't talk to c.4 at all. c.4 is a pure module — no Express wiring, no WebSocket fan-out.

**Population is strictly on-demand.** No prefetch, no background polling. The cache fills up as users actually start flash jobs; eviction then keeps only the **newest 5 published releases** out of whatever the user has touched, sorted by semver desc with `published_at` as the tie-breaker. So the steady-state cache reflects "the 5 newest versions you've ever flashed" — not the last 5 you flashed (an older version you reflashed yesterday still drops out once five newer ones have been pulled). This keeps the disk footprint small (~12 MB at full cache: 5 releases × 2 variants × ~1.2 MB) and matches the user mental model that a firmware cache should hold *recent* versions, not *recently-touched* ones.

Asset naming convention from c.3 is preserved:
- `astros-esp-${VERSION}-${ENV}-app.bin` — what we cache.
- `${ENV}` is the PlatformIO env (variant) — `lolin_d32_pro`, `metro_s3`.
- `${VERSION}` follows semver and may include pre-release labels.

**Eviction unit is the release**, not the individual binary. When the cache exceeds 5 releases (sorted by semver descending; ties broken by `published_at` desc), both variants of the oldest release are removed together. This avoids the awkward "I have lolin 1.4.0 cached but not metro 1.4.0" half-state and matches the user mental model.

c.4's surface is a single class: `FirmwareCache`. Two methods that callers actually use (`lookup`, `fetch`) plus internal eviction. No route, no orchestrator wiring — those land in c.6 and c.8.

## On-disk layout

```
<rootDir>/
└── github/
    ├── astros-esp-1.4.0-metro_s3-app.bin
    ├── astros-esp-1.4.0-metro_s3-app.bin.sha256
    ├── astros-esp-1.4.0-metro_s3-app.meta.json
    ├── astros-esp-1.4.0-lolin_d32_pro-app.bin
    └── ...
```

Each `.bin` has two sidecar files: `.sha256` (lowercase hex digest, no trailing newline) and `.meta.json` (`{ tag, version, variant, downloadedAt, publishedAt, sourceUrl, sizeBytes }`). `publishedAt` is captured separately from `downloadedAt` so eviction has a stable tie-breaker that doesn't shift on re-download. The sidecars let `lookup()` answer cheaply without re-hashing on every call, and let an external tool (or future debug endpoint) inspect what's in the cache without parsing filenames.

`uploads/` is **not created in c.4** — that subdirectory is c.5's territory.

## Configuration

New env var **`FIRMWARE_CACHE_PATH`** (mirrors `DATABASE_PATH` exactly):

- Unset or `%appdata%` (case-insensitive) → `appdata('astrosserver')/firmware-cache/`
- Any other value → used literally

Helper `resolveFirmwareCacheDir(envValue: string | undefined): string` parallels `resolveDatabaseDir` in `dal/database.ts`. Tests bypass the env var entirely by passing `new FirmwareCache({ rootDir: <tempdir> })`.

`.env` gets a new line: `FIRMWARE_CACHE_PATH=%AppData%` (matches the committed `DATABASE_PATH=%AppData%` default; resolves to `appdata('astrosserver')/firmware-cache` at runtime).

## Tasks

- [x] **Typed models** (new `astros_api/src/models/firmware/cache.ts`):
    - `CachedAsset` — `{ path: string, sha256: string, sizeBytes: number, meta: CachedAssetMeta }`. Returned by `lookup()` and `fetch()`.
    - `CachedAssetMeta` — `{ tag: string, version: string, variant: string, downloadedAt: string, sourceUrl: string, sizeBytes: number }`. Persisted as `*.meta.json`.

- [x] **Path-resolution helper** (`resolveFirmwareCacheDir`) in the same file as the cache class. Mirrors `resolveDatabaseDir` semantics so both pieces of state share one mental model.

- [x] **`FirmwareCache` class** (new `astros_api/src/firmware/firmware_cache.ts`):
    - Constructor: `new FirmwareCache(opts?: { rootDir?: string, fetcher?: typeof fetch })`. Defaults: rootDir resolved from `FIRMWARE_CACHE_PATH`, fetcher = global `fetch`.
    - `lookup(version: string, variant: string): Promise<CachedAsset | null>` — stat-based, reads `.sha256` + `.meta.json` if all three files exist; null otherwise. Takes `version` (no `v` prefix) because that's what's encoded in the on-disk filename and what `AssetInfo` already carries; the orchestrator (c.6) will pass `asset.version` directly.
    - `fetch(release: ReleaseInfo, asset: AssetInfo): Promise<CachedAsset>` — if `lookup()` hits, return that. Otherwise download to `<name>.tmp` while streaming through `crypto.createHash('sha256')`; on success, write sidecars, atomic-rename `.tmp` → `.bin`, prune to N=5, return. On any I/O or hash error, delete the `.tmp` and re-throw. Takes both `release` and `asset` because the meta sidecar needs `tag` and `publishedAt` from the parent release (`AssetInfo` doesn't carry them); the orchestrator naturally has both in scope.
    - In-flight dedup: a `Map<string, Promise<CachedAsset>>` keyed by `${version}::${variant}` — concurrent `fetch()` calls for the same key await the same promise. The whole `fetch()` (including `lookup()`) is wrapped, not just the download phase, so two callers can't slip past `lookup()` independently and race on the same `.tmp` filename.
    - Sends `User-Agent: AstrOs.Server` only, via a local `DOWNLOAD_HEADERS` constant inlined in `firmware_cache.ts`. The asset endpoint is GitHub's CDN, not the v3 API, so c.3's `Accept: application/vnd.github+json` (which pins API content negotiation) isn't applicable here and is intentionally omitted. See "Notes for reviewer" for the full rationale.

- [x] **Eviction** — private `pruneToN(maxReleases = 5)`. Group cached binaries by `tag`, sort tags by semver desc with `published_at` from meta as tie-breaker, drop everything past index 4 (both variants of each evicted tag together). Fire after every successful `fetch()` write.

- [x] **`.env` update** (committed `.env.example` + `.env.test`; local `.env` is gitignored) — add `FIRMWARE_CACHE_PATH=%AppData%`, matching the existing `DATABASE_PATH=%AppData%` convention. `%AppData%` is a sentinel (case-insensitive) that `resolveFirmwareCacheDir` translates to `appdata('astrosserver')/firmware-cache`, so the cache and the SQLite DB share the same OS-resolved appdata parent on every platform. A literal path (e.g. `../.data/firmware-cache`) is also supported and used as-is — useful for ad-hoc dev runs but not the committed default.

- [x] **Tests** (new `astros_api/src/firmware/firmware_cache.test.ts`). TDD with mocked fetcher + temp dir per test (`fs.mkdtempSync` in `beforeEach`, `rm -rf` in `afterEach`). Cover:
    - `lookup` returns null when nothing is cached
    - `lookup` returns the cached asset when all three files exist
    - `lookup` returns null when only some sidecar files exist (defensive: an interrupted write left junk on disk)
    - `fetch` on cold cache downloads, writes all three files atomically (no `.tmp` left behind on success)
    - `fetch` returns from cache without re-downloading when already present
    - `fetch` removes the `.tmp` and re-throws if the download fails mid-stream
    - In-flight dedup: two concurrent `fetch()` calls for the same key invoke the fetcher exactly once
    - Eviction: 6th successful `fetch` evicts the oldest release (both variants); newest 5 remain
    - Eviction handles ties by `published_at` (tag-only sort isn't enough — semver-equal tags do exist in dev fixtures)
    - `resolveFirmwareCacheDir`: env unset → appdata path; env=`%appdata%` (any case) → appdata path; literal env value used as-is

## Verification

- [x] `npm run build` clean (lint + tsc).
- [x] `npm run test` green (329 → 347 passing; +18 new tests).
- [x] `npm run prettier:write` and `npm run lint:fix` clean.
- [ ] Manual smoke: with `FIRMWARE_CACHE_PATH` set to a scratch dir, instantiate the cache from a small script and call `fetch()` against a real GitHub asset URL; verify the three files land on disk and `lookup()` reports them on a second call. *(deferred — orchestrator integration in c.6 will exercise this against real assets; unit tests cover the same paths with mocked fetcher + temp dir.)*

## Files in scope (5)

1. `astros_api/src/models/firmware/cache.ts` — new `CachedAsset` + `CachedAssetMeta` types
2. `astros_api/src/firmware/firmware_cache.ts` — new `FirmwareCache` class + `resolveFirmwareCacheDir`
3. `astros_api/src/firmware/firmware_cache.test.ts` — new tests with mocked fetcher + temp dir
4. `astros_api/.env` — add `FIRMWARE_CACHE_PATH`
5. `.docs/plans/20260501-0725-firmware-ota-c-4-on-disk-cache.md` — this plan

5 files, well under the 10-file cap.

## Out of scope

- Upload mode (`uploads/` subdir + multipart write path + `esp_app_desc_t` parsing) — **c.5**.
- FlashJob orchestrator wiring — **c.6**.
- HTTP route exposure (the cache is purely an internal module in c.4) — **c.8**.
- Cache invalidation on user-initiated "delete" — out of scope for v1; newest-N retention is the only removal mechanism.
- Resume of partial downloads (HTTP `Range` requests) — `.tmp` is always discarded and re-downloaded on failure.
- Cross-process safety — single-process server only; no file locks.

## Notes for the reviewer

- **Expected SHA-256 source.** GitHub release assets don't carry a hash in the API response. Two options:
    - (a) Trust the download; persist whatever we computed. No verification possible at fetch time, but the orchestrator (c.6) re-hashes before sending to the master, and the master re-hashes after receiving — so a corruption would surface there.
    - (b) Pre-publish a separate `<name>.bin.sha256` file in the GitHub release and fetch both. Requires a CI change in `AstrOs.ESP`.

  c.4 will ship with **(a)** — simpler, and the existing protocol already has end-to-end SHA verification at the master/padawan layers. The plan's test list reflects this (no "expected hash mismatch" test). If the reviewer wants (b), it's a small follow-up to add an `expectedSha256?: string` field to `AssetInfo` in c.3 and check it here.

- **HTTP headers.** c.3's `REQUEST_HEADERS` (User-Agent + Accept) are appropriate for the API endpoint but not for the asset-download endpoint (which is a GitHub CDN URL, not the API). The download fetch should still send a User-Agent (best practice) but does not need the API's Accept header. Plan to inline a small `DOWNLOAD_HEADERS` constant in `firmware_cache.ts` rather than sharing — different endpoint, different appropriate headers.

- **`crypto.createHash` streaming.** The download body is a Web `ReadableStream`. `Readable.fromWeb()` adapts it to a Node stream that can be piped into both `fs.createWriteStream(<tmpPath>)` and `crypto.createHash('sha256')` via `stream.pipeline` with two consumers (`tee`-style: pipe through a `PassThrough` to the hash). Avoids loading 1.2 MB into a Buffer.

- **Atomic rename.** `fs.promises.rename` is atomic on the same filesystem. The cache's `<rootDir>/github/` is one filesystem by construction (we create it ourselves), so no edge cases.

- **Why eviction-by-release rather than eviction-by-binary.** N=5 binaries total would evict half-versions as variants alternate (e.g., flash lolin 1.4.0, then metro 1.4.0, then lolin 1.3.0 evicts metro 1.4.0). Eviction-by-release keeps versions whole and matches "I keep the last 5 versions" intuition. Worst case is 10 files / ~12 MB on disk.

- **Testability of `fs` operations.** The tests use a real temp dir (`fs.mkdtempSync`) rather than mocking `fs`. This catches actual atomic-rename + permission semantics that mocks would miss, at the cost of a few ms per test. Pattern matches the existing `dal/database.integration.test.ts` approach.
