# d.6 — Round-8 review fixes (Criticals + 4 convergent Importants)

**Goal:** Apply 6 findings from the round-8 multi-agent review (2 Criticals + 4 Importants flagged by 2+ agents each). Single commit at end of work.

**Tier:** Light plan. All fixes are <30 lines each and well-scoped. TDD where the production code allows (no UI-only changes).

**Branch:** `feature/firmware-ota-d-6-live-wiring` (already exists).

## Tasks

- [ ] **1. NEW-C1 — CR-3 guard logical operator fix (`||` → `&&`)**
  - File: `astros_vue/src/composables/useWebsocket.ts:347, 370` (both mid-stream catches)
  - Add test in `useWebsocket.spec.ts` for `phase='done' + flashError=null + malformed frame → flashError stays null` before fixing.

- [ ] **2. NEW-C2 — CR-1b recovery delegates to applyJobDone instead of setPhase**
  - File: `astros_vue/src/composables/useWebsocket.ts:283` (the recovery branch)
  - Replace `firmware.setPhase('done')` with `firmware.applyJobDone({jobId: firmware.currentJob?.jobId ?? '<recovery>', endedAt: new Date().toISOString()})`. Also set a `protocol_violation` flashError so operators see "recovered from lost terminal event."
  - Update existing CR-1b test in `useWebsocket.spec.ts` to assert (a) phase='done', (b) flashError surfaces recovery breadcrumb, (c) any mid-flow controllerStates were normalized.

- [ ] **3. NEW-IM1 — `applyControllerUpdate` element validation**
  - File: `astros_vue/src/stores/firmware.ts:320` (function entry)
  - Mirror IM-3's guard from `buildControllerStatesMap`: reject `!data || typeof data.controllerId !== 'string' || data.controllerId.length === 0` with a warn and early return.
  - Test in `firmware.spec.ts`.

- [ ] **4. NEW-IM2 — Empty-string jobId in fetchCurrentJob**
  - File: `astros_vue/src/stores/firmware.ts:656` (fetchCurrentJob guard)
  - Change truthy check on `body.jobId` to explicit `typeof body.jobId === 'string' && body.jobId.length > 0`. Add warn for empty-string case.
  - Test in `firmware.spec.ts`.

- [ ] **5. NEW-IM3 — Phase guard in `applyControllerUpdate`/`applyControllerResult`**
  - File: `astros_vue/src/stores/firmware.ts:320, 375` (both handlers)
  - Early-return with warn when `phase.value === 'done' || phase.value === 'failed'`. Prevents trailing updates from mutating terminal state.
  - Tests in `firmware.spec.ts`.

- [ ] **6. NEW-IM4 — Surface flashError in phase='done'**
  - File: `astros_vue/src/views/FirmwareView.vue` (around `showFlashErrorRegion` computed)
  - Widen to render the region in phase='done' when flashError is non-null. Use a "warning" rather than "error" visual variant (distinct from the failed-phase title).
  - Add i18n key `firmware_view.mid_flash_error.title_done_with_warning` for the title in done phase.
  - Test in `FirmwareView.spec.ts`.

- [ ] **7. Verify + review + commit**
  - prettier/lint/build/tests on Vue + API
  - Run `superpowers:requesting-code-review` on the diff vs prior commit
  - Address Critical/Important reviewer findings
  - Commit with message: `fix(firmware): round-8 follow-ups — CR-3 guard AND + CR-1b normalize + apply* validation/phase-guards + done-phase flashError`
