# Firmware OTA d.7 Follow-ups — Light Plan

> **For agentic workers:** light plan per CLAUDE.md — brief description + a short checklist. No brainstorming phase, no scope-guard gate, but the pre-commit toolkit (prettier → lint → build → vitest → `superpowers:requesting-code-review`) and pre-push toolkit (`/pr-review-toolkit:review-pr`) still apply.

**Goal:** clear the three out-of-scope items surfaced by the d.7 pre-push review (two HIGH, one MINOR). All are real defects in `develop` today, independent of any in-flight firmware-OTA work.

**Branch:** `feature/firmware-ota-d-7-followups` (off latest `origin/develop`).

**Base branch:** `develop` (open PR with `gh pr create --base develop`).

---

## Context — what we're fixing and why

Three findings from the d.7 pre-push toolkit pass, captured verbatim in [`20260514-1300-firmware-ota-d-7-lock-aware-rest-of-app.md` § Out of scope follow-ups](./20260514-1300-firmware-ota-d-7-lock-aware-rest-of-app.md):

### 1. jobLock HTTP hydrate (HIGH)

`astros_vue/src/stores/jobLock.ts` exposes `setState()` but no `fetchLockState()`. `App.vue:onMounted` hydrates `systemStatusStore` via HTTP (`SYSTEM_STATUS` endpoint) so the readonly banner and disabled-button bindings are correct from the first paint — there's an analogous gap for the job-lock state.

**Symptom:** a user who deep-links to `/firmware` (or any view that shows the lock banner) during a foreign flash sees the `SourceStrip` source picker interactive until the WebSocket handshake completes — they can click "Push Firmware" and only learn writes are blocked via the server's 423 response. With WiFi or slow networks, that window can be 1–3 seconds.

**Fix shape:** mirror the systemStatus hydrate pattern. Server-side, add a `GET /api/firmware/lock-state` controller that returns `JobLock.getState()`. Client-side, add `fetchLockState()` to the store and call it from `App.vue:onMounted` alongside `systemStatusStore.fetchStatus()`.

**Why this is HIGH and not MINOR:** there is no client-side check that the user's intent is "view-only" before they click — the firmware view's `SourceStrip` accepts file picks and release selections regardless of lock state. The current behavior is "click, get 423, find out". The hydrate closes that window.

### 2. AstrosConfirmModal consumer wiring (HIGH, ordering constraint)

`AstrosConfirmModal` (`astros_vue/src/components/modals/AstrosConfirmModal.vue:1-19`) exposes a function-prop API:

```ts
defineProps<{ message: string; onClose: () => void; onConfirm: () => void; title?: string }>()
```

Two callers use Vue **event syntax** (`@confirm` / `@close`) against this prop API:

- `astros_vue/src/views/ModulesView.vue:436-441` — `@confirm="handleRemoveModule"` (module removal) is a no-op
- `astros_vue/src/views/ScripterView.vue:422-427` — `@confirm="confirm"` (channel/script confirms) is a no-op

The third caller (`astros_vue/src/components/playlists/playlistEditor/AstrosPlaylistEditor.vue:394-400`) correctly uses `:on-confirm="..."` / `:on-close="..."` — that's the reference pattern.

**Why the bug is silent:** the `@confirm` attribute falls through to the inner `<dialog>` element as a DOM event listener. `<dialog>` doesn't emit a `confirm` event, so the listener never fires. `@close` happens to coincide with the dialog's native `close` event, but that event only fires when the dialog is closed via `dialog.close()` / Esc — not when the modal's Cancel button is clicked. Net effect: both the Confirm and Close buttons in ModulesView+ScripterView confirm flows are dead clicks.

**Ordering constraint:** the d.7 audit converted `AstrosConfirmModal`'s primary button to `AstrosWriteButton` ahead of any caller wrapping a real write. This fix must land **before** any new `AstrosConfirmModal` caller wraps a real write — otherwise the lock-gated Confirm button silently won't fire even when unlocked, masking the lock-gating intent at the new call site.

### 3. AstrosServoTestModal slider readonly check (MINOR)

`astros_vue/src/components/modals/modules/AstrosServoTestModal.vue:30` defines:

```ts
const writesBlocked = computed(() => jobLockLocked.value);
```

The Enable Test button is wrapped in `AstrosWriteButton` (which ORs both `systemStatusStore.readOnly` and `jobLockStore.locked`), so it disables correctly under readonly. But the slider's `:disabled="disabled || writesBlocked"` (line 102), the `onSliderChange` early-return (line 42), the `enableTest` early-return (line 63), and the auto-disable watcher (line 34) only consult `jobLockLocked`.

**Symptom:** if the operator enters readonly mode (DB migration failure, etc.) while the modal is open with the test active, the Enable button correctly disables but the slider keeps firing `SERVO_TEST` WS messages on input until the next Enable toggle.

**Why MINOR:** narrow race window — the modal has to already be open AND the test active AND readonly flips on mid-session. Operationally rare, but `writesBlocked` is supposed to be the single source of truth for the modal's lock posture.

**Fix shape:** widen `writesBlocked` to OR both stores. Keep the `lock-active-notice` region (the "flash active" copy) gated on `jobLockLocked` specifically — `AstrosWriteButton`'s tooltip already explains readonly on its own, and we don't want the notice to claim "flash active" during a non-flash readonly state.

---

## Files touched

### New
- `astros_api/src/controllers/firmware_lock_state_controller.ts` — new endpoint
- `astros_api/src/controllers/firmware_lock_state_controller.test.ts` — controller unit tests
- `.docs/qa/firmware-ota-d-7-followups.md` — manual QA test plan for the two ConfirmModal consumers + the ServoTestModal readonly path

### Modified
- `astros_api/src/api_server.ts` — import + `registerFirmwareLockStateRoutes(...)` call alongside `registerSystemStatusRoutes`
- `astros_vue/src/api/endpoints.ts` — add `FIRMWARE_LOCK_STATE` constant
- `astros_vue/src/stores/jobLock.ts` — add `fetchLockState()` action mirroring `systemStatus.fetchStatus()`
- `astros_vue/src/stores/__tests__/jobLock.spec.ts` — `describe('fetchLockState')` block mirroring the systemStatus tests
- `astros_vue/src/App.vue` — call `jobLockStore.fetchLockState()` in `onMounted` alongside `systemStatusStore.fetchStatus()`
- `astros_vue/src/views/ModulesView.vue` (lines 436–441) — swap to `:on-confirm` / `:on-close` prop binding
- `astros_vue/src/views/ScripterView.vue` (lines 422–427) — same swap
- `astros_vue/src/components/modals/modules/AstrosServoTestModal.vue` — widen `writesBlocked` OR; narrow notice region to `jobLockLocked`
- `astros_vue/src/components/modals/modules/__tests__/AstrosServoTestModal.spec.ts` — readonly-flips-on coverage

---

## Tasks

Each task is one commit. Pre-commit toolkit (prettier → lint → build → vitest → `superpowers:requesting-code-review`) runs on every task before the commit.

- [x] **T1. Create branch + commit this plan.** Branch off the latest `origin/develop` using the safe pattern (per memory: `git fetch origin && git switch develop && git pull && git switch -c feature/firmware-ota-d-7-followups` — do NOT use `git checkout -b feature/<slug> origin/develop`, which makes the branch track develop and lets VS Code push commits straight to develop). Commit just this plan file. Carve-out: plan-only commit skips the pre-commit code review per CLAUDE.md.

- [x] **T2. Server: GET /api/firmware/lock-state endpoint (TDD).** Test-first:
  1. Create `astros_api/src/controllers/firmware_lock_state_controller.test.ts`. Cases: unlocked → 200 with `{ locked: false, owner: null, since: null }`; locked → 200 with the populated state from `JobLock.acquire(...)`. Build the route with a fresh `JobLock` instance + `express` + `supertest` (same pattern as `system_status_controller.test.ts` if it exists, else mirror `firmware_releases_controller.test.ts`).
  2. Run `npx vitest run astros_api/src/controllers/firmware_lock_state_controller.test.ts` — expect failure.
  3. Create `astros_api/src/controllers/firmware_lock_state_controller.ts` exporting `registerFirmwareLockStateRoutes(router: Router, jobLock: JobLock)`:
     ```ts
     import { Router } from 'express';
     import { JobLock } from '../job_lock/job_lock.js';

     export function registerFirmwareLockStateRoutes(router: Router, jobLock: JobLock) {
       router.get('/firmware/lock-state', (_req, res) => {
         res.status(200).json(jobLock.getState());
       });
     }
     ```
     Unauthenticated like `/system/status` — same UX justification (App.vue hydrate runs before any view navigates, and the response leaks no secrets).
  4. Run vitest — expect pass.
  5. Wire into `astros_api/src/api_server.ts`: import + call adjacent to the existing firmware-family registrations (`registerFirmwareFlashRoutes` / `registerFirmwareReleasesRoutes` at ~line 573–574). The firmware family lives in a later phase of `setRoutes()` than `registerSystemStatusRoutes` because it depends on `this.jobLock` / `this.flashOrchestrator` / `this.githubReleaseService` being constructed first.
  6. Pre-commit toolkit + commit.

- [x] **T3. Client: jobLock store fetch action + endpoint constant (TDD).** Test-first:
  1. Add to `astros_vue/src/stores/__tests__/jobLock.spec.ts` a `describe('fetchLockState', ...)` block mirroring the three cases in `systemStatus.spec.ts:75-116`:
     - Locked GET response updates `locked` / `owner` / `since` and calls `apiService.get('api/firmware/lock-state')`.
     - Unlocked GET response after a pre-seeded locked state clears `owner` / `since`.
     - Rejected fetch leaves state unchanged and does not throw.
     Use the same `apiGet`-mock pattern as the systemStatus spec.
  2. Run `npx vitest run astros_vue/src/stores/__tests__/jobLock.spec.ts` — expect failure.
  3. Add `FIRMWARE_LOCK_STATE = 'api/firmware/lock-state'` to `astros_vue/src/api/endpoints.ts` next to `FIRMWARE_FLASH`.
  4. Add `fetchLockState()` to `astros_vue/src/stores/jobLock.ts`:
     ```ts
     async function fetchLockState(): Promise<void> {
       try {
         const response = (await apiService.get(FIRMWARE_LOCK_STATE)) as LockState;
         setState(response);
       } catch (error) {
         // Leave state unchanged. WS lockStateChanged will bring us up to date
         // once the handshake completes; this hydrate is belt-and-braces.
         console.warn('jobLock.fetchLockState failed', error);
       }
     }
     ```
     Export it from the store return. Imports: `apiService` from `@/api/apiService`, `FIRMWARE_LOCK_STATE` from `@/api/endpoints`.
  5. Run vitest — expect pass.
  6. Pre-commit toolkit + commit.

- [x] **T4. Client: App.vue hydrate wire-up.** No new test; this is one-liner UI-layout code per memory TDD-exceptions. Modify `astros_vue/src/App.vue`:
  - Import `useJobLockStore` alongside `useSystemStatusStore`.
  - In `onMounted`, call `jobLockStore.fetchLockState()` immediately after `systemStatusStore.fetchStatus()` (both before `wsConnect()`).
  - Update the inline comment to cover both stores.
  Run `npm run build` to confirm typecheck. Pre-commit toolkit + commit.

- [x] **T5. Fix ConfirmModal consumer wiring + QA test plan.** Code fix is template-only (UI-layout per CLAUDE.md TDD exceptions). Vue unit-test scaffolding for `ModulesView` / `ScripterView` does not exist, the remove buttons in `AstrosUartModule.vue` / `AstrosI2cModule.vue` carry no `data-testid` attributes (Playwright e2e would require adding them — scope creep on a 2-line typo fix), and the existing d.7 `AstrosConfirmModal` unit tests already pin the modal's prop API correctly. The bug is in *consumer* wiring of a contract that's already tested; the regression-prevention path here is manual QA per CLAUDE.md `.docs/qa/` convention plus the protection of code review (which caught this exact issue in d.7's pre-push toolkit).
  1. Modify `astros_vue/src/views/ModulesView.vue:436-441` — swap to prop binding:
     ```vue
     <AstrosConfirmModal
       v-if="showModal === ModalType.CONFIRM"
       :message="$t('module_view.confirm_remove')"
       :on-confirm="handleRemoveModule"
       :on-close="() => { showModal = ModalType.CLOSE_ALL; }"
     />
     ```
  2. Modify `astros_vue/src/views/ScripterView.vue:422-427` — same shape, with `confirm` and the matching `:on-close` arrow.
     Note: `confirm` is a reserved-ish name (shadows the browser global) — leave the function name as-is to minimize blast radius, but the inline arrow on `:on-close` avoids any naming collision.
  3. Create `.docs/qa/firmware-ota-d-7-followups.md` covering the two affected confirm flows (Modules: remove UART/I2C module; Scripter: remove channel from script). The QA plan is also used to verify T6's ServoTestModal readonly path — see T6 below.
  4. Pre-commit toolkit + commit.

- [x] **T6. Fix ServoTestModal readonly check (TDD).**
  1. Add to `astros_vue/src/components/modals/modules/__tests__/AstrosServoTestModal.spec.ts` two cases:
     - `systemStatusStore.readOnly = true` (jobLock unlocked) → slider `[disabled]` is true, `onSliderChange` does not call `wsSendMessage`, `enableTest` is a no-op.
     - Mid-session readonly flip with the test active → the auto-disable watcher fires, slider goes to `disabled`, the `lock-active-notice` region is NOT shown (per the design note: notice is job-lock-only).
     - The third sub-case is the existing job-lock-locked path — verify notice IS shown there (regression).
     Use Pinia setup with both `useJobLockStore` and `useSystemStatusStore` for these tests.
  2. Run `npx vitest run astros_vue/src/components/modals/modules/__tests__/AstrosServoTestModal.spec.ts` — expect failures on the new cases.
  3. Modify `astros_vue/src/components/modals/modules/AstrosServoTestModal.vue`:
     - Import `useSystemStatusStore`. Add `const systemStatus = useSystemStatusStore();` and destructure with a rename: `const { readOnly: systemStatusReadOnly } = storeToRefs(systemStatus);` (same pattern as the existing `const { locked: jobLockLocked } = storeToRefs(jobLock);` on line 11).
     - Widen `writesBlocked = computed(() => jobLockLocked.value || systemStatusReadOnly.value)`.
     - Change `<div v-if="writesBlocked" ...>` (line 108) to `<div v-if="jobLockLocked" ...>`. (The notice text is firmware-flash-specific; readonly is already explained by `AstrosWriteButton`'s tooltip.)
     - Update the inline comment block above `writesBlocked` to mention readonly + the notice-region split.
  4. Run vitest — expect pass.
  5. **Mutation test (per `feedback_mutation_test_defensive_features`):** revert the `|| systemStatusReadOnly.value` clause and re-run the readonly tests — they must fail. Restore the fix.
  6. Pre-commit toolkit + commit.

- [ ] **T7. Pre-push branch review.** Run `/pr-review-toolkit:review-pr` on the full diff vs `develop` per CLAUDE.md. Address Critical/Important. The hazard categories most likely to surface here:
  - **Contract**: the new endpoint vs the writeGuard mounting order (writeGuard mounts on `/api` at line 408; the new route is registered after that in `setRoutes` at line 460. Confirm GET requests aren't gated by writeGuard — checked: writeGuard only filters write-class methods, so GET passes through.)
  - **Wiring drift**: any other `AstrosConfirmModal` callers? Pre-emptively grepped — only the three (Modules, Scripter, PlaylistEditor) plus the firmware view's separate `AstrosFirmwareConfirmModal`. Should still be re-checked at review time.
  - **Documentation drift**: d.7 plan's "Out of scope follow-ups" section names these three items — once they're shipped, do NOT edit that section (it documents what was in/out of scope for d.7 itself). Add a brief "Resolved in 20260514-1520..." line at the top of that section if useful, but don't rewrite history.
- [ ] **T8. User pushes via VS Code; open PR.** Per memory, never run `git push` from terminal. After review-fixes are clean, hand off; user pushes, opens PR with `gh pr create --base develop`.

---

## Acceptance criteria

- `GET /api/firmware/lock-state` returns 200 with `{ locked, owner, since }` matching `JobLock.getState()`.
- `App.vue:onMounted` calls both `systemStatusStore.fetchStatus()` and `jobLockStore.fetchLockState()` before `wsConnect()`.
- Deep-link to `/firmware` with the server in a locked-by-other-session state: `SourceStrip` shows the lock-active state from the first paint (no interactive window before WS handshake).
- Clicking the Confirm button in the `ModulesView` "remove module" flow and the `ScripterView` confirm flow actually invokes the handler. Clicking Cancel/Close actually closes the modal.
- `AstrosServoTestModal`: with `systemStatusStore.readOnly === true`, slider is disabled, `onSliderChange` does not send WS messages, mid-session readonly flip auto-disables the test. Notice region is shown ONLY when `jobLockLocked.value === true`.
- All existing tests still pass. New tests pass. No lint or type errors. No console warnings in dev.

## Out of scope (deliberately deferred)

- Authenticating the lock-state endpoint. Mirroring system-status's posture is the right baseline; if we later need to gate by API key, do it as a cross-cutting "auth read endpoints" change, not in this branch.
- Touching `AstrosFirmwareConfirmModal` (the firmware-view-specific confirm). It has its own callers and contract; out of scope here.
- Any `firmware_view.lock_banner_cta` or other i18n string changes (none needed — all required keys already exist).
- The `c-real` orchestrator-vs-real-serial swap. Blocked on firmware-repo `a` + `b` series, separate work.

## Risk + reviewer notes

- **Reactivity gotcha (ServoTestModal):** `storeToRefs` on `useSystemStatusStore()` returns a `ref` for `readOnly`. In the computed, use `.value`. The d.6 store wiring tests caught a similar mistake; the existing spec scaffolding makes this hard to get wrong if T6's tests are written first.
- **Inline arrow on `:on-close` (T5):** passing `() => { showModal = ModalType.CLOSE_ALL; }` creates a new function on every render, which is fine because `AstrosConfirmModal` only calls it once on click. If the modal becomes a `<keep-alive>` child later, swap to a named handler.
- **Endpoint placement:** the controller lives under `astros_api/src/controllers/` not `astros_api/src/firmware/` because the existing `firmware_flash_controller.ts` and `firmware_releases_controller.ts` use that location for HTTP route handlers. The `astros_api/src/firmware/` directory is reserved for the orchestrator and supporting domain logic.
