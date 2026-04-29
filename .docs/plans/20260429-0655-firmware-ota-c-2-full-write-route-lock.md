# c.2 — Apply requireUnlocked to full write-route set

Light plan for the next server-orchestrator PR. Builds on c0's `JobLock` + `requireUnlocked` middleware (PR #65) and finishes the lock story so a future flash job (c.6) actually goes read-only across the API while it runs.

**Branch:** `feature/firmware-ota-c-2-full-write-route-lock` (off `develop`).
**PR target base:** `develop`.
**References:** [decomposition plan](./20260427-2202-firmware-ota-decomposition.md) § "Hard-lock spec", [c0 plan](./20260428-0725-firmware-ota-c0-job-lock.md).

## Context

c0 introduced `requireUnlocked` and applied it to `POST /api/panicStop` as a smoke test. c.2 applies the same middleware to the rest of the write-class routes per the decomposition's "What it guards" list, plus rejects the one currently-implemented inbound WebSocket write-class message (`SERVO_TEST`) when the lock is held.

The principle: while a flash job is running, no other code path mutates the script/playlist/controller domain or fires hardware. c.2 puts the guard everywhere it's specified to live; c.3+ then naturally inherit lock-awareness for any new routes added in the same families.

No flash-job state machine, no firmware code — pure infrastructure on top of c0.

## Tasks

- [ ] **Threading lockMiddleware into controllers.** Add `lockMiddleware: RequestHandler` parameter to `registerScriptRoutes` / `registerPlaylistRoutes` / `registerLocationRoutes`. Apply to the write-class routes inside each (`PUT`, `DELETE`, `POST copy` for scripts/playlists; `PUT` for locations). Read routes stay unchanged.
- [ ] **Inline routes in `api_server.ts`.** Build the middleware once at route-setup time (`requireUnlocked(this.jobLock)`) and apply to: `GET /locations/syncconfig`, `GET /locations/synccontrollers`, `GET /scripts/upload`, `GET /scripts/run`, `GET /playlists/run`, `POST /settings/formatSD`, `POST /directcommand`, `POST /panicClear`. (Existing `POST /panicStop` already locked in c0; verify no double-application.)
- [ ] **WebSocket inbound rejection.** Add `flashJobActive` to `TransmissionType` and a typed `FlashJobActiveResponse` model + `buildFlashJobActiveResponse` factory in `lock_responses.ts`. In `handleWebsocketMessage`, when an inbound write-class message (initially: `SERVO_TEST`) arrives while the lock is held, send the originating client a `lockStateChanged` echo + a `flashJobActive` error frame and skip the normal dispatch. Don't broadcast to other clients — the rejection is per-connection.
- [ ] **Integration tests.** New `astros_api/src/job_lock_routes.integration.test.ts` covering representative routes from each category (one per controller + several inline routes from `api_server.ts` + the WS inbound case). Mounts a real Express app + WS server with the same middleware wiring and verifies the rejection behavior end-to-end.

## Verification

- [ ] `npm run build` clean (lint + tsc).
- [ ] `npm run test` green (existing 302 + new c.2 tests).
- [ ] `npm run prettier:write` and `npm run lint:fix` clean.
- [ ] Spot-check that every route in the decomposition's "What it guards" list has the middleware applied (or is N/A like `POST /firmware/jobs` which doesn't exist yet).

## Files in scope (7)

1. `astros_api/src/controllers/scripts_controller.ts` — register-fn signature + middleware on PUT/DELETE/POST copy
2. `astros_api/src/controllers/playlist_controller.ts` — same
3. `astros_api/src/controllers/locations_controller.ts` — same, applied to PUT
4. `astros_api/src/api_server.ts` — build middleware once, pass to register-fn calls, apply inline; add WS inbound rejection
5. `astros_api/src/models/enums.ts` — append `flashJobActive` to `TransmissionType`
6. `astros_api/src/models/networking/lock_responses.ts` — new `FlashJobActiveResponse` interface + `buildFlashJobActiveResponse` factory
7. `astros_api/src/job_lock_routes.integration.test.ts` — new HTTP + WS integration tests

## Out of scope

- Vue handling of `flashJobActive` (UI banner / toast on rejected actions) — deferred to **d.7**.
- Settings / remoteConfig / audio routes — not in the decomposition's hard-lock list. Pure DB writes that don't fan out to ESPs are intentionally allowed during a flash.
- `POST /firmware/jobs` — doesn't exist yet; **c.8** will add it with `requireUnlocked` already applied.
- Any flash-job state machine, GitHub fetching, file upload, or new serial-protocol additions.

## Notes for the reviewer

- The `lockMiddleware` parameter is a `RequestHandler`, not a `JobLock` instance. Keeps controllers free of `JobLock`-domain knowledge — they just receive a middleware function and apply it.
- WS inbound write-class set is currently `['SERVO_TEST']`. Document a clear extension point (e.g. an exported `WS_WRITE_CLASS_MESSAGE_TYPES` set) so future write-class WS msgTypes inherit the rejection automatically.
- Per the decomposition, `requireUnlocked` sits **after** `authHandler` so unauthenticated requests still get 401 (not 423).
- `panicStop` was c0's smoke-test route; verify it still works (i.e. that we didn't accidentally apply the middleware twice).
