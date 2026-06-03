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
    - `CachedAssetMeta` — `{ tag: string, version: string, variant: string, downloadedAt: string, publishedAt: string, sourceUrl: string, sizeBytes: number }`. Persisted as `*.meta.json`. `publishedAt` is the GitHub release publish timestamp (threaded through from `ReleaseInfo`) and is the load-bearing field for eviction tiebreaks when two entries compare equal under `compareVersions` — e.g., `1.2.0` vs `1.2.0-RC.1`, which the semver helper treats as equal because pre-release suffixes are stripped for gating. Stored separately from `downloadedAt` (which shifts on re-download) so the sort order stays stable across container restarts.

- [x] **Path-resolution helper** (`resolveFirmwareCacheDir`) in the same file as the cache class. Mirrors `resolveDatabaseDir` semantics so both pieces of state share one mental model.

- [x] **`FirmwareCache` class** (new `astros_api/src/firmware/firmware_cache.ts`):
    - Constructor: `new FirmwareCache(opts?: { rootDir?: string, fetcher?: typeof fetch, downloadTimeoutMs?: number })`. Defaults: rootDir resolved from `FIRMWARE_CACHE_PATH`, fetcher = global `fetch`, downloadTimeoutMs = 60_000. The `downloadTimeoutMs` knob bounds a single download (both connect and mid-stream phases via a shared `AbortController`) so a stalled CDN connection can't pin the in-flight dedup entry forever and freeze every subsequent `fetch()` for the same `(version, variant)`. It's exported on `FirmwareCacheOptions` primarily so tests can drive the timeout path in real time (e.g. `downloadTimeoutMs: 50`) without resorting to fake timers, but it's a real public option — integration callers may also tune it if 60 s proves wrong for their environment.
    - **Filename-safety validation** — `pathsFor()` interpolates `version` and `variant` into cache filenames before passing them to `path.join()`. Both inputs are validated against `/^[A-Za-z0-9][A-Za-z0-9._+-]*$/` at the chokepoint and a synchronous `Error` is thrown on any mismatch (path separators `/` `\`, drive letters `C:`, parent refs `..`, embedded nulls, leading-dot hidden files, whitespace). `variant` is already constrained upstream by c.3's `ASSET_PATTERN` (`[a-z0-9_]+`), so this is defense-in-depth there. `version` is captured upstream as `(.+)` — completely permissive — so this is the only guard for it: a release asset published with path separators in its version slot (e.g. `astros-esp-../../foo-metro_s3-app.bin`) would otherwise parse cleanly into `AssetInfo` and let the cache write outside `<rootDir>/github/`. Validation in `pathsFor` covers both `lookup()` and `fetch()` (the latter via `fetchInternal → lookup`) with one check; the synchronous throw becomes a rejected promise to async callers.
    - `lookup(version: string, variant: string): Promise<CachedAsset | null>` — stat-based, reads `.sha256` + `.meta.json` if all three files exist; null otherwise. Takes `version` (no `v` prefix) because that's what's encoded in the on-disk filename and what `AssetInfo` already carries; the orchestrator (c.6) will pass `asset.version` directly.
    - `fetch(release: ReleaseInfo, asset: AssetInfo): Promise<CachedAsset>` — if `lookup()` hits, return that. Otherwise download to `<name>.tmp` while streaming through `crypto.createHash('sha256')`. **Persist-phase ordering is load-bearing for crash recovery**: on success, **wipe all three** (unlink `.bin` + `.sha256` + `.meta.json`) → atomic-rename `.tmp` → `.bin` → write `.sha256` → write `.meta.json`. Wiping all three before the rename closes two crash-window classes: (a) **stale `.bin` + new sidecars** would surface if old code had written sidecars before promoting; (b) **stale sidecars + new `.bin`** would surface if a prior process left stale sidecars on disk (e.g., user deleted the `.bin` manually, or an external sweep removed `.bin` but missed sidecars). Promoting the `.bin` after the wipe means any mid-persist crash yields lookup-miss state, never a mismatched 3-file hit where bytes don't match the recorded hash. Strict ENOENT-only catch on `.bin` (Windows rename needs a clean destination); silent best-effort on sidecar unlinks since the writeFiles below overwrite anyway. Cleanup is symmetric across both failure phases: a download or hash error unlinks the `.tmp`; a persist-phase error (writeFile EACCES/ENOSPC, rename EACCES/EXDEV) unlinks `.tmp` + `.bin` + both sidecars. The just-promoted `.bin` is included because pruneToN's sweep only handles `.tmp`; an orphaned `.bin` with no sidecars would otherwise sit until the next fetch on the same key. Takes both `release` and `asset` because the meta sidecar needs `tag` and `publishedAt` from the parent release (`AssetInfo` doesn't carry them); the orchestrator naturally has both in scope.
    - In-flight dedup: a `Map<string, Promise<CachedAsset>>` keyed by `${version}::${variant}` — concurrent `fetch()` calls for the same key await the same promise. The whole `fetch()` (including `lookup()`) is wrapped, not just the download phase, so two callers can't slip past `lookup()` independently and race on the same `.tmp` filename.
    - Sends `User-Agent: AstrOs.Server` only, via a local `DOWNLOAD_HEADERS` constant inlined in `firmware_cache.ts`. The asset endpoint is GitHub's CDN, not the v3 API, so c.3's `Accept: application/vnd.github+json` (which pins API content negotiation) isn't applicable here and is intentionally omitted. See "Notes for reviewer" for the full rationale.

- [x] **Eviction** — private `pruneToN(maxReleases = 5, keepTag?)`. Group cached binaries by `tag`, sort tags by semver desc with `published_at` from meta as tie-breaker, drop everything past index 4 (both variants of each evicted tag together). Fire after every successful `fetch()` write. **The just-fetched `release.tag` is passed as `keepTag`** so an older-version fetch into a full cache (e.g. user rolling back when N newer versions are cached) doesn't see its own just-written `.bin` evicted as the "oldest" of N+1 — without this anchor, the post-prune `stat(p.bin)` would ENOENT and the entire fetch would reject for a successfully-downloaded firmware. Eviction still produces a cache of size `maxReleases`; the keep-anchor just shifts which member is dropped (the oldest of the *others* rather than the absolute oldest). **Also sweeps three classes of garbage** that `lookup()` can't return AND the meta-based eviction can't count: (1) **orphan `*.bin.tmp` files** left by processes killed mid-download (OOM, container kill, reboot); (2) **malformed/unreadable `*.meta.json` files** plus their sibling `.bin` and `.bin.sha256` (corruption, partial flush, tampering); (3) **orphan `.bin` and `.bin.sha256` with no `.meta.json`** — the crash window opened by the persist-phase reorder, where a process killed after `rename` but before `writeFile sha`/`writeFile meta` leaves a sized binary on disk that's invisible to lookup AND uncountable by eviction. Without all three sweeps, repeated crashes/power-loss could grow the cache past its advertised retention policy indefinitely. **Concurrency safety** uses an in-flight basename skip set (derived from `inFlight` Map keys) that protects all four sibling files of any in-flight fetch — so a concurrent pruneToN can't corrupt a mid-persist `.tmp`, mid-rename `.bin`, partially-written `.bin.sha256`, or partially-written `.meta.json`. Pass 1 reads every `.meta.json` (including in-flight ones — the just-fetched fetch's own meta is fully written before its pruneToN runs, since `writeFile meta` is the last persist step) but skips the *cleanup* step for in-flight basenames so a concurrent fetch's mid-write meta-validation-failure doesn't trigger an unlink. All sweep paths are derived from each entry's Dirent name (a guaranteed basename), so unlink targets always live inside `<rootDir>/github/` even if a meta sidecar's JSON content carries path-traversal payloads.

- [x] **`.env` update** (committed `.env.example` + `.env.test`; local `.env` is gitignored) — add `FIRMWARE_CACHE_PATH=%AppData%`, matching the existing `DATABASE_PATH=%AppData%` convention. `%AppData%` is a sentinel (case-insensitive) that `resolveFirmwareCacheDir` translates to `appdata('astrosserver')/firmware-cache`, so the cache and the SQLite DB share the same OS-resolved appdata parent on every platform. A literal path (e.g. `../.data/firmware-cache`) is also supported and used as-is — useful for ad-hoc dev runs but not the committed default.

- [x] **Tests** (new `astros_api/src/firmware/firmware_cache.test.ts`). TDD with mocked fetcher + temp dir per test (`fs.mkdtempSync` in `beforeEach`, `rm -rf` in `afterEach`). Cover:
    - `lookup` returns null when nothing is cached
    - `lookup` returns the cached asset when all three files exist
    - `lookup` returns null when only some sidecar files exist (defensive: an interrupted write left junk on disk)
    - `fetch` on cold cache downloads, writes all three files atomically (no `.tmp` left behind on success)
    - `fetch` returns from cache without re-downloading when already present
    - `fetch` removes the `.tmp` and re-throws if the download fails mid-stream
    - `fetch` removes the `.tmp` and any partially-written sidecars when the persist phase fails after a successful download (writeFile ENOSPC after `.sha` has already landed)
    - `fetch` removes the `.tmp` (and the just-promoted `.bin`/sidecars if applicable) when any persist-phase write fails — rename EACCES, writeFile ENOSPC
    - Crash-recovery invariant: at sidecar-write time, `p.bin` is either the fresh bytes or absent — never the stale content. Pinned via spying on `writeFile` to snapshot `p.bin` at each sidecar write call; pre-fix order (sidecars-first) reproduced exactly the reviewer-described mismatch (sha-vs-bytes mismatch on the next lookup)
    - Stale-sidecars wipe: when pre-state has `.sha256` and `.meta.json` on disk but no `.bin` (e.g., `.bin` deleted externally or by a partial prior eviction), the persist phase wipes the stale sidecars before promoting the new `.bin` so a crash mid-persist can't leave a mismatched hit. Pinned by snapshotting both sidecars at each `writeFile` call and asserting neither equals the stale value
    - Filename-safety: `lookup` rejects unsafe `version` inputs (forward slash, backslash, parent ref, drive letter, empty string, leading dot, embedded null) with a `/filename-safe/` error; rejects unsafe `variant` for defense-in-depth; valid semver pre-releases with build metadata (`1.2.0-rc.1+build.123`) remain accepted (regression guard)
    - `fetch` rejects unsafe input synchronously without invoking the fetcher and without writing anything to disk — sentinel file outside the cache dir confirms validation runs before any `path.join` could normalize the input into an escape
    - In-flight dedup: two concurrent `fetch()` calls for the same key invoke the fetcher exactly once
    - Eviction: 6th successful `fetch` evicts the oldest release (both variants); newest 5 remain
    - Eviction handles ties by `published_at` (tag-only sort isn't enough — semver-equal tags do exist in dev fixtures)
    - Eviction keeps the just-fetched release even when it sorts oldest (older-version fetch into a full cache of newer versions): cache pre-populated with v2.0.0..v2.4.0; fetching v1.0.0 must keep the just-written v1.0.0 and instead drop v2.0.0 (oldest of the others), so the post-prune `stat()` finds the file and the returned `CachedAsset.path` resolves correctly
    - Orphan-tmp sweep: pre-existing `*.bin.tmp` files (simulating a crashed prior process) are removed when `pruneToN` runs; sweep happens regardless of whether release-eviction is needed (covers the `byTag.size <= maxReleases` early-return path)
    - Malformed-meta cleanup: an `astros-esp-malformed-app.meta.json` containing `{}` is removed during eviction (not just skipped), so it can't accumulate beyond MAX_RELEASES forever
    - Sibling-bin/sha cleanup: a complete cached entry on disk where `.meta.json` is malformed (truncated JSON) gets all three siblings (`.bin`, `.bin.sha256`, `.meta.json`) swept together, since lookup can't serve it and the eviction sort can't see it
    - Unreadable-meta cleanup: an EACCES on `readFile` (rather than malformed JSON) triggers the same sibling sweep — the failure mode is unreachable-by-lookup either way
    - Orphan-bin sweep (no meta, no sha): pre-existing `.bin` with no sidecars (simulating a crash between rename and writeFile sha) is removed when `pruneToN` runs
    - Orphan-bin sweep (no meta, sha present): pre-existing `.bin` + `.bin.sha256` with no `.meta.json` (simulating a crash between writeFile sha and writeFile meta) — both siblings removed together
    - Mid-persist concurrency safety: a fetch in flight whose `.bin` has been promoted but sidecars not yet written is preserved when a concurrent fetch's `pruneToN` runs — basename-keyed in-flight skip distinguishes legitimate mid-persist files from crash orphans
    - Concurrency safety: a `.tmp` file for a fetch currently in flight (engineered with a hanging `ReadableStream` body so the chunk lands on disk but the pipeline pauses) is preserved when `pruneToN` runs from a concurrent fetch — the inFlight skip correctly distinguishes live downloads from orphans
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
