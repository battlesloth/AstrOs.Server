# c.2 — Apply lock guard to full write-route set

Light plan for the next server-orchestrator PR. Builds on c0's `JobLock` (PR #65) and finishes the lock story so a future flash job (c.6) actually goes read-only across the API while it runs.

**Branch:** `feature/firmware-ota-c-2-full-write-route-lock` (off `develop`).
**PR target base:** `develop`.
**References:** [decomposition plan](./20260427-2202-firmware-ota-decomposition.md) § "Hard-lock spec", [c0 plan](./20260428-0725-firmware-ota-c0-job-lock.md).

## Context

c0 introduced `JobLock` and a per-route `requireUnlocked` middleware applied to `POST /api/panicStop` as a smoke test. c.2 finishes the lock story but **extends the existing `writeGuard`** rather than threading per-route middleware through every controller — `writeGuard` already centralizes the "is this a write?" decision (the `BLOCKED_WRITE_METHODS` + `BLOCKED_GET_PATHS` lists) and is mounted globally on `/api`. Bolting a JobLock check onto the same gate is one diff that covers every existing and future write route at once, instead of nine diffs that drift if anyone forgets one.

WebSocket inbound write-class messages don't pass through Express middleware, so they get a small parallel helper (`rejectIfLocked`) that reuses the same `JobLock`.

The principle: while a flash job is running, no other code path mutates state or fires hardware. `writeGuard` enforces it for HTTP; `rejectIfLocked` enforces it for WS. `requireUnlocked` from c0 is removed — the unified gate supersedes it.

No flash-job state machine, no firmware code — pure infrastructure on top of c0.

## Tasks

- [ ] **Extend `writeGuard`.** Add `JobLock` parameter alongside `SystemStatus`. Reuse the existing `BLOCKED_WRITE_METHODS` + `BLOCKED_GET_PATHS` definition. Add an `ALLOWED_DURING_FLASH` allowlist (login + reauth only — panic is NOT allowed during flash because emitting `PANIC_STOP` mid-flash would corrupt the FW chunk stream on the serial line). Read-only check fires first (503), then flash-active check (423 + `LockedErrorResponse` body). Both gates use the same `isAllowed` helper against their respective allowlists.
- [ ] **WebSocket inbound rejection.** Add `flashJobActive` to `TransmissionType` and a typed `FlashJobActiveResponse` model + `buildFlashJobActiveResponse` factory + `WS_WRITE_CLASS_MESSAGE_TYPES` set in `lock_responses.ts`. Replace `requireUnlocked` in `job_lock_middleware.ts` with a `rejectIfLocked` helper that, when an inbound write-class message arrives while locked, sends the originating client a `lockStateChanged` echo + `flashJobActive` frame and signals the caller to skip dispatch.
- [ ] **`api_server.ts` wire-up.** Pass `this.jobLock` to the `writeGuard` mount call. Drop the inline `requireUnlocked` from `/panicStop` (writeGuard now handles it). Drop the `requireUnlocked` import. Thread `conn` into `handleWebsocketMessage` and call `rejectIfLocked` before the dispatch switch.
- [ ] **Test surgery.** Add a `when a flash job is active` describe block to `write_guard.test.ts` covering: 423 + body shape on POST/PUT/PATCH/DELETE, 423 on the five serial-write GETs, login/reauth allowlisted, panic blocked (stricter than read-only), reads pass through. Replace the requireUnlocked-flavored content of `job_lock_middleware.test.ts` with `rejectIfLocked` tests. Trim the (now-orphaned) requireUnlocked HTTP describe block from `job_lock.integration.test.ts`; keep the WS connect-handshake block.

## Verification

- [ ] `npm run build` clean (lint + tsc).
- [ ] `npm run test` green (existing + new).
- [ ] `npm run prettier:write` and `npm run lint:fix` clean.
- [ ] Spot-check that every route in the decomposition's "What it guards" list is covered by `writeGuard`'s `BLOCKED_WRITE_METHODS` + `BLOCKED_GET_PATHS` (the lists already exist and match the spec).

## Files in scope (8)

1. `astros_api/src/write_guard.ts` — `JobLock` parameter; `ALLOWED_DURING_FLASH` allowlist; 423 branch
2. `astros_api/src/write_guard.test.ts` — `when a flash job is active` describe block (6 new tests)
3. `astros_api/src/models/enums.ts` — append `flashJobActive` to `TransmissionType`
4. `astros_api/src/models/networking/lock_responses.ts` — `FlashJobActiveResponse` interface + `buildFlashJobActiveResponse` factory + `WS_WRITE_CLASS_MESSAGE_TYPES` set
5. `astros_api/src/job_lock_middleware.ts` — replace `requireUnlocked` with `rejectIfLocked` (HTTP gating moved to `writeGuard`)
6. `astros_api/src/job_lock_middleware.test.ts` — replace requireUnlocked tests with rejectIfLocked tests (3 tests)
7. `astros_api/src/job_lock.integration.test.ts` — drop requireUnlocked HTTP describe block; keep WS connect-handshake block
8. `astros_api/src/api_server.ts` — pass jobLock to writeGuard mount; drop inline requireUnlocked + import; thread conn into handleWebsocketMessage; call rejectIfLocked

## Out of scope

- Vue handling of `flashJobActive` / disabling write controls when locked — deferred to **d.7**.
- `POST /firmware/jobs` — doesn't exist yet; **c.8** will add it (will inherit lock automatically via `writeGuard`).
- Any flash-job state machine, GitHub fetching, file upload, or new serial-protocol additions.

## Notes for the reviewer

- `writeGuard`'s broader interpretation locks every write-class HTTP route — including settings/audio/remoteConfig writes that the decomposition's enumerated list didn't explicitly mention. This is intentional: the decomposition's principle ("no other write-class operation hits during a flash") is broader than its enumerated list, and `writeGuard` was already the right home for that principle.
- Two distinct allowlists per gate: `ALLOWED_IN_READONLY` (login, reauth, panic stop, panic clear) and `ALLOWED_DURING_FLASH` (login, reauth only). The asymmetry is documented in `write_guard.ts` — flash is stricter because PANIC_STOP would interleave with FW_CHUNK frames on the serial line.
- `requireUnlocked` is removed entirely. The c0 PR's version was the wrong abstraction; `writeGuard` was always the right home.
- WS inbound write-class set is currently `['SERVO_TEST']` in `WS_WRITE_CLASS_MESSAGE_TYPES`. Future write-class WS msgTypes get added to that set and inherit rejection automatically.

## Why this approach (vs. per-route `requireUnlocked`)

The earlier draft of c.2 threaded a `lockMiddleware: RequestHandler` parameter through `register*Routes` for scripts/playlists/locations and applied `requireUnlocked` inline at every write-class route in `api_server.ts`. That worked but duplicated `writeGuard`'s "is this a write?" definition (`BLOCKED_WRITE_METHODS` + `BLOCKED_GET_PATHS`) — two parallel lanes guarding the same concept, each with its own allowlist. PR review caught it quickly. Extending `writeGuard` is the correct architectural answer: single source of truth for write-class detection, single mount point, every existing and future write route inherits the new gate without further plumbing.
