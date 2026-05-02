# c.5 — Firmware upload store + `esp_app_desc_t` parser

Light plan for the next server-orchestrator PR. Builds the upload-mode counterpart to c.4: when the user supplies a local `.bin` instead of picking a GitHub release, c.5 parses the embedded `esp_app_desc_t` to verify it's an AstrOs firmware (right project, parseable version), stream-hashes it, and atomically promotes it into a single-slot upload store. The orchestrator (c.6) consumes this; the route (c.8) feeds it. c.5 ships as a pure module — no Express wiring, no WebSocket fan-out.

**Branch:** `feature/firmware-ota-c-5-upload-store` (off `develop`).
**PR target base:** `develop`.
**References:** [decomposition plan](./20260427-2202-firmware-ota-decomposition.md) § "Source acquisition + caching", [c.3 plan](./20260429-0918-firmware-ota-c-3-github-releases-service.md), [c.4 plan](./20260501-0725-firmware-ota-c-4-on-disk-cache.md).

## Context

The upload path is symmetric to GitHub mode but with two distinct concerns c.4 doesn't have:

1. **Trust boundary at the binary itself.** A GitHub release came from CI; an upload came from a user's filesystem. The `esp_app_desc_t` struct in the `.bin` is the only structural evidence that the file is what it claims to be. Reject malformed or wrong-project binaries before they reach the flash path — a 1.2 MB blob written into `esp_ota_*` could brick a controller.
2. **Single-slot retention.** No "newest 5", no semver sort, no published-at tiebreak — uploads keep the most recent only and replace on next write. Eviction collapses to "wipe any prior `upload-*.bin*` triple before the rename" and `latest()` is an O(directory-listing) operation.

c.5's surface is one class — `FirmwareUploadStore` — plus a pure parser exported from a sibling module. Mirrors c.4's "service-class only, no route" pattern. The c.8 route layer adapts multipart `req` → service call.

## On-disk layout

```
<rootDir>/
├── github/             # c.4 owns this
│   └── astros-esp-…app.bin (+ sidecars)
├── tmp/                # c.5: express-fileupload tempFileDir (mounted in c.8)
│   └── <random>.tmp    # upstream-managed; c.5 only consumes paths
└── uploads/            # c.5 owns this
    ├── upload-<uuid>.bin
    ├── upload-<uuid>.bin.sha256
    └── upload-<uuid>.meta.json
```

`tmp/` and `uploads/` live under the same `<rootDir>` (= same filesystem) so the temp-to-final `fs.rename` is atomic. The route layer (c.8) ensures `tmp/` exists at boot and points express-fileupload at it; c.5's `FirmwareUploadStore` only consumes `tempPath` strings produced upstream and trusts they live on the same volume as `uploads/`.

Each upload has the same three-file shape as c.4: `.bin` + `.sha256` (lowercase hex digest, no trailing newline) + `.meta.json` (`{ uploadId, originalFilename, projectName, version, uploadedAt, sizeBytes }`). No `tag` (uploads aren't releases), no `publishedAt` (only `uploadedAt`).

## Configuration

**No new env var.** Reuses c.4's `FIRMWARE_CACHE_PATH` / `resolveFirmwareCacheDir`. The on-disk story is "one rootDir, two subdirs, one path-resolution helper" — a parallel env would let `tmp/` and `uploads/` land on different filesystems and break the atomic rename.

`FirmwareUploadStore` constructor accepts `{ rootDir?: string, expectedProjectName?: string }`. Tests pass `new FirmwareUploadStore({ rootDir: tempDir })` to bypass the env entirely.

## Tasks

- [ ] **Extract `assertPathSafe` to a shared module** (new `astros_api/src/firmware/path_safety.ts`). Move `PATH_SAFE_RE` + `assertPathSafe` out of `firmware_cache.ts`; update `firmware_cache.ts` to import. Both helpers remain module-scope; c.4 behavior unchanged. This is the cleanest moment to extract — c.5 is the second consumer.

- [ ] **Typed models** (new `astros_api/src/models/firmware/upload.ts`):
  - `EspAppDesc` — `{ magicWord: number, secureVersion: number, version: string, projectName: string, time: string, date: string, idfVer: string, appElfSha256: Buffer }`. Returned by the parser.
  - `StoredUploadMeta` — `{ uploadId: string, originalFilename: string, projectName: string, version: string, uploadedAt: string, sizeBytes: number }`. Persisted as `upload-<uuid>.meta.json`.
  - `StoredUpload` — `{ path: string, sha256: string, sizeBytes: number, meta: StoredUploadMeta }`. Returned by `store()` and `latest()`. Mirrors c.4's `CachedAsset`.

- [ ] **`esp_app_desc_t` parser** (new `astros_api/src/firmware/esp_app_desc.ts`). Pure-compute, no fs/network. Single export `parseEspAppDesc(buf: Buffer): EspAppDesc`. Throws on any structural failure. Constants:
  - `ESP_IMAGE_HEADER_SIZE = 24`, `ESP_IMAGE_SEGMENT_HEADER_SIZE = 8`, `ESP_APP_DESC_OFFSET = 32`, `ESP_APP_DESC_SIZE = 256`, `ESP_APP_DESC_MAGIC = 0xABCD5432`.
  - Field offsets within `esp_app_desc_t`: `magic_word=0`, `secure_version=4`, `reserv1=8..16`, `version=16` (32 B), `project_name=48` (32 B), `time=80` (16 B), `date=96` (16 B), `idf_ver=112` (32 B), `app_elf_sha256=144` (32 B).
  - Helper `readFixedString(buf, off, len)` slices `len` bytes, finds first `0x00`, throws if no null terminator within slot, decodes prefix as UTF-8, rejects any embedded control char `< 0x20` so a tampered `version` field with `\x00\x01` etc. fails fast.
  - Magic word read with `readUInt32LE`. Reject when `!== ESP_APP_DESC_MAGIC`.
  - Up-front length check: throw if `buf.length < 288`. Caller only ever reads the first 288 bytes.

- [ ] **`FirmwareUploadStore` class** (new `astros_api/src/firmware/firmware_upload_store.ts`):
  - Constructor: `new FirmwareUploadStore(opts?: { rootDir?: string, expectedProjectName?: string })`. `expectedProjectName` defaults to `'astros-esp'` (resolves decomp Open Item #4 — see Notes; verification step against firmware repo's `CONFIG_APP_PROJECT_NAME` is in the open-items list).
  - **`store(tempPath: string, originalFilename: string): Promise<StoredUpload>`**:
    1. Generate `uploadId = uuid_v4()`. `assertPathSafe(uploadId, 'uploadId')` for defense-in-depth against future regressions where the uuid generator changes.
    2. `fsp.open(tempPath)` → `read(buf, 0, 288, 0)` into a 288-byte Buffer; close handle in a `finally` block (no fd leak on parse failure).
    3. Call `parseEspAppDesc` on those bytes. Any throw propagates.
    4. Verify `desc.projectName === expectedProjectName`; reject otherwise with the actual value in the error message.
    5. Verify `desc.version` parses under `compareVersions(v, v) === 0` (existing helper at `astros_api/src/utility/semver.ts`). Strict 3-component prefix means `1.2.0-rc.1+build.123` parses but `1.2` and `latest` don't.
    6. Stream-hash the **whole** temp file via `stream/promises.pipeline(createReadStream(tempPath), hashTransform)`; sum bytes streamed for `sizeBytes`. No buffering.
    7. **Atomic promote** with c.4's persist-phase ordering:
       - `fsp.mkdir(<rootDir>/uploads/, { recursive: true })`
       - **Wipe any prior `upload-*.bin`, `upload-*.bin.sha256`, `upload-*.meta.json`** in `<rootDir>/uploads/` (best-effort unlinks; `readdir` + filter + `Promise.all` of unlinks).
       - `fsp.rename(tempPath, <rootDir>/uploads/upload-<uuid>.bin)`.
       - `writeFile(.bin.sha256, sha)`
       - `writeFile(.meta.json, JSON.stringify(meta, null, 2))`
    8. On any failure in steps 6–7: `Promise.all` of best-effort `unlink` against the temp file, the just-promoted `.bin`, and both sidecars (mirrors c.4's symmetric persist-phase rollback). Rethrow.
    9. Return `StoredUpload`.
  - **`latest(): Promise<StoredUpload | null>`** — `readdir(<rootDir>/uploads)`, filter for files matching `^upload-([0-9a-f-]{36})\.meta\.json$`. If multiple matches (corruption/manual intervention), pick the most-recently-mtime'd one and log a warn. Read all three files for that uuid; return null if any are missing or malformed (defensive — mirrors c.4's `lookup`).
  - **Filename safety:** `pathsFor(rootDir, uploadId)` runs `assertPathSafe(uploadId, 'uploadId')`. UUID v4 is `[0-9a-f-]+` so always passes; the assertion guards future refactors.
  - **Concurrency:** no in-process mutex. Two concurrent uploads tolerated by last-writer-wins on the wipe-then-rename sequence; `.meta.json` is the durability anchor. The flash-job hard lock from c.0/c.2 ensures uploads never overlap with a flash, so the only race is two browser tabs uploading back-to-back. Per-store atomic rename is the entire concurrency model.

- [ ] **Tests** (new `astros_api/src/firmware/esp_app_desc.test.ts`). Pure parser tests with constructed fixtures:
  - Helper `makeAppDescBuffer({ projectName, version, ... })` builds a 288-byte Buffer: 32 zero bytes for image+segment header stub, magic word at offset 32, fixed-length string slots populated with `Buffer.from(name, 'utf8').copy(target, 0); target[name.length] = 0`. Rest zero-filled.
  - Valid binary parses; `projectName === 'astros-esp'`, `version === '1.4.0'`.
  - Wrong magic word → throws.
  - Buffer shorter than 288 bytes → throws.
  - `project_name` field with no null terminator within its 32-byte slot → throws.
  - `version` field with embedded null mid-string truncates at the null (yields `'1.4'` for `1.4\x00.0`).
  - String field with control chars `\x01..\x1F` after the null → throws.
  - Non-UTF-8 bytes in string fields → throws.
  - `secureVersion` reads as `uint32_t` little-endian (regression guard against accidental BE).
  - Magic-word constant is exactly `0xABCD5432` (sentinel test).

- [ ] **Tests** (new `astros_api/src/firmware/firmware_upload_store.test.ts`). Real temp dir per test (`fs.mkdtempSync` in `beforeEach`, `rm -rf` in `afterEach`):
  - `latest()` returns null on cold cache.
  - `store()` happy path: temp file exists, parser succeeds, all three files at expected paths, returned `StoredUpload` has correct `path`, `sha256` (verified by re-hashing), `sizeBytes`, and meta.
  - `store()` consumes the temp file (no orphan in `tmp/` after success).
  - `store()` rejects when `projectName !== 'astros-esp'`; pre-existing prior upload preserved (no wipe-on-fail-validation).
  - `store()` rejects when `version` is unparseable; prior upload preserved.
  - `store()` rejects when binary is shorter than 288 bytes.
  - `store()` replaces a prior upload: pre-populated old triple is gone, new triple present.
  - `store()` rolls back cleanly when persist-phase `writeFile(.sha256)` throws (mock fsp): no `.bin`, no `.sha256`, no `.meta.json` in `<rootDir>/uploads/`.
  - `store()` rolls back cleanly when `rename` throws EACCES: temp file unlinked, uploads dir empty.
  - `latest()` returns null when only some sidecar files exist (interrupted prior write).
  - `latest()` returns null when `.meta.json` is malformed JSON.
  - Crash-recovery invariant: snapshotting `.bin` at each sidecar `writeFile` call shows bin contents are either fresh-bytes or absent — never stale (same pinning pattern c.4 used).
  - Sequential interleaving: A.store() completes, B.store() completes, `latest()` returns B's data; pre-A returns null, between returns A.
  - Filename safety: passing a non-UUID `uploadId` (via test seam) trips `assertPathSafe` synchronously without writing.
  - File-handle hygiene: parse-failure path closes the `fsp.open` handle (verify via spy / explicit close-call assertion).

## Verification

- [ ] `npm run build` clean (lint + tsc).
- [ ] `npm run test` green (existing 347 → ~365 passing; +~18 new tests).
- [ ] `npm run prettier:write` and `npm run lint:fix` clean.
- [ ] Manual smoke deferred to c.8 where the route makes the upload reachable end-to-end.

## Files in scope (6)

1. `astros_api/src/firmware/path_safety.ts` — extracted `PATH_SAFE_RE` + `assertPathSafe` (shared with c.4)
2. `astros_api/src/firmware/firmware_cache.ts` — import from `path_safety.ts` (delete local copies)
3. `astros_api/src/models/firmware/upload.ts` — new `StoredUpload`, `StoredUploadMeta`, `EspAppDesc` types
4. `astros_api/src/firmware/esp_app_desc.ts` — new pure parser
5. `astros_api/src/firmware/esp_app_desc.test.ts` — new parser tests
6. `astros_api/src/firmware/firmware_upload_store.ts` — new store class
7. `astros_api/src/firmware/firmware_upload_store.test.ts` — new store tests

7 files; well under the 10-file cap. **Does not modify** `api_server.ts` — global `fileUpload()` config and route mount land in c.8.

## Out of scope

- HTTP route exposure (`POST /firmware/upload`) — **c.8**.
- `express-fileupload` route-scoped middleware (recommended in Notes; mounted alongside the route) — **c.8**.
- FlashJob orchestrator wiring — **c.6**.
- WebSocket fan-out for "selected upload" UI state — **c.7**.
- Multi-slot upload retention / history — explicit non-goal.
- Re-validation at flash time — orchestrator (c.6) MAY re-parse for paranoia; this plan recommends but doesn't ship.
- Cross-process safety — single-process server.

## Failure modes

### 1. External-call error coverage

| Call | Error / condition | Response |
|------|-------------------|----------|
| `fsp.open(tempPath)` / `read(buf, 0, 288)` | ENOENT (temp file vanished) | propagate; route returns 4xx |
| `fsp.open(tempPath)` | EACCES | propagate; logged at route |
| `createReadStream(tempPath)` | mid-stream error (truncation, EIO) | hash pipeline rejects; persist-phase catch unlinks any partial state and rethrows |
| `fsp.mkdir(<uploads>)` | EACCES | propagate; nothing written |
| `fsp.unlink(<prior>.*)` (wipe pass) | ENOENT | swallow (expected — first-ever upload) |
| `fsp.unlink(<prior>.*)` (wipe pass) | EACCES | swallow + log warn; orphan stays until next successful store wipes it |
| `fsp.rename(tempPath, .bin)` | EXDEV (cross-fs) | propagate; this is a config error (c.8 mounted `tmp/` on a different fs) |
| `fsp.rename(tempPath, .bin)` | EEXIST (Windows, dest exists) | wipe pass should have unlinked; if not, propagate |
| `fsp.writeFile(.sha256)` | ENOSPC | persist-phase catch unlinks `.bin` + temp; rethrow |
| `fsp.writeFile(.meta.json)` | ENOSPC | persist-phase catch unlinks `.bin` + `.sha256` + temp; rethrow |
| `fsp.readdir(<uploads>)` (latest) | ENOENT | return null (cold cache) |
| `fsp.readdir(<uploads>)` (latest) | EACCES | propagate; operator-visible |
| `JSON.parse(metaText)` | SyntaxError | return null (malformed; swept by next successful store) |

**Gotchas applying from c.4 experience:**
- Truncated read on temp file looks like normal close. Mitigation: parser checks length up front (≥288); store also verifies `actualSize > 0` post-stream-hash.
- `JSON.parse('{}')` succeeds but `isValidUploadMeta` requires every field present-and-correct-type, so malformed-meta path triggers cleanly.
- macOS HFS+ case-insensitive: UUIDs are lowercase hex by construction; case collisions N/A.

### 2. Crash-recovery state matrix

`store()` persist phase, after `parseEspAppDesc` and stream-hash succeed:

| After step | tmp | bin | sha | meta | latest() returns | Status |
|------------|-----|-----|-----|------|------------------|--------|
| Before persist | new | (prior or absent) | (prior or absent) | (prior or absent) | prior or null | hit (prior) ✓ |
| Wipe prior `.bin` | new | absent | (prior or absent) | (prior or absent) | null (no bin) | miss ✓ |
| Wipe prior `.sha` | new | absent | absent | (prior or absent) | null | miss ✓ |
| Wipe prior `.meta` | new | absent | absent | absent | null | miss ✓ |
| Rename `tmp` → new `.bin` | absent | new | absent | absent | null (no meta) | miss ✓ |
| writeFile `.sha` | absent | new | new | absent | null (no meta) | miss ✓ |
| writeFile `.meta` | absent | new | new | new | hit, consistent | hit ✓ |

Every row's `latest()` answer is either "null" or "the consistent state at that timestep" — no "stale-bin + new-sidecars" or "new-bin + stale-sidecars" mid-sequence. The wipe order (`.bin` first, then sidecars) ensures a crash mid-wipe leaves at-most "sidecars without bin" which `latest()` rejects via the missing-bin stat.

The pre-fix anti-pattern that c.4 caught: persisting `.sha` and `.meta` before renaming the new `.bin` over the old. That row would read "stale `.bin` + new `.sha` + new `.meta` → hit, bytes ≠ hash → inconsistent ✗" — same bug class.

### 3. Concurrency state

- **Shared resource: `<rootDir>/uploads/`.** Two callers can race wipe-then-rename sequences. **Sync mechanism:** none in-process; `fs.rename` is atomic. **Miss consequence:** last-writer wins on `.meta.json` (the anchor `latest()` keys on). A reader between A's rename and B's rename sees A's complete triple briefly, then B's complete triple — never a chimera, because the wipe-then-rename pair is the smallest atomic transition `latest()` cares about.
- **In-process state:** N/A — `FirmwareUploadStore` carries no mutable in-memory state beyond construction-time `rootDir` + `expectedProjectName`. No `inFlight` map, no LRU.
- The flash-job hard lock from c.0/c.2 makes most of this academic — no concurrent flashes can start while uploads are in flight.

### 4. Cross-platform / cross-environment

- **`fs.rename`:** POSIX overwrites atomically; Windows throws `EEXIST`. Mitigation: wipe pass before rename ensures destination is absent. (c.4's `unlink-before-rename + ENOENT-only catch` not needed because the wipe pass is the load-bearing step — only one slot total.)
- **`fs.rename` cross-filesystem (EXDEV):** `tmp/` and `uploads/` MUST live under the same `<rootDir>`. c.8's route mount points `tempFileDir` at `<rootDir>/tmp/`. Bind-mounts and Docker volumes are easy ways to break this; document in c.8's setup notes.
- **Path separators:** always `path.join`.
- **`appdata-path`:** delegated to c.4's `resolveFirmwareCacheDir`; no new platform branches.
- **Buffer endianness:** ESP-IDF binaries are little-endian. Use `readUInt32LE`; reject if magic word doesn't match in LE form.

### 5. Pre-existing on-disk state

- **Orphan `upload-X.bin` with no sidecars** (prior crash between rename and `writeFile sha`): swept by next successful `store()`'s wipe pass. `latest()` returns null in the meantime.
- **Orphan `upload-X.bin` + `.sha256` with no `.meta.json`** (crash between sha-write and meta-write): same — `latest()` ignores it; next store wipes.
- **Multiple `upload-*.meta.json` files** (corruption / manual intervention): `latest()` picks most-recently-mtime'd, logs warn; next successful store wipes the rest.
- **Malformed `upload-X.meta.json`**: `latest()` returns null; next store wipes.
- **Pre-existing `.bin` whose contents disagree with its `.sha256`**: `latest()` returns it without re-hashing (mirrors c.4 — trust the sidecar). The orchestrator (c.6) re-hashes before flashing; master/padawan re-hash again. A corruption surfaces as `HASH_MISMATCH` downstream.
- **`<rootDir>/uploads/` with wrong permissions:** `readdir` throws non-ENOENT; propagates so operator sees the warning.
- **Leftover `*.tmp` files in `<rootDir>/tmp/`:** not c.5's concern — express-fileupload owns `tmp/`. c.8's route mount is responsible for sweeping orphans on startup.

### 6. Hostile / malformed input

- **`tempPath`:** trusted as a path on disk; never interpolated into a filename. Contents zero-trust (next item).
- **Binary contents:** zero-trust. Defenses:
  - Magic word check (`0xABCD5432`).
  - Project-name match against `expectedProjectName`.
  - Version parses under `compareVersions`.
  - Fixed-length string fields require null terminator within slot (no overrun into adjacent fields).
  - Embedded control chars (`< 0x20`, excluding trailing null) in any string field → reject.
  - Non-UTF-8 bytes in string fields → reject.
- **`originalFilename`:** carried into `meta.json` for operator inspection; **NEVER** interpolated into a filename. May contain any bytes (`../`, control chars, embedded nulls) — harmless because they only ever live inside JSON.
- **`uploadId`:** server-generated `uuid v4`, validated by `assertPathSafe` for defense-in-depth.
- **Parsed `version`:** flows into `meta.json` and the UI's "Selected release" display. **NEVER** interpolated into a path. Parser rejects control chars upstream (double coverage).
- **`FIRMWARE_CACHE_PATH`:** delegated to c.4's helper; no new attack surface.

### 7. Resource lifecycle audit

| Resource | Created | Cleanup happy path | If cleanup doesn't run |
|----------|---------|--------------------|------------------------|
| Temp file at `tempPath` | upstream (express-fileupload, in c.8 route) | `fs.rename` consumes on success | Persist-fail catch runs `fsp.unlink(tempPath)`; long-lived orphans handled by c.8's startup sweep of `<rootDir>/tmp/` |
| 288-byte read buffer | `store()` step 2 | GC after function returns | Harmless |
| `FileHandle` from `fsp.open(tempPath)` | `store()` step 2 | `await fh.close()` in `finally` block (unconditional) | FD leak; bounded by process lifetime |
| `ReadStream` for stream-hash | `store()` step 6 | `stream/promises.pipeline` closes underlying fd on both end and error | If pipeline rejects mid-stream, error path still closes; **must use `pipeline`, not manual `.on('end')` wiring** |
| Hash object (`crypto.createHash`) | `store()` step 6 | GC after `digest()` | Harmless |
| Promoted `.bin` + sidecars | `store()` persist phase | None — these are the durable artifact | N/A |
| Stale prior `.bin` + sidecars | wiped at start of persist phase | `Promise.all` of best-effort unlinks | Persist of NEW triple still succeeds; old siblings of dead uuids may stay until next successful store wipes them |

The most likely real bug: file-handle leak from `fsp.open` if the parse step throws before an explicit `fh.close()`. Mitigation: `try { ... } finally { await fh.close() }` around the read.

## Notes for the reviewer

- **express-fileupload integration: route-scoped, not global** (decision deferred to c.8 but documented here). Recommend `fileUpload({ useTempFiles: true, tempFileDir: <rootDir>/tmp, limits: { fileSize: 8 * 1024 * 1024 } })` applied only to `POST /firmware/upload`. Justification: smaller blast radius vs. changing global config; different size limit appropriate (firmware ~1.2 MB cap at 8 MB; audio uses defaults); colocated debugging context for EXDEV issues; c.8 also needs to ensure `<rootDir>/tmp/` exists at boot and sweep stale `*.tmp` orphans on startup. **c.5 itself doesn't touch `api_server.ts`.**

- **`expectedProjectName = 'astros-esp'`** resolves decomp Open Item #4. The c.3 asset-name regex (`^astros-esp-…-app\.bin$`) already encodes this prefix. **Verification step:** confirm against `AstrOs.ESP/platformio.ini` or `sdkconfig*` for `CONFIG_APP_PROJECT_NAME`. If verification can't happen before merge, the constant ships with `astros-esp` and a TODO; c.6's PTY-stub end-to-end test will catch a real mismatch.

- **`esp_app_desc_t` field offsets** taken from ESP-IDF's stable layout (post-v4.0). **Verification step:** read `AstrOs.ESP/components/.../esp_app_format.h` (or the ESP-IDF vendor copy) to confirm. The struct has been stable for ~5 years; if a future release rearranges, the parser's constants are the single point of change.

- **Hash on store but not on `latest()`:** symmetric to c.4. The sidecar is the source of truth; re-hashing 1.2 MB on every read costs ~80–100 ms for no semantic gain. The orchestrator and master both re-hash downstream as part of the protocol — corruption between store-time and flash-time surfaces as `HASH_MISMATCH`, not a silent flash of corrupted bytes.

- **Sharing `assertPathSafe` with c.4:** extracting to `path_safety.ts` is the cleanest move now that c.5 is the second consumer. c.4's tests stay green (behavior unchanged); the diff is one new file + one import update.

- **Reading only 288 bytes** instead of the full 1.2 MB: `fsp.open` + `read(buf, 0, 288, 0)` keeps memory flat during parse. The stream-hash phase handles the rest of the file; we never need the whole binary resident. Worth calling out in the PR description — it's a meaningful perf detail invisible from outside the module.

- **Why no `tag` in `StoredUploadMeta`:** uploads aren't releases — there's no GitHub tag, no `published_at`. The orchestrator (c.6) bridges `StoredUpload` and `CachedAsset` into a common "flash source" concept; that's where the shape divergence gets papered over.

## Critical files for implementation

- `astros_api/src/firmware/firmware_cache.ts` — pattern to mirror (path-safety, atomic-rename ordering, sidecar wipe-before-promote, persist-phase rollback, `isValidMeta` shape).
- `astros_api/src/firmware/firmware_cache.test.ts` — test patterns (temp dir per test, mock-throwing-fs spy patterns, crash-recovery snapshot pinning).
- `astros_api/src/utility/semver.ts` — version validation (`compareVersions(v, v) === 0` is the validity gate).
- `astros_api/src/controllers/file_controller.ts` — express-fileupload precedent for the c.8 route (UUID-based filename pattern; c.5 won't use `mv` but shows the multipart shape).
- `.docs/plans/20260501-0725-firmware-ota-c-4-on-disk-cache.md` — plan-shape and FMI-fill-in style to mirror.
- `.docs/templates/failure-mode-inventory.md` — the template this plan's `## Failure modes` section is filling out.
