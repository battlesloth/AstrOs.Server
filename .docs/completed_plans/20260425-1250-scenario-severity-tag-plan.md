# Scenario Severity Tag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the boolean `Scenario.requiresConfirmation` flag with a three-level `severity: 'safe' | 'caution' | 'destructive'` tag. Cockpit renders distinct badges per level and gates the confirmation modal only for `destructive`.

**Architecture:** Hard cut migration — the `Scenario` interface is internal to the `astros_smoke_test/` package with no external consumers, so we change the field once and update all 10 call sites in a single atomic commit. No backward-compat shim. Cockpit modal flow (`ConfirmModal.vue`) is untouched; it just fires for fewer scenarios.

**Tech Stack:** TypeScript (`tsc --noEmit` covers core + web in one pass), Vue 3 single-file components for the cockpit UI, vitest for unit tests, ESLint + Prettier for formatting.

**Design reference:** `.docs/plans/20260425-1240-scenario-severity-tag-design.md`

---

## File Structure

**Modified files (10):**

| File | Responsibility | Change |
|---|---|---|
| `astros_smoke_test/src/core/runner.ts` | Defines `Scenario` interface | Replace `requiresConfirmation?: boolean` with `severity?: ScenarioSeverity`; export the type alias |
| `astros_smoke_test/src/core/scenarios/format-and-sync.ts` | Scenario factory | `requiresConfirmation: true` → `severity: 'destructive'` |
| `astros_smoke_test/src/core/scenarios/full-happy-path.ts` | Scenario factory | same |
| `astros_smoke_test/src/core/scenarios/panic-drill.ts` | Scenario factory | `requiresConfirmation: true` → `severity: 'caution'` |
| `astros_smoke_test/src/core/scenarios/servo-test-sweep.ts` | Scenario factory | same |
| `astros_smoke_test/src/core/scenarios/scenarios.test.ts` | Vitest assertions | Update the destructive-filter test; add explicit per-scenario severity assertions |
| `astros_smoke_test/src/web/server.ts` | Cockpit Express API | `/api/scenarios` returns `severity`; `/api/run/:id` gates only on `severity === 'destructive'` |
| `astros_smoke_test/src/web/ui/api.ts` | Cockpit client types | `ScenarioInfo.requiresConfirmation` → `ScenarioInfo.severity` |
| `astros_smoke_test/src/web/ui/App.vue` | Modal trigger logic | Modal fires only when `severity === 'destructive'` |
| `astros_smoke_test/src/web/ui/components/ScenarioList.vue` | List rendering + badge styles | Render two badge variants conditioned on `severity`; add `.scenario.caution` class + yellow badge CSS |

**New files (1):**

| File | Responsibility |
|---|---|
| `.docs/qa/cockpit.md` | Manual QA checklist for cockpit severity rendering |

**Unmodified:**
- `astros_smoke_test/src/web/ui/components/ConfirmModal.vue` — copy and structure unchanged; it just fires for fewer scenarios.
- All operations, transport, sse, state, CLI files.

---

## Task 1: Atomic severity tag migration

**Why a single task:** the `Scenario` type lives in `core/runner.ts` and is referenced by both core scenario files and cockpit `web/server.ts`. Changing the type forces both sides to update simultaneously — `tsc --noEmit` covers both layers in one pass. Splitting would leave intermediate states that don't compile.

**Files:**
- Modify: `astros_smoke_test/src/core/runner.ts:27-36`
- Modify: `astros_smoke_test/src/core/scenarios/format-and-sync.ts:10`
- Modify: `astros_smoke_test/src/core/scenarios/full-happy-path.ts:23`
- Modify: `astros_smoke_test/src/core/scenarios/panic-drill.ts:21`
- Modify: `astros_smoke_test/src/core/scenarios/servo-test-sweep.ts:22`
- Modify: `astros_smoke_test/src/core/scenarios/scenarios.test.ts:40-51`
- Modify: `astros_smoke_test/src/web/server.ts:140` and `:179-183`
- Modify: `astros_smoke_test/src/web/ui/api.ts:62-66`
- Modify: `astros_smoke_test/src/web/ui/App.vue:45-51`
- Modify: `astros_smoke_test/src/web/ui/components/ScenarioList.vue` (template + styles)

### TDD step ordering rationale

The unit-test-driven loop runs only on the core side (vitest doesn't compile the cockpit Vue files). So:

1. Update tests first to express the new severity expectations.
2. Confirm tests fail (TS compile error or wrong value).
3. Update the type + core scenarios.
4. Confirm tests now pass.
5. Update the cockpit (server + UI) so the full `tsc --noEmit` build is green.
6. Run full lint + typecheck + test suite.
7. Manual smoke against the cockpit.
8. Commit.

### Steps

- [ ] **Step 1: Update test assertions to expect severity values**

  Edit `astros_smoke_test/src/core/scenarios/scenarios.test.ts` lines 40–51 (the existing `'marks exactly the four hardware-risky scenarios as requiring confirmation'` block):

  ```ts
  it('tags scenarios with the right severity', () => {
    const session = makeSession();
    const bySeverity = (level: 'safe' | 'caution' | 'destructive') =>
      Object.values(scenarios)
        .map((f) => f(session))
        .filter((s) => (s.severity ?? 'safe') === level)
        .map((s) => s.id)
        .sort();

    expect(bySeverity('destructive')).toEqual(['format-and-sync', 'full-happy-path'].sort());
    expect(bySeverity('caution')).toEqual(['panic-drill', 'servo-test-sweep'].sort());
    expect(bySeverity('safe')).toEqual(['config-only', 'direct-command-sweep', 'sync-only'].sort());
  });
  ```

  This single assertion replaces the prior destructive-only filter and explicitly classifies every scenario.

- [ ] **Step 2: Run the test to verify it fails**

  Run: `cd astros_smoke_test && npm test -- --run src/core/scenarios/scenarios.test.ts`

  Expected: TypeScript error referencing `severity` not existing on `Scenario`, OR the assertion fails because no scenario has the `severity` field yet. Either failure mode is the green light to proceed.

- [ ] **Step 3: Add the `ScenarioSeverity` type and replace the field in `runner.ts`**

  Edit `astros_smoke_test/src/core/runner.ts` lines 27–36. Replace the existing `Scenario` interface with:

  ```ts
  export type ScenarioSeverity = 'safe' | 'caution' | 'destructive';

  export interface Scenario {
    id: string;
    description: string;
    severity?: ScenarioSeverity;
    setup?: Step[];
    arrange?: Step[];
    act?: Step[];
    verify?: Step[];
    teardown?: Step[];
  }
  ```

  Notes:
  - `severity` is optional with a default of `'safe'` — most safe scenarios omit the field entirely (matches the previous "omit `requiresConfirmation` for non-destructive" pattern).
  - The phase fields (`setup`, `arrange`, `act`, `verify`, `teardown`) are unchanged.

- [ ] **Step 4: Re-tag `format-and-sync.ts`**

  Edit `astros_smoke_test/src/core/scenarios/format-and-sync.ts` line 10:

  ```ts
  // Before
  requiresConfirmation: true,
  // After
  severity: 'destructive',
  ```

- [ ] **Step 5: Re-tag `full-happy-path.ts`**

  Edit `astros_smoke_test/src/core/scenarios/full-happy-path.ts` line 23:

  ```ts
  // Before
  requiresConfirmation: true,
  // After
  severity: 'destructive',
  ```

- [ ] **Step 6: Re-tag `panic-drill.ts`**

  Edit `astros_smoke_test/src/core/scenarios/panic-drill.ts` line 21:

  ```ts
  // Before
  requiresConfirmation: true,
  // After
  severity: 'caution',
  ```

- [ ] **Step 7: Re-tag `servo-test-sweep.ts`**

  Edit `astros_smoke_test/src/core/scenarios/servo-test-sweep.ts` line 22:

  ```ts
  // Before
  requiresConfirmation: true,
  // After
  severity: 'caution',
  ```

- [ ] **Step 8: Update `web/server.ts` — `/api/scenarios` response shape**

  Edit `astros_smoke_test/src/web/server.ts` around line 140. The existing scenario list mapping is:

  ```ts
  const list = listScenarioIds().map((id) => {
    const sc = scenarios[id](fakeSession);
    return {
      id: sc.id,
      description: sc.description,
      requiresConfirmation: sc.requiresConfirmation === true,
    };
  });
  ```

  Change to:

  ```ts
  const list = listScenarioIds().map((id) => {
    const sc = scenarios[id](fakeSession);
    return {
      id: sc.id,
      description: sc.description,
      severity: sc.severity ?? 'safe',
    };
  });
  ```

- [ ] **Step 9: Update `web/server.ts` — `/api/run/:id` confirmation gating**

  Edit `astros_smoke_test/src/web/server.ts` around lines 179–183. The existing block:

  ```ts
  if (scenario.requiresConfirmation && !body.confirm) {
    res.status(409).json({
      message: `Scenario '${id}' is destructive — re-send with { "confirm": true }.`,
    });
    return;
  }
  ```

  Change to:

  ```ts
  if (scenario.severity === 'destructive' && !body.confirm) {
    res.status(409).json({
      message: `Scenario '${id}' is destructive — re-send with { "confirm": true }.`,
    });
    return;
  }
  ```

  Note: `caution` scenarios no longer gate. `destructive` behavior is preserved exactly.

- [ ] **Step 10: Update `web/ui/api.ts` — `ScenarioInfo` type**

  Edit `astros_smoke_test/src/web/ui/api.ts` lines 62–66. Change:

  ```ts
  export interface ScenarioInfo {
    id: string;
    description: string;
    requiresConfirmation: boolean;
  }
  ```

  To:

  ```ts
  export type ScenarioSeverity = 'safe' | 'caution' | 'destructive';

  export interface ScenarioInfo {
    id: string;
    description: string;
    severity: ScenarioSeverity;
  }
  ```

  We declare `ScenarioSeverity` here too (rather than importing from `core/runner.ts`) because the cockpit UI is built by Vite and the core type's `.js` extension import boundary makes cross-package imports awkward. A three-line duplication is preferable to a shared types module just for this.

- [ ] **Step 11: Update `web/ui/App.vue` — modal trigger**

  Edit `astros_smoke_test/src/web/ui/App.vue` lines 45–51. Change:

  ```ts
  function onScenarioRun(scenario: ScenarioInfo): void {
    if (scenario.requiresConfirmation) {
      pendingScenario.value = scenario;
      return;
    }
    void fireRun(scenario, false);
  }
  ```

  To:

  ```ts
  function onScenarioRun(scenario: ScenarioInfo): void {
    if (scenario.severity === 'destructive') {
      pendingScenario.value = scenario;
      return;
    }
    void fireRun(scenario, false);
  }
  ```

- [ ] **Step 12: Update `web/ui/components/ScenarioList.vue` — template**

  Edit the `<button>` element in the template (around lines 49–63). Replace:

  ```html
  <button
    class="scenario"
    :disabled="!runEnabled"
    :class="{ destructive: s.requiresConfirmation }"
    :title="s.description"
    @click="clickRun(s)"
  >
    <span class="name">{{ s.id }}</span>
    <span
      v-if="s.requiresConfirmation"
      class="badge"
      >destructive</span
    >
    <span class="desc">{{ s.description }}</span>
  </button>
  ```

  With:

  ```html
  <button
    class="scenario"
    :disabled="!runEnabled"
    :class="{ destructive: s.severity === 'destructive', caution: s.severity === 'caution' }"
    :title="s.description"
    @click="clickRun(s)"
  >
    <span class="name">{{ s.id }}</span>
    <span
      v-if="s.severity === 'destructive'"
      class="badge badge-destructive"
      >destructive</span
    >
    <span
      v-else-if="s.severity === 'caution'"
      class="badge badge-caution"
      >caution</span
    >
    <span class="desc">{{ s.description }}</span>
  </button>
  ```

- [ ] **Step 13: Update `web/ui/components/ScenarioList.vue` — styles**

  Edit the `<style scoped>` block. The existing single `.badge` rule (around lines 135–145) becomes destructive-specific; add a caution variant and a caution `.name` color.

  Replace:

  ```css
  .badge {
    grid-area: badge;
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    background: #4a1c1c;
    color: #f85149;
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
    align-self: center;
  }
  .scenario.destructive .name {
    color: #f0883e;
  }
  ```

  With:

  ```css
  .badge {
    grid-area: badge;
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
    align-self: center;
  }
  .badge-destructive {
    background: #4a1c1c;
    color: #f85149;
  }
  .badge-caution {
    background: #3a2a08;
    color: #d29922;
  }
  .scenario.destructive .name {
    color: #f0883e;
  }
  .scenario.caution .name {
    color: #d29922;
  }
  ```

  Color choices: `#d29922` is GitHub-dark "warning amber" (the same hue used elsewhere in this UI's color family); `#3a2a08` is its low-contrast background mate.

- [ ] **Step 14: Run lint and prettier**

  Run: `cd astros_smoke_test && npm run lint:fix && npm run prettier:write`

  Expected: no errors. If prettier reformats unrelated files, leave them in the working tree — they'll be handled in step 18.

- [ ] **Step 15: Run typecheck**

  Run: `cd astros_smoke_test && npm run typecheck`

  Expected: clean exit. If TS errors reference `requiresConfirmation` anywhere, you missed a call site — grep `grep -rn "requiresConfirmation" astros_smoke_test/src/` should return only this plan file or commented references.

- [ ] **Step 16: Run the full test suite**

  Run: `cd astros_smoke_test && npm test -- --run`

  Expected: all tests pass (count was 53 before this work; should still be 53 after — the test count is unchanged since we replaced one assertion with one new assertion).

- [ ] **Step 17: Manual cockpit smoke test**

  In one terminal:
  ```bash
  cd astros_smoke_test && SMOKE_LOG=server npm run web:dev
  ```

  Open `http://localhost:5174` in a browser. Verify:
  1. Scenario list renders with badges:
     - `format-and-sync` and `full-happy-path` show a red `destructive` badge.
     - `panic-drill` and `servo-test-sweep` show a yellow `caution` badge.
     - `config-only`, `sync-only`, `direct-command-sweep` show no badge.
  2. Clicking `servo-test-sweep` (without connecting first — just to test the click path): the run is attempted with no confirmation modal. (It will return a 409 "Not connected" error in the run-error banner — that's fine; the point is no modal blocks the click.)
  3. Clicking `format-and-sync`: the existing destructive-confirmation modal appears. Cancel dismisses; clicking Confirm proceeds to the same 409 not-connected state.

  Stop the cockpit (Ctrl-C) once verified.

- [ ] **Step 18: Commit**

  Run:
  ```bash
  cd /home/jeff/Source/astros/AstrOs.Server
  git add astros_smoke_test/src/core/runner.ts \
          astros_smoke_test/src/core/scenarios/format-and-sync.ts \
          astros_smoke_test/src/core/scenarios/full-happy-path.ts \
          astros_smoke_test/src/core/scenarios/panic-drill.ts \
          astros_smoke_test/src/core/scenarios/servo-test-sweep.ts \
          astros_smoke_test/src/core/scenarios/scenarios.test.ts \
          astros_smoke_test/src/web/server.ts \
          astros_smoke_test/src/web/ui/api.ts \
          astros_smoke_test/src/web/ui/App.vue \
          astros_smoke_test/src/web/ui/components/ScenarioList.vue
  git commit -m "$(cat <<'EOF'
  refactor(smoke-test): scenario severity tag (safe/caution/destructive)

  Replace the boolean Scenario.requiresConfirmation flag with a
  three-level severity enum. Caution covers hardware-motion scenarios
  (servos move, no data loss); destructive preserves the existing
  modal-gated behavior for FORMAT_SD scenarios.

  Re-tags:
    format-and-sync, full-happy-path: destructive
    panic-drill, servo-test-sweep:    caution
    config-only, direct-command-sweep, sync-only: safe (default)

  Behavior change: panic-drill and servo-test-sweep no longer trigger
  the confirmation modal — they become click-to-run with a yellow
  badge in the cockpit list. The PANIC button remains the always-
  available safety control.

  Refs: .docs/plans/20260425-1240-scenario-severity-tag-design.md
  EOF
  )"
  ```

  If prettier reformatted unrelated files in step 14, also stage them as a separate `style:` commit before this one (matching the convention from earlier on this branch).

---

## Task 2: Add cockpit manual QA documentation

**Files:**
- Create: `.docs/qa/cockpit.md` (path relative to the repo root, not the smoke-test package)

This adds a permanent QA reference for the cockpit's severity-rendering and modal-gating behavior. The file is brand-new (the `.docs/qa/` directory doesn't exist yet on this branch); it'll be the seed for future cockpit QA cases.

- [ ] **Step 1: Create `.docs/qa/cockpit.md`**

  Create the file with the following content:

  ```markdown
  # Cockpit manual QA

  Tests for the smoke-test cockpit's UI behavior. Run before merging cockpit changes.

  ## Preconditions

  - Smoke-test cockpit running: `cd astros_smoke_test && npm run web:dev`
  - Browser at `http://localhost:5174`
  - AstrOs.Server stopped (so the serial port is free if connection is exercised)
  - Optional: `SMOKE_LOG=server` for server-side debug output

  ## Scenario severity rendering

  1. **Badge colors and presence**
     - `format-and-sync`, `full-happy-path` → red `destructive` badge, name in orange
     - `panic-drill`, `servo-test-sweep` → yellow `caution` badge, name in amber
     - `config-only`, `sync-only`, `direct-command-sweep` → no badge, name in default blue

  2. **Click behavior — safe scenarios**
     - Click `config-only`. The scenario fires immediately. No modal appears.
     - (If not connected, a 409 "Not connected" appears in the run-error banner — that's expected and not part of the badge test.)

  3. **Click behavior — caution scenarios**
     - Click `servo-test-sweep`. The scenario fires immediately. No modal appears.
     - Same for `panic-drill`.
     - The yellow badge is the visual signal; no extra confirmation step.

  4. **Click behavior — destructive scenarios**
     - Click `format-and-sync`. The destructive-confirmation modal appears with the scenario id and description.
     - Click Cancel. The modal dismisses; no run is attempted.
     - Click `format-and-sync` again, then Confirm. The run is attempted (will 409 if not connected).

  5. **Direct API check**
     - With cockpit running, in a terminal:
       ```bash
       curl -X POST http://localhost:5174/api/run/format-and-sync -H 'Content-Type: application/json' -d '{}'
       ```
       Expected: HTTP 409 with body containing `"is destructive"`.
     - Same endpoint with `-d '{"confirm":true}'`: expected to either succeed (returning a `runId`) if connected, or 409 "Not connected" if not. Either way, the destructive guard does not refuse.
     - `curl -X POST http://localhost:5174/api/run/servo-test-sweep -d '{}'`: expected to either succeed or return "Not connected" — never the destructive 409.

  ## Edge cases

  - **Connection state changes mid-list-load.** Connect after the page loads. The scenarios remain visible and become clickable when `connected` flips true.
  - **Active run blocks clicks.** While a run is in progress (`activeRunId` set in state), clicking any scenario is no-op (button disabled). Verify by starting `panic-drill` and immediately clicking `config-only` — the second click is ignored.
  - **Browser refresh.** Refresh the page during a run. The scenario list re-loads from `/api/scenarios`; badges render correctly.
  ```

- [ ] **Step 2: Commit the QA doc**

  Run:
  ```bash
  cd /home/jeff/Source/astros/AstrOs.Server
  git add .docs/qa/cockpit.md
  git commit -m "$(cat <<'EOF'
  docs(qa): cockpit manual QA — scenario severity rendering

  Seeds .docs/qa/cockpit.md with manual checks for the new severity
  badges, modal gating, and the API-side destructive-confirmation
  guard. First entry in a per-feature QA folder per the project's
  CLAUDE.md QA-doc convention.

  Refs: .docs/plans/20260425-1240-scenario-severity-tag-design.md
  EOF
  )"
  ```

---

## Plan progress tracking

Update this checklist in this file as tasks complete; commit the update each time.

- [x] Task 1 — Atomic severity tag migration *(commit `8a3b9d3`; 11 files including a plan-omitted call site — see addendum)*
- [x] Task 2 — Add cockpit manual QA documentation *(commits: comment crumb in api.ts + new .docs/qa/cockpit.md)*

### Addendum to Task 1 (post-implementation)

During execution the implementer found a third call site of `requiresConfirmation` that this plan did not enumerate: `astros_smoke_test/src/cli/index.ts` had three references (the `listCommand` JSON shape, the `[destructive]` tag in plain output, and the `scenarioCommand` confirmation gate). The implementer migrated these in the same commit, parallel to `web/server.ts`:

- `listCommand` now exposes `severity: sc.severity ?? 'safe'` instead of the boolean
- The plain-output tag became `it.severity !== 'safe' ? \` [${it.severity}]\` : ''` (so `caution` scenarios now show a `[caution]` tag in `npm run smoke list`, matching the cockpit list UX)
- `scenarioCommand` gates only when `scenario.severity === 'destructive' && !opts.confirm`

This is the correct extension — leaving the CLI on the boolean would have left it inconsistent with the cockpit and the type. Filed as a plan gap, not a deviation. Total files touched: 11 instead of 10.

---

## Self-review notes

- **Spec coverage:** all sections of the design doc (`20260425-1240-scenario-severity-tag-design.md`) map to either Task 1 (type change, scenario re-tags, server/UI updates, behavior matrix) or Task 2 (QA doc).
- **No placeholders:** every step contains complete code, exact commands, and expected outputs.
- **Type consistency:** `ScenarioSeverity = 'safe' | 'caution' | 'destructive'` is used identically in `core/runner.ts` (Step 3) and `web/ui/api.ts` (Step 10). Field name `severity` is consistent across all 10 modified files.
- **Verification:** Steps 14–17 cover lint, typecheck, full test run, and manual cockpit smoke before commit. Per CLAUDE.md's verification rule: evidence before assertions.
