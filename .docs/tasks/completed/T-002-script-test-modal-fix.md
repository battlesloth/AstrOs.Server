# T-002: Fix ScriptTestModal setup crash and stale-status Run enable

<!-- File: .docs/tasks/T-002-script-test-modal-fix.md. Branch: feature/T-002-script-test-modal-fix.
     PR title: "T-002: Fix ScriptTestModal setup crash and stale-status Run enable". -->

## Context

Bench finding 2026-09-04: clicking **Test** in the scripter for the "Servo Test" script
(`s1780245rYD`) never opens the upload modal. The console shows cascading Vue renderer
errors (`Cannot read properties of null (reading 'subTree')` / `(reading 'nextSibling')`
from `getNextHostNode`). Reproduced headless against the dev server; the originating error
on the first click is:

```
ReferenceError: Cannot access 'setCaption' before initialization
    at watch.deep (AstrosScriptTestModal.vue:56)   <- browser line; source line 73 at 8230d563
```

Root cause: `AstrosScriptTestModal.vue` registers a `watch(() => scripterStore.script?.deploymentStatus, …, { deep: true, immediate: true })`
whose callback calls `setCaption`, a `const` arrow declared ~30 lines *below* the watcher.
`immediate: true` runs the callback synchronously inside `setup()`, so `setCaption` is in
its temporal dead zone. Vue dev builds re-throw handled errors, so the throw escapes
`setup()`, aborts AstrosLayout's patch loop mid-way after `instance.subTree` was already
swapped, and every later update patches against a half-mounted tree (the pasted errors).

Why it surfaced now: the callback returns early unless `deploymentStatus.body/core/dome`
exists. The order bug dates from ddf65eee (2026-02-07, `immediate: true` added), but the
API keyed `deploymentStatus` by location UUID until PR #113 (7055683a, 2026-06-01) keyed it
by location name. Combined with the FK fix in 24efacf0 (2026-05-31; the dev DB's only two
deployment rows are Servo Test body+core from that day), the frontend received its first
truthy `deploymentStatus.body` and the dormant branch executed.

Second defect, hidden behind the crash: the same watcher re-reads all three locations on
every change and treats whatever it finds as *this run's* result. With prior entries now
present, the first WS ack for any location makes the callback read the stale `UPLOADED`
value for the others, mark them SUCCESS, declare "Upload complete", and enable **Run**
while those uploads are still in flight. Before PR #113 the map always arrived empty.

Impact sweep of PR #113 (all other consumers checked): `AstrosScriptRow` badges and
`ScriptsView.setUploadingStatus` now work as intended (improvements); WS
`updateScriptStatus` already keyed by name; no API reader outside the repository; the
dropped `locationName` field was never read by the frontend; orphan-row skip unreachable
(FK cascade, location names not editable via API).

## Contract (pinned — do not change)

- **WS `ScriptStatus` message** (`scriptId`, `locationId` = Location enum NAME
  `body|core|dome`, `status`, `date`) and `useWebsocket.handleScriptMessage` dispatch to
  both stores — unchanged.
- **`Script.deploymentStatus: Partial<Record<Location, DeploymentStatus>>`** keyed by
  location name (PR #113) — unchanged on both sides.
- **`DeploymentStatus { date?: Date | undefined; value: UploadStatus }`**, `UploadStatus`
  (`NOT_UPLOADED=0, UPLOADING=1, UPLOADED=2`) and `TransmissionStatus`
  (`UNKNOWN=0, SENDING=1, SUCCESS=2, FAILED=3`) numeric values — unchanged. (The WS path
  stores API `TransmissionStatus` numbers into `value`; that coincidence is not touched.)
- **`scripterStore.updateScriptStatus(status)`** semantics — unchanged (spread into a new
  map object, keyed by `status.locationId`).
- **`scripterStore.isDirty`** — `editableSnapshot` excludes `deploymentStatus`; the reset
  must not dirty the script or trigger the route-leave prompt.
- **`AstrosScriptTestModal` props/emits** (`scriptId`; `close`) and
  **`scriptsStore.uploadScript(id)`** (`GET SCRIPTS_UPLOAD`) — unchanged.
- **Modal UI semantics** — assigned locations show "Uploading" until their own ack;
  unassigned locations (no controller address) show "Not Assigned" and never block
  completion. Existing i18n keys under `modals.script_test.*` — unchanged.

## Task

1. `AstrosScriptTestModal.vue`: move `setInitialUploadStatus` and `setCaption` above the
   `watch(...)` call so both are initialized before the immediate callback runs. No other
   reordering.
2. `stores/scripter.ts`: add `markUploading(locations: Location[]): void` — for each
   location, set `deploymentStatus[location] = { value: UploadStatus.UPLOADING, date: <existing date, if any> }`,
   replacing the map via spread (same shape as `updateScriptStatus`); warns and no-ops
   when no script is loaded; `markUploading([])` is a silent no-op. Export it from the store.
3. `AstrosScriptTestModal.vue` `onMounted`: call `scripterStore.markUploading(assigned)`
   for exactly the locations that have a controller address, **before**
   `scriptStore.uploadScript(...)`, so no ack can precede the reset.
4. `AstrosScriptTestModal.vue` (from the pre-commit review): start every run
   gated — `setInitialUploadStatus` also resets `status` / `uploadInProgress` /
   `runDisabled`, because the immediate watcher can flip them against the pre-reset
   map during setup when all three locations are assigned and each carries an
   entry. The watcher only tracks *assigned* locations (`bodyAssigned` /
   `coreAssigned` / `domeAssigned`, booleans snapshotted once at setup — a location
   assigned mid-run was not uploaded to and must not be waited on), so an entry for
   an unassigned location never overrides "Not Assigned" — every new script has one
   for every Location, since `createNewScript` seeds four entries.
5. Tests (TDD, failing first): component spec
   `src/components/modals/scripter/__tests__/AstrosScriptTestModal.spec.ts` and store spec
   `src/stores/__tests__/scripter.spec.ts` — see Verification.
6. QA plan: create `.docs/qa/scripter-script-test.md` (feature has no plan yet).

## Acceptance criteria

- [x] Modal mounts without throwing when the loaded script already has deployment entries
      (regression test; fails on the pre-fix declaration order).
- [x] With body+core assigned and prior UPLOADED entries for both, after the body ack Run
      is still disabled and the core caption still reads "Uploading"; after the core ack Run
      is enabled (regression test; fails with the `markUploading` call removed).
- [x] An unassigned location (no controller) shows "Not Assigned" and does not block
      completion (existing behavior preserved, pinned by test).
- [x] Assigned locations are marked UPLOADING in the scripter store at the moment the upload
      request is issued (test asserts store state from inside the mocked upload call).
- [x] `markUploading`: warns and no-ops without a script; preserves an existing `date`;
      replaces the map object; leaves
      `isDirty` false (store tests).
- [x] New-script map (NOT_UPLOADED entry for every Location) with body+core assigned:
      the modal starts gated ("Uploading script...", Run disabled, "Dome: Not Assigned");
      likewise for a script previously uploaded to all three locations with dome
      unassigned (regression tests; both fail without the assignment guard).
- [x] With all three locations assigned, Run stays disabled until the third ack
      (regression test; fails without the gate reset).
- [x] A second Test on the same script starts gated again (repeat-mount test, QA case 5).
- [x] `npm run lint` clean, `npm run build` (type-check) clean, full `npx vitest run` green.
- [ ] Bench (human-gated): open Servo Test → Test → modal shows Body/Core "Uploading",
      each flips on its own ack, Run enables only after both; no console errors.

## Out of scope

- Sum-based completion check (`coreUpload + domeUpload + bodyUpload >= SUCCESS * 3`)
  enabling Run on a FAILED ack (`FAILED=3 > SUCCESS=2`) — pre-existing; Backlog.
- WS path storing API `TransmissionStatus` numbers into a field typed `UploadStatus` —
  pre-existing coincidence (both put success at 2); Backlog.
- `ScripterView.vue` passes literal strings (`'Saving script...'`, `'Loading...'`,
  `'Initializing...'`) as the interrupt modal's `message`, which it renders via
  `$t(message)` — i18n cleanup; Backlog.
- Resetting the scripts-list store (`useScriptsStore`) from the modal — the list view owns
  its own `setUploadingStatus` flow.
- Any API change or change to PR #113's keying.
- App.vue `<Suspense>` single-root warning on every route load — cosmetic; Backlog.
- `scriptsStore.uploadScript` never throws (returns `{ success: false }`), so the
  modal's `catch` is dead and an HTTP failure leaves "Uploading" forever — Backlog
  (from the pre-commit review).
- Acks carry no run id, so a late ack from a cancelled run can flip a location early
  in the next run — needs a protocol-shaped change; Backlog (from the pre-commit review).
- `runClicked` ignores `runScript`'s result, and the API's deploy-response failure
  branch can drop the WS message for an unmapped MAC — Backlog (from the pre-push review).

## Verification

- `cd astros_vue && npx vitest run src/components/modals/scripter/__tests__/AstrosScriptTestModal.spec.ts src/stores/__tests__/scripter.spec.ts` — green.
- `cd astros_vue && npx vitest run` — full suite green; `npm run lint` — clean;
  `npm run build` — type-check clean.
- Mutation checks (recorded in the PR body): (a) revert the declaration order → mount test
  fails with the ReferenceError; (b) remove the `markUploading` call → stale-status test
  fails (Run enabled after the first ack); (c) remove the gate reset in
  `setInitialUploadStatus` → "waits for all three acks when dome is assigned too" fails;
  (d) remove the `&& xAssigned.value` guards → both "starts gated" tests fail; store:
  `markUploading([])` identity test fails without the empty-list early return; the
  spread pin (`not.toBe(before)`) fails if the map is mutated in place.
- Bench (human-gated, post-merge): see last acceptance criterion.

## Implementation checklist

- [x] RED: component spec — mount with prior deployment entries fails with the ReferenceError
- [x] GREEN: move `setInitialUploadStatus` / `setCaption` above the watcher
- [x] RED: component spec — Run stays disabled after the first ack (stale entries) + reset-before-upload + Not Assigned
- [x] RED: store spec — `markUploading` (sets UPLOADING, preserves date, warns + no-ops without script, `isDirty` stays false)
- [x] GREEN: `markUploading` in `stores/scripter.ts`; modal calls it before `uploadScript`
- [x] Mutation checks (a) order reverted → mount test fails; (b) `markUploading` call removed → stale-status test fails
- [x] QA plan `.docs/qa/scripter-script-test.md`
- [x] Review fixes (gate reset, assignment guard, empty-list no-op) with RED-first tests; mutation checks (c) reset removed / (d) guards removed
- [x] prettier:write, lint, build, full `npx vitest run`; `superpowers:requesting-code-review`; commit
- [x] `/pr-review-toolkit:review-pr` on the branch diff vs develop; PLAN.md Log + Status; move task file to completed
