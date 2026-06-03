# Design: scenario severity tag

> Phase A of the heads-routines work. Phase B is `.docs/plans/20260425-0901-heads-routines-design.md`. This phase ships and merges first so Phase B can use the new tag from day one.

## Context

The `Scenario` interface today carries a single boolean — `requiresConfirmation` — that the cockpit uses to decide whether to render a `[destructive]` badge and gate the run behind a confirmation modal. The flag conflates two genuinely different kinds of risk:

- **Truly destructive operations** that erase or overwrite state (`format-and-sync`, `full-happy-path` — both call FORMAT_SD which wipes the firmware's SD-stored scripts).
- **Hardware motion that needs user awareness but isn't destructive** (`servo-test-sweep`, `panic-drill` — servos move, the bench rig should be checked, but no data is lost).

The two cases want different cockpit treatment: destructive scenarios should require an explicit click-through; hardware-motion scenarios should be visibly tagged but not interrupt the demo flow with a modal. Today they share the same flag and same modal.

The forthcoming heads-routines work (Phase B) adds five new scenarios that all move servos but never destroy data. Adding them under the boolean would either over-warn (triggering a modal that breaks the droid-con demo flow) or under-warn (no badge at all, no signal that hardware motion is about to happen). Neither is right — hence the new tag.

## Goals

1. Replace the boolean with a three-level severity enum that distinguishes destructive operations from hardware-motion advisories from genuinely safe scenarios.
2. Update the cockpit to render distinct badges per level and gate confirmation only for `destructive`.
3. Re-tag the existing seven scenarios into the new model.
4. Land before Phase B (heads routines) so that work can use the new tag without churn.

## Non-goals

- Adding more than three levels. We're not introducing a numeric scale or per-scenario reason fields — a three-state enum captures the actual decision the user makes.
- Adding programmatic safety interlocks (e.g., refusing to run servo-moving scenarios unless a "rig is safe" toggle is checked). Out of scope; manual responsibility.
- Backward-compat shim. The smoke-test package is internal to this repo and has no external consumers; a hard cut is correct.
- Re-styling the existing `ConfirmModal` component. Modal copy and structure unchanged — it just fires for fewer scenarios.

## Architecture

### Type change

`astros_smoke_test/src/core/runner.ts`:

```ts
// Before
export interface Scenario {
  id: string;
  description: string;
  requiresConfirmation?: boolean;
  // ...
}

// After
export type ScenarioSeverity = 'safe' | 'caution' | 'destructive';

export interface Scenario {
  id: string;
  description: string;
  severity?: ScenarioSeverity;   // default: 'safe'
  // ...
}
```

`severity` is optional with a default of `'safe'` — most safe scenarios omit the field entirely (matches the previous "omit `requiresConfirmation` for non-destructive" pattern).

### Cockpit behavior matrix

| Severity | Badge in scenario list | Modal on Run | Run gating |
|---|---|---|---|
| `safe` | none | none | instant |
| `caution` | yellow `[caution]` | **none** | instant (one click) |
| `destructive` | red `[destructive]` | full ConfirmModal | gated on `{ confirm: true }` body |

`safe` and `caution` are both one-click; the difference is the visible badge. Only `destructive` triggers the modal flow.

### Existing scenario re-tagging

| Scenario | Before | After | Reason |
|---|---|---|---|
| `format-and-sync` | `requiresConfirmation: true` | `severity: 'destructive'` | Calls FORMAT_SD which wipes all firmware-stored scripts |
| `full-happy-path` | `requiresConfirmation: true` | `severity: 'destructive'` | Calls FORMAT_SD + full deploy/run pipeline |
| `panic-drill` | `requiresConfirmation: true` | `severity: 'caution'` | Servos move and panic-stop fires; no data loss |
| `servo-test-sweep` | `requiresConfirmation: true` | `severity: 'caution'` | Servos sweep min↔max; no data loss |
| `direct-command-sweep` | (omitted) | `severity: 'safe'` | Padawan LED blink only; no actuator hazard |
| `config-only` | (omitted) | `severity: 'safe'` | Sends config only |
| `sync-only` | (omitted) | `severity: 'safe'` | Registration sync only |

`safe` is the default, so `direct-command-sweep`, `config-only`, and `sync-only` could either omit the field entirely or set it explicitly. **Recommendation: omit when default**, matching the existing convention of omitting `requiresConfirmation` when false.

**Behavior change worth noting.** `panic-drill` and `servo-test-sweep` lose their confirmation modal under this refactor — they become click-to-run with a yellow badge. This is intentional per the demo-floor framing for Phase B, but it is a UX change for two existing scenarios. The PANIC button in the cockpit's top bar remains the always-available safety control.

### Files touched

**Core (TypeScript types + scenario re-tags):**
- `src/core/runner.ts` — replace `requiresConfirmation?: boolean` with `severity?: ScenarioSeverity`; export the type alias
- `src/core/scenarios/format-and-sync.ts` — `requiresConfirmation: true` → `severity: 'destructive'`
- `src/core/scenarios/full-happy-path.ts` — same
- `src/core/scenarios/panic-drill.ts` — `requiresConfirmation: true` → `severity: 'caution'`
- `src/core/scenarios/servo-test-sweep.ts` — same
- `src/core/scenarios/scenarios.test.ts` — assertion that filters confirmation-required scenarios switches to filter by `s.severity === 'destructive'`

**Cockpit server:**
- `src/web/server.ts:140` — `/api/scenarios` response shape: `requiresConfirmation: sc.requiresConfirmation === true` → `severity: sc.severity ?? 'safe'`
- `src/web/server.ts:179-183` — `/api/run/:id` gating: `scenario.requiresConfirmation && !body.confirm` → `scenario.severity === 'destructive' && !body.confirm`; error message updated to keep referring to "destructive"

**Cockpit UI:**
- `src/web/ui/api.ts:65` — `requiresConfirmation: boolean` → `severity: ScenarioSeverity` (or duplicate the union type if a shared type isn't trivially importable across server/client)
- `src/web/ui/components/ScenarioList.vue` — replace `class="{ destructive: s.requiresConfirmation }"` and the single badge with conditional rendering keyed on `s.severity`. Badge markup:
  ```html
  <span v-if="s.severity === 'destructive'" class="badge badge-destructive">destructive</span>
  <span v-else-if="s.severity === 'caution'" class="badge badge-caution">caution</span>
  ```
  Add `.scenario.caution .name` styling alongside the existing `.scenario.destructive .name`. Badge styles: red for destructive (existing), yellow/amber for caution.
- `src/web/ui/App.vue:46` — `if (scenario.requiresConfirmation)` → `if (scenario.severity === 'destructive')`

**Unchanged:**
- `src/web/ui/components/ConfirmModal.vue` — copy and structure stay the same; it just fires for fewer scenarios.
- All operation files; CLI argv/output; transport; sse.

## Tests

**Unit tests (vitest):**

`scenarios/scenarios.test.ts`:
- Existing assertion that filters `requiresConfirmation` scenarios switches to filter by `severity === 'destructive'`
- New assertion: each scenario has the expected `severity` value (`format-and-sync` → `'destructive'`, `panic-drill` → `'caution'`, etc.)
- New assertion: scenarios without an explicit severity default to `safe` (or are reported as `'safe'` from the cockpit's `/api/scenarios`)

No new tests needed for the cockpit UI — the change is purely structural rendering tied to a data field; existing manual QA covers the UX.

## Manual QA

Add a section to `.docs/qa/cockpit.md` (or create one if missing). Bench preconditions: smoke-test cockpit running, port connected, AstrOs.Server stopped.

1. **Scenario list rendering** — open the cockpit. Verify:
   - `format-and-sync`, `full-happy-path` show red `[destructive]` badge.
   - `panic-drill`, `servo-test-sweep` show yellow `[caution]` badge.
   - `config-only`, `sync-only`, `direct-command-sweep` show no badge.
2. **Caution scenarios run with one click** — click `servo-test-sweep`. No modal appears; scenario runs immediately. Same for `panic-drill`.
3. **Destructive scenarios still gate** — click `format-and-sync`. The existing destructive confirmation modal appears; clicking Cancel aborts; clicking Confirm runs the scenario.
4. **Direct API check** — `curl -X POST localhost:5174/api/run/format-and-sync` (no body) returns 409 with the destructive-scenario error message. `curl -X POST localhost:5174/api/run/servo-test-sweep` (no body) succeeds and runs.
5. **Safe scenarios run with one click, no badge** — click `config-only`; runs immediately, no badge in list.

## Risks

- **Cockpit type duplication.** The `ScenarioSeverity` union may not be cleanly importable from `core/runner.ts` into `ui/api.ts` (different TypeScript build context). Acceptable mitigation: redeclare the union string-literal type in `ui/api.ts` and rely on string equality at runtime. Trivial three-line duplication is preferable to introducing a shared types module just for this.
- **Stale cockpit cache.** Browser may cache the prior `/api/scenarios` response shape. Hard refresh resolves; not worth code mitigation for an internal dev tool.
- **Confusion from re-tagging behavior change.** Existing muscle memory of "click `servo-test-sweep` → confirm modal" goes away. Mitigation: the yellow badge is the new visual signal; documented in the QA doc.

## Out of scope (future work)

- Severity-aware logging (auto-emit a server-side `log.warn` when a `caution` scenario runs).
- Severity filters in the scenario list (e.g., "hide caution+destructive" toggle).
- Per-scenario `caution` reason text shown on hover. Could be added later if any scenario's reason becomes non-obvious from its description.
