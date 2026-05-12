# d.5 — Page assembly + `StagesList` + `ConfirmModal` + flash POST

Phase d, PR 5 of 6. Wires d.1–d.4's presentational pieces into `FirmwareView`, adds the two remaining components (`StagesList`, `ConfirmModal`), moves the phase state machine into `firmwareStore`, and posts the flash request to the server. WS dispatcher (live in-flight rendering) defers to d.6.

Roadmap reference: `20260507-2153-firmware-ota-d-vue-firmware-view.md`.
Design source: `.docs/design_handoff_firmware_update/README.md:149-222` (StagesList + ConfirmModal) + `firmwareDirectionC.jsx:264-340` (StagesList) + `firmwareDirectionA.jsx:253-` (ConfirmModal reused).

---

## Scope decisions (confirmed with user)

1. **Phase state moves to `firmwareStore`** in d.5. `phase: ref<FirmwarePhase>` (`'idle' | 'select' | 'flashing' | 'done' | 'failed'`) + transition actions. d.6 inherits a working state machine; FirmwareView drops its local `phase` ref.
2. **Storybook-only stage progression.** Each panel/stage-list story is a snapshot of one phase. No timer-driven progression. d.6 wires real progression via WS.
3. **Inline error banner** in `ControllersPanel` for flash POST failures. Server's typed error reasons (`job_already_running`, `release_not_found`, etc.) map to i18n keys; the banner shows the localized copy + a retry button. Phase stays `select` on error.
4. **Dev-only fleet mock** in `FirmwareView.onMounted` populates `firmwareStore.controllers` with a sample fleet (Body / Core / Dome) when `import.meta.env.DEV` is true. d.6 replaces with the real `stores/controller` → `FirmwareControllerView` adapter.

---

## Scope

### New components

| Component | Folder | Role |
|---|---|---|
| `AstrosFirmwareStagesList` | `firmware/firmwareStagesList/` | Card listing 5 stages (download / transfer / flash / verify / reboot). State-driven row highlights: done (✓), current (yellow + "IN PROGRESS"), failed (! + red row), idle. |
| `AstrosFirmwareConfirmModal` | `firmware/firmwareConfirmModal/` | Modal dialog triggered by Flash button. Lists source + target controllers, warns not to cut power. Cancel / Push firmware buttons. Focus trap + ESC + focus restore. |

### Page assembly

- `FirmwareView.vue` renamed concept: subtitle reads from `firmwareStore.phase`. Drops local `phase` ref. Mounts `SourceStrip` (always visible), `Topology` + `StagesList` (left column ~380px when flashing/done/failed; topology-only in select), `ControllersPanel` (right column, flex 1). Below 960px viewport, single column.
- Dev-only `onMounted` populates `firmwareStore.controllers` with sample fleet.
- Wires Flash button → opens `ConfirmModal` → on confirm calls `firmwareStore.startFlash()`.

### `firmwareStore` additions

```ts
// State
const phase = ref<FirmwarePhase>('idle');
const currentStage = ref<FirmwareStage | null>(null);          // d.5: mocked via story args; d.6: WS-driven
const flashError = ref<FlashErrorEnvelope | null>(null);
const failedController = ref<{ id: string; label: string; stage: FirmwareStage } | null>(null);

// Actions
function setPhase(next: FirmwarePhase): void;
function resetToSelect(): void;                                 // clears phase/currentStage/flashError/failedController
function dismissError(): void;                                  // clears flashError only
async function startFlash(): Promise<void>;                     // POST /api/firmware/flash; transitions phase on response
async function cancelFlash(reason?: string): Promise<void>;     // DELETE /api/firmware/flash
```

### Types (`types/firmware.ts`)

```ts
export type FirmwarePhase = 'idle' | 'select' | 'flashing' | 'done' | 'failed';

export type FirmwareStage = 'download' | 'transfer' | 'flash' | 'verify' | 'reboot';

export type FlashErrorReason =
  | 'invalid_body'
  | 'job_already_running'
  | 'no_controllers'
  | 'variant_mismatch'
  | 'variant_unknown'
  | 'release_not_found'
  | 'asset_not_found'
  | 'no_upload'
  | 'release_lookup_failed'
  | 'source_resolution_failed'
  | 'controllers_lookup_failed'
  | 'subscriber_attach_failed'
  | 'protocol_violation'
  | 'streamer_unknown_error'
  | 'internal_server_error'
  | 'network_error';

export interface FlashErrorEnvelope {
  reason: FlashErrorReason;
  detail?: string;
  currentJobId?: string;
}
```

`FlashErrorReason` is the union of server `FlashOrchestratorErrorReason` values that map to HTTP statuses the client cares about (400/409/500), plus `internal_server_error` (catch-all 500) and `network_error` (no response received). Post-streamer reasons (`hash_mismatch`, `chunk_retry_exhausted`, etc.) are deliberately omitted — those surface on WS in d.6, not via the HTTP error envelope.

---

## Out of scope

- WS dispatcher / live in-flight rendering → d.6.
- Real `controllers`-store → `FirmwareControllerView` adapter → d.6.
- Lock-aware `AstrosWriteButton` extension → d.6.
- Lock banner in `AstrosLayout` → d.6.
- Discriminated-union prop tightening for `ControllersPanelProps` (deferred from d.4 review) → d.6 once consumers exist.
- Upload-mode flash POST functionality — server-side upload route is its own pre-d phase; d.5 ships the UI but Browse Files won't post.

---

## Tasks

- [ ] Add i18n keys: `firmware_view.stages.*` (label + hint per stage + `in_progress` badge), `firmware_view.confirm_modal.*` (title, body copy, cancel, confirm, power-warning), `firmware_view.flash_errors.*` (one entry per `FlashErrorReason`).
- [ ] Add `FirmwarePhase`, `FirmwareStage`, `FlashErrorReason`, `FlashErrorEnvelope` to `types/firmware.ts`. Add `FIRMWARE_FLASH` constant to `api/endpoints.ts`.
- [ ] Extend `firmwareStore`: add `phase`, `currentStage`, `flashError`, `failedController` refs; add `setPhase`, `resetToSelect`, `dismissError`, `startFlash`, `cancelFlash` actions. Initial phase is `'idle'`; transitions to `'select'` when `controllers.length > 0` (handled by the dev-mock populate or by d.6's WS-snapshot). Unit-test phase transitions + flash POST error mapping (success → flashing; 409 → flashError.reason='job_already_running'; network failure → flashError.reason='network_error').
- [ ] Implement `AstrosFirmwareStagesList` (`types.ts` + `.vue` + stories). Props: `currentStage: FirmwareStage | null`, `phase: FirmwarePhase`, `failedStage?: FirmwareStage`. Renders 5 stage rows with state-driven styling. Stories: `Idle`, `Flashing` (currentStage='transfer'), `Done`, `Failed` (failedStage='transfer').
- [ ] Implement `AstrosFirmwareConfirmModal` (`types.ts` + `.vue` + stories). Props: `open: boolean`, `target: string | null`, `selectedControllers: FirmwareControllerView[]`. Emits `cancel` / `confirm`. A11y: focus trap (use `vue-focus-trap` if present, else implement manually with a `Tab` key listener), ESC closes, click-backdrop closes, focus restore to trigger on close. `aria-modal="true"`, `role="dialog"`, `aria-labelledby` points at title. Stories: `OpenSingleController`, `OpenAllControllers`, `OpenUploadSource`.
- [ ] Add **flash error banner** rendering inside `AstrosFirmwareControllersPanel`. Reads `firmwareStore.flashError`. Renders above the action bar when non-null. Includes localized error copy + a "Try again" / "Dismiss" affordance. Update the panel's stories with a `SelectWithFlashError` variant.
- [ ] Update `FirmwareView.vue`: subtitle from store phase; two-column layout (`Topology + StagesList` left, `ControllersPanel` right); below 960px → single column; mount `ConfirmModal` and wire `@flash` → open modal → on confirm → `firmwareStore.startFlash()`; dev-only fleet mock in `onMounted`.
- [ ] Barrel exports: add `AstrosFirmwareStagesList`, `AstrosFirmwareConfirmModal` + their types to `components/firmware/index.ts`.
- [ ] Pre-commit gates: format, lint, type-check, vitest, per-commit `pr-review-toolkit:code-reviewer` agent.
- [ ] Pre-push: `/pr-review-toolkit:review-pr` 5-agent pass (mandatory per CLAUDE.md). Address Critical/Important findings before push.

---

## Implementation notes

### `StagesList` design

Stages defined as a module constant:

```ts
// firmwareStagesList/stages.ts
export const FIRMWARE_STAGES = ['download', 'transfer', 'flash', 'verify', 'reboot'] as const;
```

Index mapping by phase (per the design handoff's "Index mapping by phase"):
- `phase === 'flashing'` → use `currentStage` prop (mocked in d.5 stories; WS-driven in d.6)
- `phase === 'done'` → all 5 marked done
- `phase === 'failed'` → `failedStage` prop is the failing one; earlier stages done; later stages idle
- `phase === 'select' | 'idle'` → component not rendered at all (parent v-if)

Row state derivation lives in `stageRowState(stage, currentStage, phase, failedStage)` pure helper → extract to a sibling module → unit-test all 5×4 = 20 combinations.

### ConfirmModal a11y

Per CLAUDE.md a11y rules:
- `role="dialog" aria-modal="true" aria-labelledby="<title-id>"` on the card.
- ESC keydown listener attached when `open === true` only (avoid leaking listeners).
- Click on backdrop (NOT card) closes via Cancel emit.
- **Focus trap:** when modal opens, focus first focusable element (Cancel button). Tab and Shift-Tab cycle within modal. On close, restore focus to the element that had focus when the modal opened (the Flash button).
- Don't use `vue-focus-trap` if not already installed — implement manually with a `<div ref="firstFocus" tabindex="0">` sentinel at start/end of the modal and `keydown.tab` handler. ~25 lines.

### Flash POST flow

```ts
async function startFlash(): Promise<void> {
  if (!canFlash.value) return; // defense in depth; button is also disabled
  flashError.value = null;
  const body = sourceMode.value === 'github'
    ? { source: { kind: 'github', version: selectedReleaseTag.value } }
    : { source: { kind: 'upload' } };
  try {
    setPhase('flashing');
    await apiService.post(FIRMWARE_FLASH, body);
    // Note: HTTP 200 means orchestrator.start() resolved; the WS dispatcher
    // owns subsequent state. In d.5 with no WS wired, we stay in 'flashing'
    // until the user manually resets — that's why d.5 only ships static
    // story snapshots, not a running app preview.
  } catch (error) {
    setPhase('select');
    flashError.value = mapHttpErrorToEnvelope(error);
  }
}
```

`mapHttpErrorToFlashEnvelope` lives in `utils/firmwareFlashError.ts` (extracted to a pure module for unit-testability — same pattern as d.3's `strokeFor` and d.4's `selectModePillKind`). It:
- Parses axios `error.response.status` + `error.response.data` into a `FlashErrorEnvelope`.
- Falls back to `{ reason: 'network_error' }` on no-response.
- Falls back to `{ reason: 'internal_server_error' }` on unrecognized response shape.

6 unit tests in `utils/__tests__/firmwareFlashError.spec.ts` cover the no-response, malformed-response, recognized-reason, detail/currentJobId-preservation, and unknown-reason-fallback paths.

### Dev-only fleet mock

```ts
// FirmwareView.vue
onMounted(async () => {
  await firmware.fetchReleases();
  if (import.meta.env.DEV && firmware.controllers.length === 0) {
    firmware.controllers = [
      { id: 'body', label: 'Body', glyph: 'B', current: 'v1.3.0', status: 'up', isMaster: true },
      { id: 'core', label: 'Core', glyph: 'C', current: 'v1.4.0', status: 'up', isMaster: false },
      { id: 'dome', label: 'Dome', glyph: 'D', current: 'v1.4.0', status: 'up', isMaster: false },
    ];
  }
  // Transition idle → select once controllers are loaded.
  if (firmware.controllers.length > 0 && firmware.phase === 'idle') {
    firmware.setPhase('select');
  }
});
```

The mock is gated by `import.meta.env.DEV` — Vite strips the entire block in production. d.6 replaces this with the real adapter.

---

## A11y (forward-looking — per project memory `project_a11y_pass`)

- `ConfirmModal` is the first modal in this feature flow; the a11y discipline above is load-bearing for the upcoming a11y pass.
- `StagesList` rows have semantic structure: each row has `role="listitem"` inside a `role="list"` wrapper; the current/failed rows include `aria-current="step"` or `aria-invalid="true"` respectively.
- Flash error banner: `role="alert"` (so screen readers announce on appearance) + `aria-live="polite"`.

---

## Verification

1. `npm run build` succeeds.
2. `npx vitest run` — new tests for `firmwareStore` phase transitions, flash-error mapping, and `stageRowState` helper must pass; existing 89 tests keep passing.
3. `npm run storybook` — visually confirm each new story:
   - `AstrosFirmwareStagesList`: `Idle`, `Flashing`, `Done`, `Failed`.
   - `AstrosFirmwareConfirmModal`: open, all three source variants render correctly; ESC + click-backdrop close; focus trap holds.
   - `AstrosFirmwareControllersPanel.SelectWithFlashError`: red banner above action bar with retry.
4. Dev preview: `npm run dev`, navigate to `/firmware`, verify:
   - SourceStrip + Topology + ControllersPanel render with mock fleet.
   - Picking a release and selecting controllers enables the Flash button.
   - Clicking Flash opens the modal; Cancel returns to select; Confirm POSTs to the API and either:
     - On success (200): the page transitions to `flashing` and stays there (d.6 will wire live progression).
     - On failure (4xx/5xx): the page stays in `select` and shows the localized error banner.
5. A11y spot check: keyboard-only navigation through the page, ESC closes modal, focus returns to the Flash button after modal close, screen reader announces flash error banner.
6. Pre-push toolkit: 5-agent pass; address Critical/Important.

---

## FMI inventory — required (per CLAUDE.md)

This PR touches **network I/O** (flash POST) and **modal lifecycle** (ConfirmModal listeners). Filling in the failure-mode inventory:

| Hazard | Risk | Coverage |
|---|---|---|
| **Network**: POST /flash hangs forever | UI stuck in `flashing` with no recovery | axios timeout config (check existing apiService default); on timeout, set phase back to `select` with `network_error` envelope |
| **Network**: POST returns unexpected payload shape | `mapHttpErrorToEnvelope` mis-classifies | helper falls back to `internal_server_error`; explicit unit test for malformed responses |
| **Concurrency**: User double-clicks Flash | Two POSTs in flight | `startFlash` returns early when `phase === 'flashing'`; button disabled while in flight; explicit test |
| **Modal lifecycle**: ESC handler leaks after unmount | Memory leak / stray listener | listener attached/detached in `watchEffect` keyed on `open` prop; explicit unit test |
| **Modal lifecycle**: Focus restore fails when trigger is unmounted | Focus stuck on body | `restoreFocus()` checks `triggerEl.isConnected` before refocusing |
| **State**: User navigates away during `flashing` | View unmount discards phase state | acceptable — phase lives in Pinia store, survives route change; flash continues server-side |
| **State**: Story Pinia setup leaks across renders | Stories show stale state | reuse the `setupStore()` pattern from d.4 stories (verified working) |

---

## Risks

1. **Modal focus management** is hand-rolled. If `vue-focus-trap` (or similar) is already in deps, prefer it. Check `package.json` before writing manual implementation.
2. **`startFlash` HTTP error mapping** depends on the server returning a stable `error` field. The server controller is stable on develop (we just read it). Document any drift in the d.6 plan.
3. **`phase` initial state.** Setting `phase = 'idle'` and transitioning to `'select'` in `FirmwareView.onMounted` couples the state machine to the view's lifecycle. If d.6 needs the store to enter `'flashing'` on cold-load with a job in flight (the late-join scenario from the master roadmap §"Late-join"), the store must be able to start in non-idle state. Mitigation: `fetchCurrentJob()` (d.6 work) is the natural place to set the initial phase from server state — d.5's idle→select transition is just the bootstrap path.
4. **Dev fleet mock** could leak into prod if `import.meta.env.DEV` is mis-evaluated. Verify Vite strips the block in a production build (`npm run build`, then grep `dist/` for "Body / Core / Dome").
5. **Responsive single-column** at <960px — design handoff line 247 calls it out but says "not expected to be mobile-friendly, but should not break." Implement with a CSS `@media` query; verify in DevTools responsive mode.
6. **`StagesList` rendering when `phase === 'failed'` and `failedStage` is null** — design handoff doesn't explicitly say. Default behavior: treat as all-idle with no failure highlight. Add a dev-mode `console.warn` mirror of d.4's pattern when this combo happens.

---

## Critical files

- `astros_vue/src/views/FirmwareView.vue` — page assembly target.
- `astros_vue/src/stores/firmware.ts` — phase state + actions go here.
- `astros_vue/src/components/firmware/firmwareControllersPanel/AstrosFirmwareControllersPanel.vue` — flash error banner addition.
- `astros_api/src/controllers/firmware_flash_controller.ts:1-115` — error response shape (read-only; do not modify).
- `astros_api/src/models/firmware/flash_orchestrator.ts:17-19` — `FlashRequest` body shape.
- `.docs/design_handoff_firmware_update/README.md:149-222` — StagesList + ConfirmModal spec.
- `astros_vue/src/api/apiService.ts` — axios instance for the POST/DELETE calls.

---

## Per-PR plan files (Phase D index)

- d.1 → `20260507-2153-firmware-ota-d-1-page-chrome.md` ✅ merged
- d.2 → `20260509-1716-firmware-ota-d-2-source-strip.md` ✅ merged
- d.3 → `20260511-0651-firmware-ota-d-3-topology.md` ✅ merged
- d.4 → `20260511-0811-firmware-ota-d-4-controllers-panel.md` ✅ merged
- d.5 → **this file**
- d.6 → TBD (WS dispatcher + live wiring + lock-aware UI + e2e)

## QA test plan

Per user direction (see roadmap doc): the comprehensive manual QA plan lives at `.docs/qa/firmware-ota-flash-ui.md` and is written at **d.6 completion** when the feature is end-to-end testable in the running app. d.5's verification section (above) covers d.5's own scope; the operator-flow QA waits.
