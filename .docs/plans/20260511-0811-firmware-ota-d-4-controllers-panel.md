# d.4 — Controllers panel (`AstrosFirmwareControllersPanel`)

Phase d, PR 4 of 6. Builds the right-column controllers panel per Direction C: header with select-all/clear, per-controller rows with version-delta + selection checkbox + status pill, and the bottom action/result bar.

Includes four presentational components plus a small wire-up into `firmwareStore` for selection state.

Roadmap reference: `20260507-2153-firmware-ota-d-vue-firmware-view.md`. Design source: `.docs/design_handoff_firmware_update/README.md:176-213` ("Component: `Controllers` panel") + `firmwareDirectionC.jsx:224-380` + `firmwareShared.jsx`.

---

## Scope decisions (confirmed with user)

1. **Action/result bar bundled into d.4** — `ControllersPanel` renders Flash/View-logs/Done buttons. d.5 wires the click handlers to the flash POST and ConfirmModal.
2. **Selection state lives in `firmwareStore`** — `selectedControllerIds: ref<Set<string>>` + `selectAll()`/`clear()`/`toggle(id)` actions. ControllerRow's checkbox v-models against the store. d.5/d.6 inherit a working selection model.
3. **Mock controllers in d.4** — fleet data is hardcoded in Storybook (Body up v1.3.0, Core up v1.4.0, Dome down v1.4.0). d.5 wires the real `stores/controller` Controller list → `FirmwareControllerView` adapter.

---

## Components shipping in d.4

| Component | Folder | Role |
|---|---|---|
| `AstrosFirmwareStatusPill` | `firmware/firmwareStatusPill/` | Small inline pill showing per-controller status (idle/queued/updating/done/failed + select-mode kinds: up-to-date/offline/downgrade). |
| `AstrosFirmwareVersionDelta` | `firmware/firmwareVersionDelta/` | Renders `from → to` with downgrade detection via `compareTags`. Falls back to `current · up to date` when target is null or equal. |
| `AstrosFirmwareControllerRow` | `firmware/firmwareControllerRow/` | One row: checkbox (select mode) or status pill (progress mode), badge, name + master pill + online-status dot, version delta below. |
| `AstrosFirmwareControllersPanel` | `firmware/firmwareControllersPanel/` | Card with header (eyebrow + select-all/clear ghost buttons), rows, action/result bar. |

Plus:
- New `FirmwareControllerView` type in `types/firmware.ts` — the presentation-layer shape (id, label, current version, online status, master flag).
- `firmwareStore` additions: `controllers`, `selectedControllerIds`, `selectAll`, `clear`, `toggle`, `target` computed (derived from `selectedReleaseTag` or `uploadedFilename` per `sourceMode`), `anyDowngradeBlocked` computed, `canFlash` computed.
- New i18n keys under `firmware_view.controllers.*`.
- Barrel exports for all four components + the `FirmwareControllerView` type.

---

## Type shape (draft for `types/firmware.ts`)

```ts
export type ControllerOnlineStatus = 'up' | 'down' | 'needsSynced';

/** Presentation-layer view of a controller for the firmware-update flow. */
export interface FirmwareControllerView {
  id: string;
  label: string;            // 'Body' / 'Core' / 'Dome'
  glyph: string;            // single-letter badge: 'B', 'C', 'D'
  current: string;          // semver tag, e.g. 'v1.4.0'
  status: ControllerOnlineStatus;
  isMaster: boolean;
}

export type FirmwareStatusPillKind =
  | 'idle'
  | 'queued'
  | 'updating'
  | 'done'
  | 'failed'
  | 'upToDate'
  | 'offline'
  | 'downgrade';
```

`FirmwareControllerView` deliberately mirrors `TopologyController`'s minimalism but adds version + status (which TopologyController doesn't need). d.5 will define the `Controller → FirmwareControllerView` adapter; d.4 ships only the type.

---

## firmwareStore additions

```ts
// State
const controllers = ref<FirmwareControllerView[]>([]);
const selectedControllerIds = ref<ReadonlySet<string>>(new Set());

// Selection actions — always build a fresh Set and assign; never mutate in place.
function toggle(id: string): void {
  const next = new Set(selectedControllerIds.value);
  if (next.has(id)) next.delete(id); else next.add(id);
  selectedControllerIds.value = next;
}
function selectAll(): void { /* fresh Set of non-blocked ids */ }
function clear(): void { selectedControllerIds.value = new Set(); }

// Reconcile: prune orphan selected ids when controllers is reassigned.
watch(controllers, ...);

// Computeds
const target = computed<string | null>(() =>
  sourceMode.value === 'github' ? selectedReleaseTag.value : (uploadedFilename.value ? 'local-build' : null)
);
const anyDowngradeBlocked = computed(() => /* iterate selected, check compareTags(current, target) > 0 */);
const canFlash = computed(() => target.value !== null && selectedControllerIds.value.size > 0 && !anyDowngradeBlocked.value);
```

**Reactivity note:** `toggle/selectAll/clear` cannot mutate the Set in place — Vue tracks the ref value, not Set methods. Pattern: build a fresh Set from the prior one, then assign. The d.3 round-2 review surfaced this gotcha; d.4 applies the same fix and pins it with three reference-replacement tests.

---

## Tasks

- [x] Add i18n keys under `firmware_view.controllers.*` (eyebrow, select-all/clear, master pill, downgrade pill, up-to-date suffix, status-dot aria, pill labels, action-bar copy, result-bar copy).
- [x] Define `FirmwareControllerView`, `ControllerOnlineStatus`, `FirmwareStatusPillKind` in `types/firmware.ts`.
- [x] Extend `firmwareStore`: `controllers`, `selectedControllerIds` (`ReadonlySet<string>`), `target`/`anyDowngradeBlocked`/`canFlash` computeds, `toggle/selectAll/clear` actions, plus a `watch(controllers)` reconciler that prunes orphan selected ids. Unit tests cover Set-replacement reactivity (all three actions), downgrade detection (NaN + cmp===0 boundary), canFlash combinatorics, and the reconciler.
- [x] Implement `AstrosFirmwareStatusPill` (.vue + stories). Single prop: `kind: FirmwareStatusPillKind`.
- [x] Implement `AstrosFirmwareVersionDelta` (.vue + stories + unit tests). Props: `current`, `target`. Renders `current · up to date` or `current → target` with conditional downgrade styling + pill.
- [x] Implement `AstrosFirmwareControllerRow` (types.ts + .vue + stories). Props: `controller`, `target`, `mode: 'select' | 'progress'`, `selected: boolean`, optional `progressStatus`/`stageLabel` for progress mode. Emits `@toggle`. The select-mode right-column pill (`selectModePillKind`) is extracted to a sibling pure module with its own unit-test matrix (offline > downgrade > upToDate > null priority).
- [x] Implement `AstrosFirmwareControllersPanel` (.vue + stories). Reads from firmwareStore (controllers, selectedControllerIds, target, canFlash, anyDowngradeBlocked). Takes `phase` as a prop (d.5 will move it to the store). Dev-mode `watchEffect` warns on null target / missing progress entries in non-select phases. Renders header, rows, action/result bar. Emits `@flash` / `@view-logs` / `@done`.
- [x] Barrel export from `components/firmware/index.ts`.
- [x] Pre-commit gates: prettier, lint, build, vitest run, per-commit `pr-review-toolkit:code-reviewer` agent pass, then commit.
- [x] Pre-push: `/pr-review-toolkit:review-pr` 5-agent pass. Critical: 0. Important: addressed in a fixup commit (reconciler, dev warnings, JSDoc tightening, selectModePillKind extraction + tests, cmp===0 boundary test, dead i18n keys dropped, task-history comment removed, SelectTargetNoSelection story).

---

## Out of scope

- `ConfirmModal` — d.5.
- `StagesList` — d.5.
- Page assembly (mounting in `FirmwareView`) — d.5.
- Flash POST + ConfirmModal flow — d.5.
- Wire `firmwareStore.controllers` from the real `stores/controller` Controller list — d.5 needs to define the adapter.
- WS dispatcher / live in-flight rendering — d.6.
- `compareTags` helper — already shipped in d.2 (`utils/version.ts`).
- `AstrosFirmwareButton` (FwBtn) — already shipped in d.2.

---

## Verification

1. `npm run build` (type-check).
2. `npx vitest run` — new tests for `firmwareStore` selection / downgrade computeds + `AstrosFirmwareVersionDelta` downgrade rendering must pass; existing 56 tests must keep passing.
3. `npm run storybook` — visually confirm each component renders across its stories:
   - `AstrosFirmwareStatusPill`: one story per `kind` (8 stories).
   - `AstrosFirmwareVersionDelta`: `UpToDate`, `Upgrade`, `Downgrade`, `NoTarget`.
   - `AstrosFirmwareControllerRow`: `SelectModeUpToDate`, `SelectModeUpgrade`, `SelectModeDowngrade`, `SelectModeOffline`, `ProgressModeQueued`, `ProgressModeUpdating`, `ProgressModeDone`, `ProgressModeFailed`.
   - `AstrosFirmwareControllersPanel`: `SelectInitial`, `SelectWithTarget`, `SelectAllSelected`, `SelectWithDowngrade`, `Flashing`, `Done`, `FailedCore`.
4. Pre-push: `/pr-review-toolkit:review-pr` 5-agent pass; address Critical/Important.

---

## FMI inventory — skipped

This is a presentational + small-store-mutation PR. No filesystem state, concurrency, network I/O, or crash recovery to inventory. Standard CRUD-shape changes only.

---

## Risks

1. **`firmwareStore.controllers` shape leaking ahead of d.5's controllers-store adapter.** Mitigation: `FirmwareControllerView` is named to make the presentation-layer nature obvious; d.5's adapter is a small known piece of d.5 work. If the controllers store adds firmware-version metadata before d.5 ships, this view shape may converge with it — that's fine.
2. **Set reactivity (same gotcha as d.3 round-2).** Mitigation: `toggle/selectAll/clear` actions always replace the Set, never mutate in place. Unit-test that mutating the store from outside the actions triggers the expected re-render (or fails closed in a documented way).
3. **`AstrosFirmwareControllersPanel` reads `phase` as a prop (not store) in d.4.** d.5 will move it to the store. Risk: d.5 has to update the prop wiring. Mitigation: document the prop as `// TODO(d.5): read from firmwareStore.phase` and use the prop name `phase` matching the eventual store field.
4. **Downgrade detection on malformed tags.** `compareTags` returns NaN on malformed input and `NaN > 0` is false — a malformed `current` silently passes the downgrade guard. Mitigation: `AstrosFirmwareVersionDelta` uses `Number.isNaN(compareTags(...))` and shows neither upgrade nor downgrade styling in that case (still renders the bare strings). Unit-test the NaN path.
5. **i18n key explosion.** ~16 new keys for one component family. Mitigation: group them under `firmware_view.controllers.*` and `firmware_view.controllers.action_bar.*` / `result_bar.*` namespaces.

---

## Critical files

- `.docs/design_handoff_firmware_update/README.md:176-213` — Controllers panel spec.
- `.docs/design_handoff_firmware_update/firmwareDirectionC.jsx:224-380` — JSX reference (ControllerRow, panel container, action bar).
- `.docs/design_handoff_firmware_update/firmwareShared.jsx` — `FwStatusPill`, `CtrlStatusDot`, `VersionDelta`, sample fleet data.
- `astros_vue/src/stores/firmware.ts` — extension point.
- `astros_vue/src/utils/version.ts` — `compareTags` already exists; do NOT re-implement.
- `astros_vue/src/components/firmware/firmwareButton/AstrosFirmwareButton.vue` — primary/secondary/ghost button (use for action bar).
- `astros_vue/src/components/firmware/firmwareTopology/` — naming + folder convention reference.

---

## Per-PR plan files (Phase D index)

- d.1 → `20260507-2153-firmware-ota-d-1-page-chrome.md` ✅ merged
- d.2 → `20260509-1716-firmware-ota-d-2-source-strip.md` ✅ merged
- d.3 → `20260511-0651-firmware-ota-d-3-topology.md` ✅ on develop
- d.4 → **this file**
- d.5 → TBD
- d.6 → TBD
