# c0 — JobLock + lockStateChanged

Light plan for the Platform-prerequisites PR of the firmware-OTA decomposition. Reference: [`20260427-2202-firmware-ota-decomposition.md`](./20260427-2202-firmware-ota-decomposition.md).

**Branch:** `feature/firmware-ota-c0-job-lock` (off `develop`).
**PR target base:** `develop`.

## Context

The firmware-OTA orchestrator needs a server-wide write lock so an in-progress flash job can guarantee no other write-class operation (script edits, deploys, runs, controller config changes, format-SD, servo-test, etc.) hits the hardware mid-flash. This PR introduces the lock primitive and its transport to UIs:

- A `JobLock` singleton with `acquire / release / isLocked / getOwner / subscribe`.
- A `requireUnlocked` Express middleware factory that returns HTTP 423 + JSON body when the lock is held.
- A new `lockStateChanged` `TransmissionType` (server) + matching `WebsocketMessageType` entry (Vue) so connected clients reflect lock state in real time.
- A small `jobLock` Pinia store on the Vue side, populated from the WS event.

Apply the middleware to **one** route in this PR (`POST /api/panicStop`) as a smoke-test integration point. Applying it to the full write-route set is **c.2**, the next sub-project's first PR.

No flash-job code lands in this PR — the lock primitive ships standalone and is independently testable. Other future write-blocking operations (e.g., long-running migrations) can reuse it without changes.

## Tasks

- [ ] Add `JobLock` singleton (`astros_api/src/job_lock.ts`) with subscribe/notify, plus unit tests covering acquire / release / double-acquire-rejected / subscribe-fan-out / unsubscribe.
- [ ] Add `requireUnlocked` middleware factory (`astros_api/src/job_lock_middleware.ts`) that returns 423 + JSON `{ error: 'flashJobActive', lockOwner, since }` when locked. Tests cover unlocked-passes / locked-blocks / response shape.
- [ ] Append `lockStateChanged` to `TransmissionType` in `astros_api/src/models/enums.ts` (next free numeric value = 10). Append matching `LOCK_STATE_CHANGED = 10` to Vue's `WebsocketMessageType` (`astros_vue/src/enums/WebsocketMessageType.ts`). Verify by inspection that all existing entries keep their current numeric values.
- [ ] Wire `JobLock.subscribe(state => updateClients({ type: TransmissionType.lockStateChanged, data: state }))` in `api_server.ts`. Apply `requireUnlocked` middleware to `POST /api/panicStop` as the smoke-test endpoint. Wire-up + assertion that the WS broadcast fires on acquire/release.
- [ ] Vue side: new composition-style `astros_vue/src/stores/jobLock.ts` tracking `{ locked, owner, since }`. Add `handleLockStateChanged` to `useWebsocket.ts` switch. Tests for the store.

## Verification

- [ ] `npm run build` clean (lint + tsc) in `astros_api/`.
- [ ] `npm run test` green for new and existing test suites in `astros_api/`.
- [ ] `npm run build` + `npm run test:unit` clean in `astros_vue/`.
- [ ] Manual smoke: start server with the test harness, acquire lock, `POST /api/panicStop` → expect HTTP 423 with the documented body; release the lock → expect normal behavior. Watch `lockStateChanged` events in browser devtools as the lock toggles.
- [ ] Run `npm run prettier:write` and `npm run lint:fix` in both `astros_api/` and `astros_vue/` before committing.

## Files in scope (12)

1. `astros_api/src/job_lock.ts` — new singleton
2. `astros_api/src/job_lock.test.ts` — new tests
3. `astros_api/src/job_lock_middleware.ts` — new middleware factory
4. `astros_api/src/job_lock_middleware.test.ts` — new tests
5. `astros_api/src/job_lock.integration.test.ts` — HTTP-level integration test (real Express + real fetch) covering the requireUnlocked + handler chain end-to-end
6. `astros_api/src/models/networking/lock_responses.ts` — new typed `LockState` + `LockStateResponse` (WS broadcast) + `LockedErrorResponse` (HTTP 423 body)
7. `astros_api/src/models/enums.ts` — append `lockStateChanged`
8. `astros_api/src/api_server.ts` — wire JobLock → updateClients; apply middleware to `/api/panicStop`
9. `astros_vue/src/enums/WebsocketMessageType.ts` — append `LOCK_STATE_CHANGED = 10`
10. `astros_vue/src/stores/jobLock.ts` — new composition-style store
11. `astros_vue/src/stores/__tests__/jobLock.spec.ts` — new tests (`.spec.ts` matches the existing `systemStatus.spec.ts` convention)
12. `astros_vue/src/composables/useWebsocket.ts` — add `handleLockStateChanged`

12 files — two over the soft cap. Justified by:

1. **Typed-model split.** `LockState` / `LockStateResponse` / `LockedErrorResponse` live in `models/networking/` to match the repo's existing payload-typing convention (e.g., `StatusResponse`, `ControllersResponse`) instead of being inlined inside the middleware and the WS broadcast site.
2. **HTTP integration test.** Without an external acquire path on the running server, the unit tests can't actually demonstrate the middleware fires through a real HTTP roundtrip. The integration test (Node `http` + global `fetch`, no new deps) closes that verification gap and stays as a regression guard.

## Out of scope

- Applying middleware to the full write-route set (deferred to **c.2**).
- The lock-aware UI banner across non-firmware views (deferred to **d.7**).
- Any flash-job state machine, GitHub fetching, file upload, or serial protocol additions.
- Persisted lock state across server restarts — per the decomposition's "no crash recovery" decision, lock vanishes on restart.

## Notes for the reviewer

- The numeric-value alignment between server `TransmissionType` and Vue `WebsocketMessageType` is currently maintained by hand. If a future PR introduces a generator or shared schema, this is the place to start.
- The `requireUnlocked` middleware sits **after** `authHandler` in the chain so 401 still beats 423 for unauthenticated requests.
- `JobLock.acquire()` is not reentrant by design — a second acquire while held returns false. Owners are identified by string for now (e.g., `"flashJob:<uuid>"`); upgrade to richer identity later if needed.
