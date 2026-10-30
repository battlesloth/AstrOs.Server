# T-011: Fix the Scripts page's Copy button

<!-- File: .docs/tasks/T-011-fix-script-copy.md. Branch: feature/T-011-fix-script-copy. PR title: "T-011: Fix the Scripts page's Copy button". -->

## Context

The Copy action on the Scripts page has failed for every script since 2026-03-25. The UI shows the `scripts_view.copy_error` toast, and the API answers 404.

- `astros_vue/src/stores/scripts.ts` `copyScript` sends `apiService.get(SCRIPTS_COPY, { id })`, which is `GET /api/scripts/copy?id=…`. It has done so since `457430ce` (2025-12-24).
- The route was a `GET` until `b1573eb5` ("clean up controller logic", 2026-03-25). That commit moved the scripts routes into `registerScriptRoutes` and registered copy as `router.post(copyRoute, …)`. The handler still reads `req.query.id`.
- Nothing serves `GET /api/scripts/copy`, so Express answers 404. Releases 1.0.1 and 1.0.2 shipped with it broken.

Found during T-009's pre-push review (2026-10-29); Jeff asked for this task.

A copy writes the database, so it should stay a write method: the read-only write guard (`astros_api/src/guard/write_guard.ts`) blocks write methods with 503 in read-only mode and 423 during a flash. Playlists already copy the way this task settles on: `apiService.post(PLAYLISTS_COPY, { id })` against `router.post('/playlists/copy')`, which reads `req.body.id`.

A sweep of every Vue `apiService` call against the API's registered routes (2026-10-29) found one other mismatch: `saveScripts()` in the same store posts to `/api/scripts/all`, which the API serves only as `GET`. Nothing calls `saveScripts()` (see Out of scope).

## Contract (pinned — do not change)

- **Request:** `POST /api/scripts/copy` with the JSON body `{ "id": "<script id>" }`. The handler reads `req.body.id`. This mirrors `POST /api/playlists/copy`. The query-string id is no longer read.
- **Response, unchanged:**
  - `200` with the copy as `ScriptRepository.copyScript` returns it: a `Script` with the new id, `scriptName` `<name> (Copy)` and `scriptChannels: []`;
  - `500 { message: 'Internal server error' }` on any failure.
- **Vue store:** `copyScript(scriptId)` calls `apiService.post(SCRIPTS_COPY, { id: scriptId })`. Its return shape (`{ success: true, data }` / `{ success: false, error }`) and its push of the copy into `scripts` are unchanged.
- **Write guard:** the copy stays a `POST`, so it is still refused in read-only mode (503) and during a flash (423).
- **Unchanged:** `ScriptRepository.copyScript`, the route path, the `SCRIPTS_COPY` endpoint string, and `ScriptsView.vue`'s toasts.

## Task

- **API** (`astros_api/src/controllers/scripts_controller.ts`): `copyScript` reads `req.body.id` instead of `req.query.id`. Export `copyScript` the way `saveScript` and `deleteScript` are exported, for the test.
- **Vue** (`astros_vue/src/stores/scripts.ts`): `copyScript` calls `apiService.post(SCRIPTS_COPY, { id: scriptId })`.

### Tests

Write these first.

- **`astros_api/src/controllers/scripts_controller.test.ts`:**
  - `copy is registered as POST /scripts/copy`: build an Express `Router`, call `registerScriptRoutes(router, passthroughAuth, db)`, and find the layer whose `route.path` is `/scripts/copy`. Its `route.methods` is `{ post: true }`. No `supertest` is needed.
  - `copyScript copies the script named in the body`: save a script with a channel and an event, then call `copyScript` with `{ body: { id } }`. It answers `200`, with a new id and `<name> (Copy)`. `getScript` on the new id has the channel and event, under new ids.
  - `copyScript ignores a query-string id`: `{ query: { id }, body: {} }` answers `500 { message: 'Internal server error' }`, and no copy is stored. This pins that the body is the source.
- **`astros_vue/src/stores/__tests__/scripts.spec.ts`** (new; mock `@/api/apiService` as `scripter.spec.ts` does):
  - `copyScript posts the id and adds the copy`: `apiService.post` is called with `(SCRIPTS_COPY, { id: 's1' })` and `apiService.get` is not called. The resolved copy is pushed onto `scripts`, and the result is `{ success: true, data }`.
  - `a failed copy leaves the list unchanged`: a rejected `post` gives `{ success: false }`, and `scripts` is unchanged.

## Acceptance criteria

- [ ] The tests above are green; full API and Vue suites and both builds are green.
- [ ] On the Scripts page, Copy shows the success toast and adds a `<name> (Copy)` row, and the copy opens in the scripter with the original's channels and events.
- [ ] A copy in read-only mode is refused (503, error toast), as for any write.
- [ ] New QA plan `.docs/qa/scripts-page.md` with the Copy cases (success, the copy's contents, read-only refusal), per CLAUDE.md § QA Test Plans.

## Out of scope

- **`saveScripts()` in `stores/scripts.ts`** posts to `/api/scripts/all`, which only serves `GET`. It has no caller; removing it is a separate cleanup (PLAN.md Backlog).
- **An unknown script id** answers 500 (`NoResultError`), while playlist copy answers 404. Changing that changes the response contract.
- **Copying a script with a span T-009 refuses** answers 500. No production database can hold such a span: spans exist only from T-007 on, and T-009 validates them before any release.
- **Copy's other behavior** is unchanged: the `(Copy)` suffix, `lastSaved`, the empty `deploymentStatus`, and a copy's channels and events getting new ids.

## Verification

- `cd astros_api && npx vitest run src/controllers/scripts_controller.test.ts` green, then `npm run build` and the full `npx vitest run` green.
- `cd astros_vue && npx vitest run src/stores/__tests__/scripts.spec.ts` green, then `npm run build` and the full `npx vitest run` green.
- Manual check, on a copy of the dev DB with this branch's API and Vue dev server:
  1. Scripts page → Copy on a script with events: the success toast appears, a `<name> (Copy)` row appears, and the API log has `POST /scripts/copy 200`.
  2. Open the copy in the scripter: the same channels and events at the same times.
  3. `sqlite3 $DB "SELECT count(*) FROM script_events WHERE script_id = '<copy id>'"` equals the original's count.
  4. Read-only mode (as in `system-readonly-mode.md`): Copy shows the error toast, and the API answers 503.
