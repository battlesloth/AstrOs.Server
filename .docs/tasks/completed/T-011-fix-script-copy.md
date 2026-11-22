# T-011: Fix the Scripts page's Copy button

<!-- File: .docs/tasks/completed/T-011-fix-script-copy.md. Branch: feature/T-011-fix-script-copy. PR title: "T-011: Fix the Scripts page's Copy button". -->

## Context

The Copy action on the Scripts page has failed for every script since 2026-03-25. The UI shows the `scripts_view.copy_error` toast, and the API answers 404.

- `astros_vue/src/stores/scripts.ts` `copyScript` sends `apiService.get(SCRIPTS_COPY, { id })`, which is `GET /api/scripts/copy?id=…`. It has done so since `457430ce` (2025-12-24).
- The route was a `GET` until `b1573eb5` ("clean up controller logic", 2026-03-25). That commit moved the scripts routes into `registerScriptRoutes` and registered copy as `router.post(copyRoute, …)`. The handler still reads `req.query.id`.
- Nothing serves `GET /api/scripts/copy`, so Express answers 404. Releases 1.0.0, 1.0.1 and 1.0.2 shipped with it broken (1.0.0 corrected 2026-11-21: its release commit `1371c2aa` already had the POST route and the GET call).

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
  4. Read-only mode: load the Scripts page against the healthy API, restart the API in scenario 1 of `system-readonly-mode.md`, then click Copy without reloading the page (scenario 1's fallback database has no tables, so a reloaded page has no rows): Copy shows the error toast, and the API answers 503. (Step amended 2026-11-21 after the code review found it could not be run as first written; what it checks is unchanged.)

## Implementation checklist

- [x] API tests written first (`scripts_controller.test.ts` § copyScript). The body and query-string tests failed red on the old handler (500 for a body id, 200 for a query id); the registration test passes on the old code by design, since the route was already `POST`.
- [x] API: `copyScript` exported and reads `req.body.id`. Mutation-checked: registering the route as `router.get` fails the registration test, and a `req.body.id ?? req.query.id` fallback fails the query-string test.
- [x] Vue spec written first (`stores/__tests__/scripts.spec.ts`); both cases failed red on the `get` call.
- [x] Vue: `copyScript` calls `apiService.post(SCRIPTS_COPY, { id: scriptId })`.
- [x] QA plan `.docs/qa/scripts-page.md` (Copy cases 1–9).
- [x] Code review on the diff: no Critical findings. Fixed both Important ones: QA case 1 described a copied row's badges wrongly, and QA case 7 and Verification step 4 could not be run, because scenario 1's fallback database has no tables (fixed by loading the page first and not reloading). Fixed all five Minor ones: the registration test's comment overstated its coverage; added `copy runs the auth handler before the copy` (since renamed `copy runs the auth handler first`), mutation-checked by dropping `authHandler` and by moving it after the handler; removed dead `afterEach` and mock methods from the Vue spec; softened the `COPY` fixture comment; staged the new files explicitly.
- [x] Format + lint both sub-projects (CI prettier checks green), both builds, full suites, re-run after the review fixes.
- [x] Manual check, Verification steps 1–4, with Jeff (2026-11-21, this branch's API on a copy of the dev DB, QA cases 1, 2, 3, 6, 7; 4, 5, 8 and 9 not run).
  1. Copy on "Servo Test": success toast, a "Servo Test (Copy)" row with gray "Not uploaded" badges and a faded 0. The API log has one `POST /scripts/copy 200` (its `req.url` field shows `/api/scripts/copy`) and no `GET`.
  2. The copy matches the original in the scripter.
  3. 5 channels and 17 events in both, and the same `duration_ds` (80). All 17 rows match on module channel, sub-type, time, `end_time` and data; the copy shares no channel or event id with the original.
  4. Read-only (scenario 1, page loaded first): both toasts, no row, and the API log has `POST /scripts/copy 503 - failed with status code 503`. After a normal restart, still one copy.
- [x] Quick fix from the QA walk (Jeff, 2026-11-21): the Scripts and Playlists list layout.
  - **Found:** below about 930 px the Scripts table (890 px minimum) overflowed the window, and the whole page scrolled sideways, navbar and title bar included.
  - **Iterations:** a first `overflow-x-auto` wrapper put the horizontal scrollbar at the bottom of a long list, below the window (Jeff). Jeff then asked for a pinned column header, and for Playlists to match. Jeff checked both pages in his own browser.
  - **Final, in both views:** the full-width row under the title bar is the only scroller (`flex-1 min-h-0 overflow-auto` inside the layout's 100vh column), so the page never scrolls. The `<thead>` is `sticky top-0 z-1`: DaisyUI's `table-pin-rows` would paint the row white over `bg-primary`, and z-1 sits above the rows' positioned badges and below their tooltips (z-index 2).
  - **Review fixes:**
    - `scroll-pt-16` on the scroller: Shift+Tab focus was hidden behind the pinned header (WCAG 2.4.11).
    - `overflow-x-clip` on the title bar: in read-only or flash mode, New's hidden 320 px tooltip widened the page, which also caused a second vertical scrollbar.
    - The Playlists New button's unbound `aria-label` was removed.
  - **Verified:** a headless Playwright probe with the session and list calls stubbed (not committed), in Chromium (real scrollbars), Firefox and WebKit, Scripts at 800 and 1280 px and Playlists at 800 px, 40 rows: the page never scrolls; the scroller spans the window; the header is pinned, with rows under it; focus is never hidden; no read-only overflow. Removing `scroll-pt-16` and `overflow-x-clip` from ScriptsView makes the focus and read-only checks fail, and Playlists keeps passing. The Playlists table fits at every desktop width.
  - **QA:** `scripts-page.md` § Layout, cases 10–15 (Playlists shares them; `playlist-playback.md` points there).
- [x] Pre-push `/pr-review-toolkit:review-pr` (5 agents, 2026-11-21). No Critical findings. Fixed:
  - A failed copy logged a bare error, so no log line carried the script id now that it travels in the body. It now logs `{ err, scriptId }` with the message `copyScript: copy failed`, as `saveScript` does.
  - New tests: the route hands the request to `copyScript`; a failed copy logs its id; the 500 status is set before the body. In the Vue spec, the endpoint path is a literal, seed and assertion use separate objects, the response fixture has an ISO-string `lastSaved`, and the failure's `console.error` is asserted. Each was mutation-checked (8 mutations, each caught by its test). The fix-pass review then added a test that a body id whose `String()` throws still gets one 500 (the `String()` mutation fails it), tightened the `console.error` assertion (dropping its error argument fails it), and corrected QA case 14, which as rewritten could no longer catch hidden focus.
  - QA case 8 promised a 500 for a script deleted in another tab, but delete only disables a script, so the copy succeeds. Case 8 now uses an id that never existed, and the deleted-script copy is a Backlog known gap.
  - Docs and comments: QA cases 7, 11, 13 and 14; the log-line evidence above; 1.0.0 in Context; the views' layout comments; and the `PLAN.md` Now line (the ESP bench waits on a bench-server deploy of develop). Also removed a wrong drawer-checkbox Backlog item (DaisyUI already mirrors its focus ring onto the hamburger).
  - Not done: rewording commit `f8cce0aa`'s message to add 1.0.0, because rewriting it would change the hashes `PLAN.md` and this file cite; the PR body carries the correction. The cross-boundary Copy e2e and the layout e2e guard went to the Backlog.
- [x] PR #138 opened against develop (2026-11-21).
- [x] Merged 2026-11-21 as PR #138 (merge `f6395d95`), with no review comments. CI's Playwright E2E job first failed before any test ran: GitHub's `ubuntu-latest` became Ubuntu 26.04, where Playwright 1.57 cannot install its browser. Jeff chose to pin that job to `ubuntu-24.04` on this PR (`62f263ae`); all four checks then passed. Upgrading Playwright and unpinning is in the `PLAN.md` Backlog.
- [x] Close-out: task file moved to `completed/`, `PLAN.md` checkbox, Status and Log. (task file to `completed/`, PLAN.md checkbox + Log).
