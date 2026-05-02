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

- [x] **Extract `assertPathSafe` to a shared module** (new `astros_api/src/firmware/path_safety.ts`). Move `PATH_SAFE_RE` + `assertPathSafe` out of `firmware_cache.ts`; update `firmware_cache.ts` to import. Both helpers remain module-scope; c.4 behavior unchanged. This is the cleanest moment to extract — c.5 is the second consumer.

- [x] **Typed models** (new `astros_api/src/models/firmware/upload.ts`):
  - `EspAppDesc` — `{ magicWord: number, secureVersion: number, version: string, projectName: string, time: string, date: string, idfVer: string, appElfSha256: Buffer }`. Returned by the parser.
  - `StoredUploadMeta` — `{ uploadId: string, originalFilename: string, projectName: string, version: string, uploadedAt: string, sizeBytes: number }`. Persisted as `upload-<uuid>.meta.json`.
  - `StoredUpload` — `{ path: string, sha256: string, sizeBytes: number, meta: StoredUploadMeta }`. Returned by `store()` and `latest()`. Mirrors c.4's `CachedAsset`.

- [x] **`esp_app_desc_t` parser** (new `astros_api/src/firmware/esp_app_desc.ts`). Pure-compute, no fs/network. Single export `parseEspAppDesc(buf: Buffer): EspAppDesc`. Throws on any structural failure. Constants:
  - `ESP_IMAGE_HEADER_SIZE = 24`, `ESP_IMAGE_SEGMENT_HEADER_SIZE = 8`, `ESP_APP_DESC_OFFSET = 32`, `ESP_APP_DESC_SIZE = 256`, `ESP_APP_DESC_MAGIC = 0xABCD5432`.
  - Field offsets within `esp_app_desc_t`: `magic_word=0`, `secure_version=4`, `reserv1=8..16`, `version=16` (32 B), `project_name=48` (32 B), `time=80` (16 B), `date=96` (16 B), `idf_ver=112` (32 B), `app_elf_sha256=144` (32 B).
  - Helper `readFixedString(buf, off, len)` slices `len` bytes, finds first `0x00`, throws if no null terminator within slot, decodes prefix as UTF-8, rejects any embedded single-byte ASCII control char — C0 range `[0x01, 0x1F]` plus DEL `0x7F` — so a tampered `version` field with `\x00\x01` etc. fails fast. The C1 range `[0x80, 0x9F]` is intentionally NOT rejected at the byte level: those bytes appear naturally inside valid UTF-8 continuation sequences (`é` → `0xC3 0xA9`); the strict-UTF-8 decoder catches *invalid* sequences containing those bytes.
  - Magic word read with `readUInt32LE`. Reject when `!== ESP_APP_DESC_MAGIC`.
  - Up-front length check: throw if `buf.length < 288`. Caller only ever reads the first 288 bytes.

- [x] **`FirmwareUploadStore` class** (new `astros_api/src/firmware/firmware_upload_store.ts`):
  - Constructor: `new FirmwareUploadStore(opts?: { rootDir?: string, expectedProjectName?: string })`. `expectedProjectName` defaults to `'AstrOs.ESP'` — verified against the CMake `project()` call in the firmware repo and against a real `firmware.bin` during c.5 implementation; resolves decomp Open Item #4 (see Notes for the reviewer for the full finding).
  - **`store(tempPath: string, originalFilename: string): Promise<StoredUpload>`**:
    1. Generate `uploadId = uuid_v4()`. `assertPathSafe(uploadId, 'uploadId')` for defense-in-depth against future regressions where the uuid generator changes.
    2. `fsp.open(tempPath)` → `read(buf, 0, 288, 0)` into a 288-byte Buffer; close handle in a `finally` block (no fd leak on parse failure).
    3. Call `parseEspAppDesc` on those bytes. Any throw propagates.
    4. Verify `desc.projectName === expectedProjectName`; reject otherwise with the actual value in the error message.
    5. Verify `desc.version` parses under `compareVersions(v, v) === 0` (existing helper at `astros_api/src/utility/semver.ts`). Strict 3-component prefix means `1.2.0-rc.1+build.123` parses but `1.2` and `latest` don't.
    6. Stream-hash the **whole** temp file via `for await (const chunk of fs.createReadStream(tempPath))`, feeding each chunk into a `crypto.createHash('sha256')` and summing chunk lengths into `sizeBytes`. The for-await loop handles backpressure and auto-closes the underlying fd on both clean exit and mid-loop error. Using `stream/promises.pipeline` would require a Writable destination we don't need (the bytes already live at `tempPath`); the for-await form keeps the read-and-discard intent explicit and avoids a no-op sink.
    7. **Atomic promote** with c.4's persist-phase ordering:
       - `fsp.mkdir(<rootDir>/uploads/, { recursive: true })`
       - **Wipe any prior `upload-*.bin`, `upload-*.bin.sha256`, `upload-*.meta.json`** in `<rootDir>/uploads/` (best-effort unlinks; `readdir` + filter + `Promise.all` of unlinks).
       - `fsp.rename(tempPath, <rootDir>/uploads/upload-<uuid>.bin)`.
       - `writeFile(.bin.sha256, sha)`
       - `writeFile(.meta.json, JSON.stringify(meta, null, 2))`
    8. On any failure in steps 6–7: `Promise.all` of best-effort `unlink` against the temp file, the just-promoted `.bin`, and both sidecars (mirrors c.4's symmetric persist-phase rollback). Rethrow.
    9. Return `StoredUpload`.
  - **`latest(): Promise<StoredUpload | null>`** — `readdir(<rootDir>/uploads)`, filter for files matching `^upload-([0-9a-f-]{36})\.meta\.json$`. If multiple matches (corruption/manual intervention), pick the most-recently-mtime'd one and log a warn. Read all three files for that uuid; return null if any are missing or malformed. Cross-check the triple is internally consistent: `parsed.uploadId === uploadId-from-filename` (corruption / sidecar copy-from-another-upload would mislead the orchestrator about which upload is being flashed) and `parsed.sizeBytes === binStat.size` (cheap proxy for "the bin we have is the one meta describes" — catches partial-write recovery and external truncation; sha re-hashing would be stronger but costs ~80–100 ms per call). Mismatches map to a null miss.
  - **Filename safety:** `pathsFor(rootDir, uploadId)` runs `assertPathSafe(uploadId, 'uploadId')`. UUID v4 is `[0-9a-f-]+` so always passes; the assertion guards future refactors.
  - **Concurrency:** no in-process mutex. Two concurrent uploads tolerated by last-writer-wins on the wipe-then-rename sequence; `.meta.json` is the durability anchor. The flash-job hard lock from c.0/c.2 ensures uploads never overlap with a flash, so the only race is two browser tabs uploading back-to-back. Per-store atomic rename is the entire concurrency model.

- [x] **Tests** (new `astros_api/src/firmware/esp_app_desc.test.ts`). Pure parser tests with constructed fixtures:
  - Helper `makeAppDescBuffer({ projectName, version, ... })` builds a 288-byte Buffer: 32 zero bytes for image+segment header stub, magic word at offset 32, fixed-length string slots populated with `Buffer.from(name, 'utf8').copy(target, 0); target[name.length] = 0`. Rest zero-filled.
  - Valid binary parses; `projectName === 'astros-esp'`, `version === '1.4.0'`.
  - Wrong magic word → throws.
  - Buffer shorter than 288 bytes → throws.
  - `project_name` field with no null terminator within its 32-byte slot → throws.
  - `version` field with embedded null mid-string truncates at the null (yields `'1.4'` for `1.4\x00.0`).
  - String field with control chars `\x01..\x1F` after the null → throws.
  - String field with DEL (`\x7F`) → throws (single-byte ASCII control char outside the C0 range).
  - String field with legitimate multi-byte UTF-8 (e.g. `release-é-v5`, where `é` is `0xC3 0xA9` and the trailing byte sits in the C1 range `0x80-0x9F`) → parses cleanly. Regression guard against over-broad byte-level rejection of C1 bytes.
  - Non-UTF-8 bytes in string fields → throws.
  - `secureVersion` reads as `uint32_t` little-endian (regression guard against accidental BE).
  - Magic-word constant is exactly `0xABCD5432` (sentinel test).

- [x] **Tests** (new `astros_api/src/firmware/firmware_upload_store.test.ts`). Real temp dir per test (`fs.mkdtempSync` in `beforeEach`, `rm -rf` in `afterEach`):
  - `latest()` returns null on cold cache.
  - `store()` happy path: temp file exists, parser succeeds, all three files at expected paths, returned `StoredUpload` has correct `path`, `sha256` (verified by re-hashing), `sizeBytes`, and meta.
  - `store()` consumes the temp file (no orphan in `tmp/` after success).
  - `store()` rejects when `projectName !== 'AstrOs.ESP'` (the embedded value from the firmware repo's CMake `project()` call); pre-existing prior upload preserved (no wipe-on-fail-validation).
  - `store()` rejects when `version` is unparseable; prior upload preserved.
  - `store()` rejects when binary is shorter than 288 bytes.
  - `store()` replaces a prior upload: pre-populated old triple is gone, new triple present.
  - `store()` rolls back cleanly when persist-phase `writeFile(.sha256)` throws (mock fsp): no `.bin`, no `.sha256`, no `.meta.json` in `<rootDir>/uploads/`.
  - `store()` rolls back cleanly when `rename` throws EACCES: temp file unlinked, uploads dir empty.
  - `latest()` returns null when only some sidecar files exist (interrupted prior write).
  - `latest()` returns null when `.meta.json` is malformed JSON.
  - `latest()` returns null when `.meta.json` `uploadId` disagrees with the filename uuid (sidecar copied/renamed from another upload).
  - `latest()` returns null when `.meta.json` `sizeBytes` disagrees with the bin's actual size on disk (partial-write recovery / external truncation).
  - Crash-recovery invariant: snapshotting `.bin` at each sidecar `writeFile` call shows bin contents are either fresh-bytes or absent — never stale (same pinning pattern c.4 used).
  - Sequential interleaving: A.store() completes, B.store() completes, `latest()` returns B's data; pre-A returns null, between returns A.
  - Filename safety: passing a non-UUID `uploadId` (via test seam) trips `assertPathSafe` synchronously without writing.
  - File-handle hygiene: parse-failure path closes the `fsp.open` handle (verify via spy / explicit close-call assertion).

## Verification

- [x] `npm run build` clean (lint + tsc).
- [x] `npm run test` green (380 → 416 passing; +36 new tests = 11 parser + 25 store, including 7 added in fixup for embedded-version normalization).
- [x] **Live verification against real binary:** `firmware_upload_store` accepts the actual `AstrOs.ESP/.pio/build/lolin_d32_pro/firmware.bin` produced by ESP-IDF, captures `projectName: "AstrOs.ESP"` and normalizes `version: "v1.0.0-RC.1-71-g9a55936-dirty"` → `"1.0.0-RC.1"`.
- [x] `npm run prettier:write` and `npm run lint:fix` clean.
- [ ] Manual smoke deferred to c.8 where the route makes the upload reachable end-to-end.

## Files in scope (7)

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
| `fsp.open(tempPath)` / `read(buf, 0, 288)` | ENOENT (temp file vanished) | rollback runs `fsp.unlink(tempPath)` which itself ENOENTs (swallowed); rethrow to caller |
| `fsp.open(tempPath)` | EACCES | rollback unlinks tempPath (best-effort; if perms also block unlink, the inner `.catch` swallows it); rethrow |
| `parseEspAppDesc` | bad magic / no null terminator / control char / non-UTF-8 | rollback unlinks tempPath; rethrow |
| `createReadStream(tempPath)` | mid-stream error (truncation, EIO) | rollback unlinks `tempPath` + any partial new triple; rethrow |
| `fsp.mkdir(<uploads>)` | EACCES | rollback unlinks `tempPath`; rethrow (operator sees the error, route gets a clean failure) |
| `fsp.unlink(<prior>.*)` (wipe pass) | ENOENT | swallow (expected — first-ever upload) |
| `fsp.unlink(<prior>.*)` (wipe pass) | EACCES | swallow + log warn; orphan stays until next successful store wipes it |
| `fsp.rename(tempPath, .bin)` | EXDEV (cross-fs) | rollback unlinks `tempPath`; rethrow (config error — c.8 mounted `tmp/` on a different fs) |
| `fsp.rename(tempPath, .bin)` | EEXIST (Windows, dest exists) | wipe pass should have unlinked; if not, rollback handles |
| `fsp.writeFile(.sha256)` | ENOSPC | rollback unlinks `tempPath` + `.bin` (just-renamed); rethrow |
| `fsp.writeFile(.meta.json)` | ENOSPC | rollback unlinks `tempPath` + `.bin` + `.sha256`; rethrow |
| `fsp.readdir(<uploads>)` (latest) | ENOENT | return null (cold cache) |
| `fsp.readdir(<uploads>)` (latest) | EACCES | propagate; operator-visible |
| `JSON.parse(metaText)` | SyntaxError | return null (malformed; swept by next successful store) |
| `latest()` cross-check | `parsed.uploadId !== uploadId-from-filename` | return null — sidecar mis-copy / corruption; the next successful `store()` will wipe the inconsistent triple |
| `latest()` cross-check | `parsed.sizeBytes !== binStat.size` | return null — meta stale relative to bin (truncate / partial-write); next successful `store()` clears it |

**Gotchas applying from c.4 experience:**
- Truncated read on temp file looks like normal close. Mitigation: the parse step's `fh.read(buf, 0, 288, 0)` rejects any file that doesn't deliver the full 288-byte header, which is the load-bearing check for the most common truncation source (incomplete upload). A subsequent parse-time-vs-hash-time race (file truncated between the two reads) is not separately guarded — caught only if it shrinks below the 288-byte parse floor before the stream-hash opens its own handle, which would also fail the parse on a retry.
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
| Temp file at `tempPath` | upstream (express-fileupload, in c.8 route) | `fs.rename` consumes on success; the unconditional rollback `fsp.unlink`s on every failure path (open, read, parse, validation, hash, mkdir, wipe, rename, writeFile) | Long-lived orphans only happen if the rollback's unlink itself also fails (e.g., permissions changed mid-call) — handled as a defense-in-depth backstop by c.8's startup sweep of `<rootDir>/tmp/` |
| 288-byte read buffer | `store()` step 2 | GC after function returns | Harmless |
| `FileHandle` from `fsp.open(tempPath)` | `store()` step 2 | `await fh.close()` in `finally` block (unconditional) | FD leak; bounded by process lifetime |
| `ReadStream` for stream-hash | `store()` step 6 | for-await loop auto-closes the underlying fd on both end and error | Mid-stream errors trigger the post-parse catch which unlinks `tempPath` + any partial triple |
| Hash object (`crypto.createHash`) | `store()` step 6 | GC after `digest()` | Harmless |
| Promoted `.bin` + sidecars | `store()` persist phase | None — these are the durable artifact | N/A |
| Stale prior `.bin` + sidecars | wiped at start of persist phase | `Promise.all` of best-effort unlinks | Persist of NEW triple still succeeds; old siblings of dead uuids may stay until next successful store wipes them |

The most likely real bug: file-handle leak from `fsp.open` if the parse step throws before an explicit `fh.close()`. Mitigation: `try { ... } finally { await fh.close() }` around the read.

## Notes for the reviewer

- **express-fileupload integration: route-scoped, not global** (decision deferred to c.8 but documented here). Recommend `fileUpload({ useTempFiles: true, tempFileDir: <rootDir>/tmp, limits: { fileSize: 8 * 1024 * 1024 } })` applied only to `POST /firmware/upload`. Justification: smaller blast radius vs. changing global config; different size limit appropriate (firmware ~1.2 MB cap at 8 MB; audio uses defaults); colocated debugging context for EXDEV issues; c.8 also needs to ensure `<rootDir>/tmp/` exists at boot and sweep stale `*.tmp` orphans on startup. **c.5 itself doesn't touch `api_server.ts`.**

- **`expectedProjectName = 'AstrOs.ESP'`** — verified against `AstrOs.ESP/CMakeLists.txt:4` (`project(AstrOs.ESP)`) and against a real built `firmware.bin` parsed by `parseEspAppDesc` during implementation. **Important finding:** the asset-filename prefix `astros-esp-…-app.bin` (set by CI tooling) is NOT the same as the embedded `esp_app_desc_t.project_name` (set by CMake). This was not what decomp Open Item #4 expected — the planning-time guess was `astros-esp`, but ESP-IDF embeds the CMake project name verbatim, dot and capitalization included. The constant lives at `firmware_upload_store.ts:DEFAULT_PROJECT_NAME` for easy adjustment if the firmware repo ever renames its CMake project.

- **`esp_app_desc_t.version` is `git describe --tags --dirty` output, not clean semver.** Real example from a dev build: `"v1.0.0-RC.1-71-g9a55936-dirty"`. ESP-IDF defaults to `git describe` when neither `CONFIG_APP_PROJECT_VER_FROM_CONFIG` nor a `version.txt` is set, and AstrOs.ESP has neither today. The store therefore runs `normalizeEspVersion()` before validation: strips a leading `v` and the trailing `-<N>-g<sha>(-dirty)?` suffix, then validates the result against `compareVersions`. The persisted `meta.version` is the normalized clean semver — c.6's orchestrator can compare it directly against GitHub-release filenames without per-source casing. Six dedicated tests cover the normalization paths.

- **`esp_app_desc_t` field offsets** verified by parsing the real `firmware.bin` (offset 32, magic 0xABCD5432, all string fields decoded correctly). The struct has been stable since ESP-IDF v4.0; if a future release rearranges, the parser's `F_*` constants are the single point of change.

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
