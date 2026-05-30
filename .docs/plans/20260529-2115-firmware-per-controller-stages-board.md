# Per-Controller Firmware STAGES Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **STATUS: ✅ COMPLETE** — all 7 tasks shipped on branch `feature/firmware-stages-board` (off `develop`). Full suite 611 tests green, `vue-tsc` + `vite build` clean. Per-commit + pre-push 5-agent review applied; Important + consistency findings fixed.
>
> **Deferred follow-up (your call):** a controller that fails *before any stage maps* (`FAILED` with a null stage — e.g. fails while `QUEUED`) renders its board column as all-idle (looks "not started"). This is **equivalent to the old single-track list's behavior** and the failure is still surfaced via the topology highlight + the controllers-panel result bar, so it's not a regression. A column-level failure treatment (e.g. a `failed` flag on `StageColumnModel`) would close the gap but is a UX enhancement beyond the design mockup. Current behavior is pinned by a test so any future change is deliberate.

**Goal:** Replace the single shared firmware-update STAGES list with a per-controller STAGES board (one column per fleet controller: Body/MASTER, Core/PADAWAN, Dome/NOT IN UPDATE), each column showing that controller's own progression and percent.

**Architecture:** The per-controller data already lives in the store (`controllerStates`, keyed by slot, each with its own server stage + `bytesSent`/`totalBytes`). We add a pure derivation helper (`controllerStageColumn`) that turns one controller's state into a 5-row column model, project it in the store as `stageBoard`, and render it with two thin layout components (`AstrosFirmwareStagesBoard` → `AstrosFirmwareStageColumn`). The old `AstrosFirmwareStagesList` (single global track) and the orphaned `downloadPercent` projection are deleted. Source strip, topology, and controllers panel are untouched.

**Tech Stack:** Vue 3 `<script setup>`, Pinia, vue-i18n, Vitest + @vue/test-utils, Storybook.

---

## Design / Context (brainstormed, approved 2026-05-29)

The screenshot's only structural change vs. today's UI is the STAGES section. Everything else (source strip gated to `phase === 'select'`, topology, controllers panel pills) stays exactly as is — confirmed with the user.

**Per-column semantics:**
- **Master** column step 1 = **Download** ("Master receives file"); **padawan** step 1 = greyed **"Master only"** (`—` glyph, N/A — padawans never download, the master forwards the binary).
- Step 2 label = **"Transfer"** on master, **"Receive"** on padawans (same stage id `transfer` underneath; same hint "Master → padawans").
- A controller not in the current job renders its whole column greyed with role line **"NOT IN UPDATE"**.
- **Percent** shows on byte-bearing stages only (Download for master, Transfer/Receive): live percent while `current` (e.g. Core Receive 54%), `100%` when `done` (e.g. Body Download 100%). Verify/Flash/Reboot never show a percent.

**Stage order** (already canonical): `download → transfer → verify → flash → reboot`.

**Layout:** the board moves full-width below the Topology+Controllers row (a 3-column board doesn't fit the 380px left column). Gated exactly as the old list was: visible only in `flashing` / `done` / `failed`.

**Data availability (verified):** `flash_orchestrator.ts handleDeployProgress` applies `FW_PROGRESS` per-controller (`payload.controllerId`) with each controller's own `bytesSent`/`totalBytes`, so per-padawan receive percent is real.

**Failure rendering:** the wire `FAILED` state carries no stage, so a failed column's failed-row is sourced from the store's `failedControllers[].stage` (the same global-stage-at-failure approximation the old list used).

---

## File Structure

**Create:**
- `astros_vue/src/utils/firmwareStageBoard.ts` — pure logic: the moved `stageRowState` state machine **plus** the new `controllerStageColumn` derivation + its types. Store-consumed pure logic belongs in `utils/` (mirrors `firmwareStageMapping.ts`).
- `astros_vue/src/utils/__tests__/firmwareStageBoard.spec.ts` — moved `stageRowState` tests + new `controllerStageColumn` tests.
- `astros_vue/src/components/firmware/firmwareStageColumn/AstrosFirmwareStageColumn.vue` — one controller's column (badge header + role line + 5 rows).
- `astros_vue/src/components/firmware/firmwareStageColumn/AstrosFirmwareStageColumn.stories.ts`
- `astros_vue/src/components/firmware/firmwareStageColumn/__tests__/AstrosFirmwareStageColumn.spec.ts`
- `astros_vue/src/components/firmware/firmwareStagesBoard/AstrosFirmwareStagesBoard.vue` — STAGES card + responsive grid of columns.
- `astros_vue/src/components/firmware/firmwareStagesBoard/AstrosFirmwareStagesBoard.stories.ts`
- `astros_vue/src/components/firmware/firmwareStagesBoard/__tests__/AstrosFirmwareStagesBoard.spec.ts`

**Modify:**
- `astros_vue/src/locales/enUS.json` — `stages` block: add `receive`, `master_only`, `not_in_update`; update `transfer.hint` and `verify.hint` to match the mockup.
- `astros_vue/src/stores/firmware.ts` — remove `downloadPercent`; add `stageBoard` computed.
- `astros_vue/src/stores/__tests__/firmware.spec.ts` — drop the `downloadPercent` describe block; add a `stageBoard` describe block.
- `astros_vue/src/components/firmware/index.ts` — drop `AstrosFirmwareStagesList`; add `AstrosFirmwareStagesBoard` + `StageColumnModel` type re-export.
- `astros_vue/src/views/FirmwareView.vue` — swap component import + binding (`downloadPercent` → `stageBoard`); move board full-width below the grid.
- `astros_vue/src/views/__tests__/FirmwareView.spec.ts` — rename the stub `AstrosFirmwareStagesList` → `AstrosFirmwareStagesBoard`.

**Delete (after FirmwareView no longer references them):**
- `astros_vue/src/components/firmware/firmwareStagesList/AstrosFirmwareStagesList.vue`
- `astros_vue/src/components/firmware/firmwareStagesList/AstrosFirmwareStagesList.stories.ts`
- `astros_vue/src/components/firmware/firmwareStagesList/stageRowState.ts` (moved to utils)
- `astros_vue/src/components/firmware/firmwareStagesList/__tests__/AstrosFirmwareStagesList.spec.ts`
- `astros_vue/src/components/firmware/firmwareStagesList/__tests__/stageRowState.spec.ts` (moved to utils)

All commands run from `astros_vue/`.

---

## Task 1: i18n keys for the per-controller board

**Files:**
- Modify: `astros_vue/src/locales/enUS.json:127-150` (the `firmware_view.stages` block)

- [ ] **Step 1: Replace the `stages` block**

Replace the existing block (lines 127–150) with:

```json
    "stages": {
      "eyebrow_title": "STAGES",
      "in_progress": "IN PROGRESS",
      "not_in_update": "NOT IN UPDATE",
      "master_only": "Master only",
      "download": {
        "label": "Download",
        "hint": "Master receives file"
      },
      "transfer": {
        "label": "Transfer",
        "hint": "Master → padawans"
      },
      "receive": {
        "label": "Receive",
        "hint": "Master → padawans"
      },
      "flash": {
        "label": "Flash",
        "hint": "Write firmware"
      },
      "verify": {
        "label": "Verify",
        "hint": "Checksum binary"
      },
      "reboot": {
        "label": "Reboot",
        "hint": "Restart"
      }
    },
```

- [ ] **Step 2: Verify JSON parses**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | head -5` (no JSON error) or `node -e "JSON.parse(require('fs').readFileSync('src/locales/enUS.json','utf8')); console.log('ok')"`
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add src/locales/enUS.json
git commit -m "i18n(firmware): add per-controller STAGES board keys (receive, master_only, not_in_update)"
```

---

## Task 2: Pure derivation helper (`firmwareStageBoard.ts`) — TDD

This is pure logic → tests first. We move the existing `stageRowState` machine (already tested) into the new module unchanged, move its test, then add `controllerStageColumn` test-first.

**Files:**
- Create: `astros_vue/src/utils/firmwareStageBoard.ts`
- Create: `astros_vue/src/utils/__tests__/firmwareStageBoard.spec.ts`

- [ ] **Step 1: Write `firmwareStageBoard.ts`**

```typescript
import type {
  ControllerFlashStateBySlot,
  FirmwareControllerView,
  FirmwarePhase,
  FirmwareStage,
  SlotId,
} from '@/types/firmware';
import { mapServerStageToUiStage } from '@/utils/firmwareStageMapping';

// ---- Shared stage order + single-track row state machine ----
// (moved verbatim from the deleted firmwareStagesList/stageRowState.ts)
export const FIRMWARE_STAGES = ['download', 'transfer', 'verify', 'flash', 'reboot'] as const;

export type StageRowState = 'idle' | 'done' | 'current' | 'failed';

export interface StageRowStateInput {
  stage: FirmwareStage;
  phase: FirmwarePhase;
  currentStage: FirmwareStage | null;
  failedStage: FirmwareStage | null;
}

export function stageRowState(input: StageRowStateInput): StageRowState {
  const { stage, phase, currentStage, failedStage } = input;
  const index = FIRMWARE_STAGES.indexOf(stage);
  if (phase === 'done') return 'done';
  if (phase === 'failed') {
    if (failedStage === null) return 'idle';
    const failedIndex = FIRMWARE_STAGES.indexOf(failedStage);
    if (failedIndex === -1) return 'idle';
    if (index < failedIndex) return 'done';
    if (index === failedIndex) return 'failed';
    return 'idle';
  }
  if (phase === 'flashing') {
    if (currentStage === null) return 'idle';
    const currentIndex = FIRMWARE_STAGES.indexOf(currentStage);
    if (currentIndex === -1) return 'idle';
    if (index < currentIndex) return 'done';
    if (index === currentIndex) return 'current';
    return 'idle';
  }
  return 'idle';
}

// ---- Per-controller board derivation ----

// 'na' = stage doesn't apply to this controller (padawan Download).
export type StageBoardRowState = StageRowState | 'na';

// 'idle' role = controller is not part of the current job ("NOT IN UPDATE").
export type StageColumnRole = 'master' | 'padawan' | 'idle';

export interface StageBoardRow {
  stage: FirmwareStage;
  state: StageBoardRowState;
  /** 1-based badge number (rendered only for idle/queued/pending rows). */
  index: number;
  /** i18n key path for the row label; resolved by the column component. */
  labelKey: string;
  /** i18n key path for the row hint. */
  hintKey: string;
  /** Integer 0..100 for byte-bearing rows (download[master]/transfer); null otherwise. */
  percent: number | null;
}

export interface StageColumnModel {
  id: SlotId;
  label: string;
  glyph: string;
  isMaster: boolean;
  role: StageColumnRole;
  participating: boolean;
  rows: StageBoardRow[];
}

export interface ControllerStageColumnOptions {
  /** The UI stage the job was on when this controller failed, sourced from
   *  the store's `failedControllers` summary. Used only when the controller's
   *  state is FAILED — drives which row renders the failure glyph. The wire
   *  FAILED state carries no stage, so this is the global-stage approximation
   *  (same one the old single-track list used). */
  failedStage?: FirmwareStage | null;
}

// Stages whose progress is byte-driven: the master Download (file lands on the
// master) and the Transfer/Receive (master → padawans). Verify/Flash/Reboot
// are not byte-progress stages, so they never show a percent.
const BYTE_BEARING_STAGES: ReadonlySet<FirmwareStage> = new Set<FirmwareStage>(['download', 'transfer']);

function clampPercent(bytesSent: number | undefined, totalBytes: number | undefined): number | null {
  if (typeof totalBytes !== 'number' || totalBytes <= 0) return null;
  if (typeof bytesSent !== 'number') return null;
  // Clamp so a stale bytesSent overflow can't render as "117%".
  return Math.round(Math.max(0, Math.min(1, bytesSent / totalBytes)) * 100);
}

// Project one controller's server-side state onto the (phase, currentStage,
// failedStage) triple the row state machine consumes.
function deriveProgress(
  state: ControllerFlashStateBySlot | undefined,
  failedStage: FirmwareStage | null,
): { phase: FirmwarePhase; currentStage: FirmwareStage | null; failedStage: FirmwareStage | null } {
  if (state === undefined) return { phase: 'idle', currentStage: null, failedStage: null };
  switch (state.stage) {
    case 'QUEUED':
      // Accepted but nothing started — every row pending.
      return { phase: 'flashing', currentStage: null, failedStage: null };
    case 'UPLOADING_TO_MASTER':
    case 'SENDING':
    case 'VERIFYING':
    case 'FLASHING':
    case 'REBOOTING':
      return {
        phase: 'flashing',
        currentStage: mapServerStageToUiStage(state.stage),
        failedStage: null,
      };
    case 'FINALIZING':
      // Post-reboot heartbeat wait — surface Reboot as the active row.
      return { phase: 'flashing', currentStage: 'reboot', failedStage: null };
    case 'VERSION_CONFIRMED':
      return { phase: 'done', currentStage: null, failedStage: null };
    case 'FAILED':
      return { phase: 'failed', currentStage: null, failedStage };
  }
}

/**
 * Build the 5-row column model for a single controller.
 *
 * Role rules applied on top of the row state machine:
 *  - Padawan Download row → 'na' ("Master only"); padawans never download.
 *  - Step-2 label = "Transfer" (master) / "Receive" (padawan); same stage id.
 *  - Percent attaches only to byte-bearing rows: live % while current, 100% when done.
 */
export function controllerStageColumn(
  controller: Pick<FirmwareControllerView, 'id' | 'label' | 'glyph' | 'isMaster'>,
  state: ControllerFlashStateBySlot | undefined,
  options: ControllerStageColumnOptions = {},
): StageColumnModel {
  const { isMaster } = controller;
  const progress = deriveProgress(state, options.failedStage ?? null);
  // `'bytesSent' in state` narrows to the in-flight union arm that carries bytes.
  const bytes = state !== undefined && 'bytesSent' in state ? state : null;

  const rows: StageBoardRow[] = FIRMWARE_STAGES.map((stage, i) => {
    let rowState: StageBoardRowState = stageRowState({
      stage,
      phase: progress.phase,
      currentStage: progress.currentStage,
      failedStage: progress.failedStage,
    });
    if (stage === 'download' && !isMaster) rowState = 'na';

    const labelKey =
      stage === 'transfer'
        ? isMaster
          ? 'firmware_view.stages.transfer.label'
          : 'firmware_view.stages.receive.label'
        : `firmware_view.stages.${stage}.label`;

    const hintKey =
      stage === 'download' && !isMaster
        ? 'firmware_view.stages.master_only'
        : stage === 'transfer'
          ? isMaster
            ? 'firmware_view.stages.transfer.hint'
            : 'firmware_view.stages.receive.hint'
          : `firmware_view.stages.${stage}.hint`;

    let percent: number | null = null;
    if (BYTE_BEARING_STAGES.has(stage)) {
      if (rowState === 'current') {
        percent = bytes !== null ? clampPercent(bytes.bytesSent, bytes.totalBytes) : null;
      } else if (rowState === 'done') {
        percent = 100;
      }
    }

    return { stage, state: rowState, index: i + 1, labelKey, hintKey, percent };
  });

  return {
    id: controller.id,
    label: controller.label,
    glyph: controller.glyph,
    isMaster,
    role: state === undefined ? 'idle' : isMaster ? 'master' : 'padawan',
    participating: state !== undefined,
    rows,
  };
}
```

- [ ] **Step 2: Write `firmwareStageBoard.spec.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import {
  FIRMWARE_STAGES,
  stageRowState,
  controllerStageColumn,
  type StageColumnModel,
} from '@/utils/firmwareStageBoard';
import type { ControllerFlashStateBySlot, FirmwareControllerView } from '@/types/firmware';

// ---------- moved stageRowState coverage ----------
function rowStates(phase: 'flashing' | 'done' | 'failed', current: any, failed: any = null) {
  return FIRMWARE_STAGES.map((stage) =>
    stageRowState({ stage, phase, currentStage: current, failedStage: failed }),
  );
}

describe('stageRowState', () => {
  it('marks earlier stages done, current stage current, later idle (flashing)', () => {
    // order: download, transfer, verify, flash, reboot
    expect(rowStates('flashing', 'verify')).toEqual(['done', 'done', 'current', 'idle', 'idle']);
  });

  it('marks all rows done when phase is done', () => {
    expect(rowStates('done', null)).toEqual(['done', 'done', 'done', 'done', 'done']);
  });

  it('marks the failed stage failed, earlier done, later idle', () => {
    expect(rowStates('failed', null, 'transfer')).toEqual(['done', 'failed', 'idle', 'idle', 'idle']);
  });

  it('renders all idle when flashing with null current stage', () => {
    expect(rowStates('flashing', null)).toEqual(['idle', 'idle', 'idle', 'idle', 'idle']);
  });

  it('renders all idle when failed with null failed stage', () => {
    expect(rowStates('failed', null, null)).toEqual(['idle', 'idle', 'idle', 'idle', 'idle']);
  });
});

// ---------- controllerStageColumn ----------
const master: Pick<FirmwareControllerView, 'id' | 'label' | 'glyph' | 'isMaster'> = {
  id: 'body',
  label: 'Body',
  glyph: 'B',
  isMaster: true,
};
const padawan: Pick<FirmwareControllerView, 'id' | 'label' | 'glyph' | 'isMaster'> = {
  id: 'core',
  label: 'Core',
  glyph: 'C',
  isMaster: false,
};

function byStage(col: StageColumnModel, stage: string) {
  const row = col.rows.find((r) => r.stage === stage);
  if (row === undefined) throw new Error(`no row for ${stage}`);
  return row;
}

describe('controllerStageColumn — not in update', () => {
  it('renders role idle / not-participating when state is undefined', () => {
    const col = controllerStageColumn(padawan, undefined);
    expect(col.role).toBe('idle');
    expect(col.participating).toBe(false);
  });

  it('still marks padawan Download as na when not in update', () => {
    const col = controllerStageColumn(padawan, undefined);
    expect(byStage(col, 'download').state).toBe('na');
    expect(byStage(col, 'download').hintKey).toBe('firmware_view.stages.master_only');
  });
});

describe('controllerStageColumn — master', () => {
  it('marks Download current with live percent while uploading', () => {
    const state: ControllerFlashStateBySlot = {
      controllerId: 'body',
      stage: 'UPLOADING_TO_MASTER',
      bytesSent: 50,
      totalBytes: 100,
    };
    const col = controllerStageColumn(master, state);
    expect(col.role).toBe('master');
    expect(byStage(col, 'download').state).toBe('current');
    expect(byStage(col, 'download').percent).toBe(50);
    expect(byStage(col, 'transfer').labelKey).toBe('firmware_view.stages.transfer.label');
  });

  it('marks completed Download as done with 100% once sending', () => {
    const state: ControllerFlashStateBySlot = {
      controllerId: 'body',
      stage: 'SENDING',
      bytesSent: 10,
      totalBytes: 100,
    };
    const col = controllerStageColumn(master, state);
    expect(byStage(col, 'download').state).toBe('done');
    expect(byStage(col, 'download').percent).toBe(100);
    expect(byStage(col, 'transfer').state).toBe('current');
  });
});

describe('controllerStageColumn — padawan', () => {
  it('renders Download na (Master only) and Receive current with live percent', () => {
    const state: ControllerFlashStateBySlot = {
      controllerId: 'core',
      stage: 'SENDING',
      bytesSent: 54,
      totalBytes: 100,
    };
    const col = controllerStageColumn(padawan, state);
    expect(col.role).toBe('padawan');
    expect(byStage(col, 'download').state).toBe('na');
    const receive = byStage(col, 'transfer');
    expect(receive.state).toBe('current');
    expect(receive.percent).toBe(54);
    expect(receive.labelKey).toBe('firmware_view.stages.receive.label');
    expect(receive.hintKey).toBe('firmware_view.stages.receive.hint');
  });

  it('marks all real steps done on VERSION_CONFIRMED but keeps Download na', () => {
    const state: ControllerFlashStateBySlot = {
      controllerId: 'core',
      stage: 'VERSION_CONFIRMED',
      finalVersion: 'v1.4.2',
    };
    const col = controllerStageColumn(padawan, state);
    expect(byStage(col, 'download').state).toBe('na');
    expect(byStage(col, 'transfer').state).toBe('done');
    expect(byStage(col, 'reboot').state).toBe('done');
  });
});

describe('controllerStageColumn — failed', () => {
  it('uses the supplied failedStage to mark the failure row', () => {
    const state: ControllerFlashStateBySlot = {
      controllerId: 'body',
      stage: 'FAILED',
      error: 'hash_mismatch',
    };
    const col = controllerStageColumn(master, state, { failedStage: 'verify' });
    expect(byStage(col, 'verify').state).toBe('failed');
    expect(byStage(col, 'download').state).toBe('done');
    expect(byStage(col, 'reboot').state).toBe('idle');
  });
});
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run src/utils/__tests__/firmwareStageBoard.spec.ts`
Expected: PASS (all describes green).

- [ ] **Step 4: Commit**

```bash
git add src/utils/firmwareStageBoard.ts src/utils/__tests__/firmwareStageBoard.spec.ts
git commit -m "feat(firmware): pure per-controller stage-column derivation"
```

---

## Task 3: Store — replace `downloadPercent` with `stageBoard` — TDD

**Files:**
- Modify: `astros_vue/src/stores/firmware.ts` (imports ~line 7-11; remove `downloadPercent` ~line 996-1012 and its return ~line 1041; add `stageBoard`)
- Modify: `astros_vue/src/stores/__tests__/firmware.spec.ts` (replace the `downloadPercent` describe block ~line 2302-2394)

- [ ] **Step 1: Replace the `downloadPercent` store test block with `stageBoard` tests**

In `src/stores/__tests__/firmware.spec.ts`, delete the entire `describe('downloadPercent', ...)` block (lines ~2302-2394) and replace with:

```typescript
  describe('stageBoard', () => {
    it('returns one column per fleet controller', () => {
      const store = useFirmwareStore();
      expect(store.stageBoard.map((c) => c.id)).toEqual(['body', 'core', 'dome']);
    });

    it('marks controllers without a live state as not-in-update (role idle)', () => {
      const store = useFirmwareStore();
      // No flash in flight → every column is idle/not-participating.
      for (const col of store.stageBoard) {
        expect(col.role).toBe('idle');
        expect(col.participating).toBe(false);
      }
    });

    it('projects a participating controller using its own live stage', () => {
      const store = useFirmwareStore();
      store.applyJobStarted({
        jobId: 'job-1',
        source: { kind: 'github', version: 'v1.4.2' },
        startedAt: '2026-05-29T00:00:00Z',
        controllers: [{ controllerId: BODY_MAC, stage: 'SENDING', bytesSent: 30, totalBytes: 100 }],
      });
      const body = store.stageBoard.find((c) => c.id === 'body');
      expect(body?.role).toBe('master');
      expect(body?.participating).toBe(true);
      const transfer = body?.rows.find((r) => r.stage === 'transfer');
      expect(transfer?.state).toBe('current');
      expect(transfer?.percent).toBe(30);
    });
  });
```

> Note: this block relies on the same fleet/MAC fixtures the rest of `firmware.spec.ts` already sets up (a controller store seeded so `BODY_MAC` resolves to slot `body`). Reuse the existing `BODY_MAC` constant and `beforeEach` controller-store seeding already present in the file. If the existing suite uses a different fixture name or helper to apply a started job, match it — read the top of the file before writing.

- [ ] **Step 2: Run to verify the new block fails (no `stageBoard` yet)**

Run: `npx vitest run src/stores/__tests__/firmware.spec.ts -t stageBoard`
Expected: FAIL — `store.stageBoard` is undefined.

- [ ] **Step 3: Edit the store**

In `src/stores/firmware.ts`:

(a) Add to the import from `@/utils/firmwareStageMapping` group a new import below it:

```typescript
import { controllerStageColumn } from '@/utils/firmwareStageBoard';
import type { StageColumnModel } from '@/utils/firmwareStageBoard';
```

(b) Delete the entire `downloadPercent` computed (the block starting `// Integer percentage 0..100 for the serial-upload step.` through its closing `});`, ~lines 996-1012).

(c) In its place add:

```typescript
  // Per-controller STAGES board projection. One column per fleet controller;
  // controllers absent from `controllerStates` render as "NOT IN UPDATE".
  // Failure rows are sourced from `failedControllers` (the wire FAILED state
  // carries no stage). Mirrors the `progressByControllerId` projection pattern.
  const stageBoard = computed<StageColumnModel[]>(() => {
    const failedStageById = new Map<SlotId, FirmwareStage | null>(
      failedControllers.value.map((f) => [f.id, f.stage]),
    );
    return controllers.value.map((c) =>
      controllerStageColumn(c, controllerStates.value.get(c.id), {
        failedStage: failedStageById.get(c.id) ?? null,
      }),
    );
  });
```

(d) In the `return { ... }` object, remove the `downloadPercent,` line and add `stageBoard,` (next to `progressByControllerId,`).

- [ ] **Step 4: Run the store tests**

Run: `npx vitest run src/stores/__tests__/firmware.spec.ts`
Expected: PASS (no remaining `downloadPercent` references; `stageBoard` block green).

- [ ] **Step 5: Commit**

```bash
git add src/stores/firmware.ts src/stores/__tests__/firmware.spec.ts
git commit -m "feat(firmware): store stageBoard projection; drop orphaned downloadPercent"
```

---

## Task 4: `AstrosFirmwareStageColumn` component (one controller's column)

UI layout → component built, then a focused smoke test + stories (per the project's TDD-exception for layout).

**Files:**
- Create: `astros_vue/src/components/firmware/firmwareStageColumn/AstrosFirmwareStageColumn.vue`
- Create: `astros_vue/src/components/firmware/firmwareStageColumn/AstrosFirmwareStageColumn.stories.ts`
- Create: `astros_vue/src/components/firmware/firmwareStageColumn/__tests__/AstrosFirmwareStageColumn.spec.ts`

- [ ] **Step 1: Write the component**

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { StageColumnModel } from '@/utils/firmwareStageBoard';

const props = defineProps<{ column: StageColumnModel }>();
const { t } = useI18n();

const roleLabel = computed(() => {
  switch (props.column.role) {
    case 'master':
      return t('firmware_view.topology.role_master');
    case 'padawan':
      return t('firmware_view.topology.role_padawan');
    case 'idle':
      return t('firmware_view.stages.not_in_update');
  }
  return '';
});
</script>

<template>
  <div
    :class="['astros-firmware-stage-column', { 'astros-firmware-stage-column--idle': column.role === 'idle' }]"
    role="group"
    :aria-label="`${column.label} ${roleLabel}`"
  >
    <header class="astros-firmware-stage-column__header">
      <span
        :class="[
          'astros-firmware-stage-column__badge',
          column.isMaster
            ? 'astros-firmware-stage-column__badge--master'
            : 'astros-firmware-stage-column__badge--padawan',
        ]"
        aria-hidden="true"
        >{{ column.glyph }}</span
      >
      <div class="astros-firmware-stage-column__id">
        <span class="astros-firmware-stage-column__name">{{ column.label }}</span>
        <span class="astros-firmware-stage-column__role">{{ roleLabel }}</span>
      </div>
    </header>

    <ul
      class="astros-firmware-stage-column__rows"
      role="list"
    >
      <li
        v-for="row in column.rows"
        :key="row.stage"
        :class="['astros-firmware-stage-column__row', `astros-firmware-stage-column__row--${row.state}`]"
        role="listitem"
        :aria-current="row.state === 'current' ? 'step' : undefined"
        :aria-invalid="row.state === 'failed' ? 'true' : undefined"
      >
        <span
          :class="['astros-firmware-stage-column__bullet', `astros-firmware-stage-column__bullet--${row.state}`]"
          aria-hidden="true"
        >
          <template v-if="row.state === 'done'">✓</template>
          <template v-else-if="row.state === 'failed'">!</template>
          <template v-else-if="row.state === 'na'">—</template>
          <template v-else>{{ row.index }}</template>
        </span>
        <div class="astros-firmware-stage-column__text">
          <span class="astros-firmware-stage-column__label">{{ t(row.labelKey) }}</span>
          <span class="astros-firmware-stage-column__hint">{{ t(row.hintKey) }}</span>
        </div>
        <span
          v-if="row.state === 'current'"
          class="astros-firmware-stage-column__progress astros-firmware-stage-column__progress--current"
        >
          <template v-if="row.percent !== null">{{ row.percent }}%</template>
          <template v-else>{{ t('firmware_view.stages.in_progress') }}</template>
        </span>
        <span
          v-else-if="row.percent !== null"
          class="astros-firmware-stage-column__progress astros-firmware-stage-column__progress--done"
          >{{ row.percent }}%</span
        >
      </li>
    </ul>
  </div>
</template>

<style scoped>
.astros-firmware-stage-column {
  display: flex;
  flex-direction: column;
  background: #ffffff;
  border: 1px solid #d6e0e6;
  border-radius: 6px;
  font-family: 'Inter', system-ui, sans-serif;
  min-width: 0;
}

.astros-firmware-stage-column--idle {
  opacity: 0.55;
}

.astros-firmware-stage-column__header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid #d6e0e6;
}

.astros-firmware-stage-column__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 4px;
  font-family: ui-monospace, 'SF Mono', monospace;
  font-weight: 700;
  font-size: 13px;
  flex-shrink: 0;
}

.astros-firmware-stage-column__badge--master {
  background: #2a5a97;
  color: #ffffff;
}

.astros-firmware-stage-column__badge--padawan {
  background: #cbdce1;
  color: #2a5a97;
}

.astros-firmware-stage-column__id {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.astros-firmware-stage-column__name {
  font-size: 13px;
  font-weight: 700;
  color: #0e1726;
}

.astros-firmware-stage-column__role {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #4b5b73;
}

.astros-firmware-stage-column__rows {
  list-style: none;
  margin: 0;
  padding: 0;
}

.astros-firmware-stage-column__row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-top: 1px solid #eef3f6;
}

.astros-firmware-stage-column__row:first-child {
  border-top: none;
}

.astros-firmware-stage-column__row--current {
  background: #fff8e8;
}

.astros-firmware-stage-column__row--failed {
  background: #fbe0e0;
}

.astros-firmware-stage-column__bullet {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  font-size: 10px;
  font-weight: 700;
  flex-shrink: 0;
}

.astros-firmware-stage-column__bullet--idle,
.astros-firmware-stage-column__bullet--na {
  background: #e3edf2;
  color: #4b5b73;
}

.astros-firmware-stage-column__bullet--done {
  background: #3aa676;
  color: #ffffff;
}

.astros-firmware-stage-column__bullet--current {
  background: #e5a93a;
  color: #ffffff;
}

.astros-firmware-stage-column__bullet--failed {
  background: #cf4242;
  color: #ffffff;
}

.astros-firmware-stage-column__text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  flex: 1;
  min-width: 0;
}

.astros-firmware-stage-column__label {
  font-size: 12px;
  font-weight: 600;
  color: #0e1726;
}

.astros-firmware-stage-column__row--na .astros-firmware-stage-column__label,
.astros-firmware-stage-column__row--na .astros-firmware-stage-column__hint {
  color: #93a3b3;
}

.astros-firmware-stage-column__hint {
  font-size: 10px;
  color: #4b5b73;
}

.astros-firmware-stage-column__progress {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  flex-shrink: 0;
}

.astros-firmware-stage-column__progress--current {
  color: #7d5a14;
  text-transform: uppercase;
}

.astros-firmware-stage-column__progress--done {
  color: #1f6e44;
}
</style>
```

- [ ] **Step 2: Write the smoke test**

```typescript
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import enUS from '@/locales/enUS.json';
import AstrosFirmwareStageColumn from '../AstrosFirmwareStageColumn.vue';
import { controllerStageColumn } from '@/utils/firmwareStageBoard';
import type { ControllerFlashStateBySlot, FirmwareControllerView } from '@/types/firmware';

function i18n() {
  return createI18n({ legacy: false, locale: 'enUS', fallbackLocale: 'enUS', messages: { enUS } });
}
const padawan: Pick<FirmwareControllerView, 'id' | 'label' | 'glyph' | 'isMaster'> = {
  id: 'core',
  label: 'Core',
  glyph: 'C',
  isMaster: false,
};

function mountCol(state: ControllerFlashStateBySlot | undefined, opts = {}) {
  return mount(AstrosFirmwareStageColumn, {
    global: { plugins: [i18n()] },
    props: { column: controllerStageColumn(padawan, state, opts) },
  });
}

describe('AstrosFirmwareStageColumn', () => {
  it('renders the padawan Download row as "Master only" with a dash bullet', () => {
    const wrapper = mountCol(undefined);
    const naRow = wrapper.find('.astros-firmware-stage-column__row--na');
    expect(naRow.exists()).toBe(true);
    expect(naRow.text()).toContain('Master only');
    expect(naRow.find('.astros-firmware-stage-column__bullet--na').text()).toBe('—');
  });

  it('shows the live percent on the current Receive row', () => {
    const wrapper = mountCol({ controllerId: 'core', stage: 'SENDING', bytesSent: 54, totalBytes: 100 });
    const current = wrapper.find('.astros-firmware-stage-column__row--current');
    expect(current.text()).toContain('Receive');
    expect(current.find('.astros-firmware-stage-column__progress--current').text()).toBe('54%');
  });

  it('labels a not-in-update column as NOT IN UPDATE', () => {
    const wrapper = mountCol(undefined);
    expect(wrapper.text()).toContain('NOT IN UPDATE');
    expect(wrapper.find('.astros-firmware-stage-column--idle').exists()).toBe(true);
  });
});
```

- [ ] **Step 3: Write the stories**

```typescript
import type { Meta, StoryObj } from '@storybook/vue3-vite';
import AstrosFirmwareStageColumn from './AstrosFirmwareStageColumn.vue';
import { controllerStageColumn } from '@/utils/firmwareStageBoard';

const meta = {
  title: 'Components/Firmware/AstrosFirmwareStageColumn',
  component: AstrosFirmwareStageColumn,
  parameters: { layout: 'padded' },
  decorators: [
    (story) => ({
      components: { story },
      template: '<div style="background:#f2f7fa;padding:24px;max-width:320px;"><story /></div>',
    }),
  ],
} satisfies Meta<typeof AstrosFirmwareStageColumn>;

export default meta;
type Story = StoryObj<typeof meta>;

const body = { id: 'body', label: 'Body', glyph: 'B', isMaster: true } as const;
const core = { id: 'core', label: 'Core', glyph: 'C', isMaster: false } as const;
const dome = { id: 'dome', label: 'Dome', glyph: 'D', isMaster: false } as const;

export const MasterTransferring: Story = {
  args: { column: controllerStageColumn(body, { controllerId: 'body', stage: 'SENDING', bytesSent: 0, totalBytes: 100 }) },
};

export const PadawanReceiving: Story = {
  args: { column: controllerStageColumn(core, { controllerId: 'core', stage: 'SENDING', bytesSent: 54, totalBytes: 100 }) },
};

export const NotInUpdate: Story = {
  args: { column: controllerStageColumn(dome, undefined) },
};

export const Done: Story = {
  args: { column: controllerStageColumn(core, { controllerId: 'core', stage: 'VERSION_CONFIRMED', finalVersion: 'v1.4.2' }) },
};
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/components/firmware/firmwareStageColumn/__tests__/AstrosFirmwareStageColumn.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/firmware/firmwareStageColumn/
git commit -m "feat(firmware): AstrosFirmwareStageColumn per-controller column"
```

---

## Task 5: `AstrosFirmwareStagesBoard` component (the STAGES card + grid)

**Files:**
- Create: `astros_vue/src/components/firmware/firmwareStagesBoard/AstrosFirmwareStagesBoard.vue`
- Create: `astros_vue/src/components/firmware/firmwareStagesBoard/AstrosFirmwareStagesBoard.stories.ts`
- Create: `astros_vue/src/components/firmware/firmwareStagesBoard/__tests__/AstrosFirmwareStagesBoard.spec.ts`

- [ ] **Step 1: Write the component**

```vue
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import AstrosFirmwareStageColumn from '../firmwareStageColumn/AstrosFirmwareStageColumn.vue';
import type { StageColumnModel } from '@/utils/firmwareStageBoard';

defineProps<{ columns: StageColumnModel[] }>();
const { t } = useI18n();
</script>

<template>
  <section
    class="astros-firmware-stages-board"
    :aria-label="t('firmware_view.stages.eyebrow_title')"
  >
    <header class="astros-firmware-stages-board__header">
      <span class="astros-firmware-stages-board__eyebrow">{{ t('firmware_view.stages.eyebrow_title') }}</span>
    </header>
    <div class="astros-firmware-stages-board__grid">
      <AstrosFirmwareStageColumn
        v-for="col in columns"
        :key="col.id"
        :column="col"
      />
    </div>
  </section>
</template>

<style scoped>
.astros-firmware-stages-board {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.astros-firmware-stages-board__header {
  padding: 2px 2px;
}

.astros-firmware-stages-board__eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #4b5b73;
}

.astros-firmware-stages-board__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
  gap: 16px;
}

@media (max-width: 720px) {
  .astros-firmware-stages-board__grid {
    grid-template-columns: 1fr;
  }
}
</style>
```

- [ ] **Step 2: Write the smoke test**

```typescript
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import enUS from '@/locales/enUS.json';
import AstrosFirmwareStagesBoard from '../AstrosFirmwareStagesBoard.vue';
import { controllerStageColumn } from '@/utils/firmwareStageBoard';

function i18n() {
  return createI18n({ legacy: false, locale: 'enUS', fallbackLocale: 'enUS', messages: { enUS } });
}

describe('AstrosFirmwareStagesBoard', () => {
  it('renders one column per supplied model', () => {
    const columns = [
      controllerStageColumn({ id: 'body', label: 'Body', glyph: 'B', isMaster: true }, { controllerId: 'body', stage: 'SENDING', bytesSent: 0, totalBytes: 100 }),
      controllerStageColumn({ id: 'core', label: 'Core', glyph: 'C', isMaster: false }, { controllerId: 'core', stage: 'SENDING', bytesSent: 54, totalBytes: 100 }),
      controllerStageColumn({ id: 'dome', label: 'Dome', glyph: 'D', isMaster: false }, undefined),
    ];
    const wrapper = mount(AstrosFirmwareStagesBoard, {
      global: { plugins: [i18n()] },
      props: { columns },
    });
    expect(wrapper.findAll('.astros-firmware-stage-column')).toHaveLength(3);
    expect(wrapper.text()).toContain('STAGES');
  });
});
```

- [ ] **Step 3: Write the stories**

```typescript
import type { Meta, StoryObj } from '@storybook/vue3-vite';
import AstrosFirmwareStagesBoard from './AstrosFirmwareStagesBoard.vue';
import { controllerStageColumn } from '@/utils/firmwareStageBoard';

const meta = {
  title: 'Components/Firmware/AstrosFirmwareStagesBoard',
  component: AstrosFirmwareStagesBoard,
  parameters: { layout: 'padded' },
  decorators: [
    (story) => ({
      components: { story },
      template: '<div style="background:#f2f7fa;padding:24px;max-width:1100px;"><story /></div>',
    }),
  ],
} satisfies Meta<typeof AstrosFirmwareStagesBoard>;

export default meta;
type Story = StoryObj<typeof meta>;

const body = { id: 'body', label: 'Body', glyph: 'B', isMaster: true } as const;
const core = { id: 'core', label: 'Core', glyph: 'C', isMaster: false } as const;
const dome = { id: 'dome', label: 'Dome', glyph: 'D', isMaster: false } as const;

// Mirrors the design mockup: Body transferring, Core receiving at 54%, Dome idle.
export const MidUpdate: Story = {
  args: {
    columns: [
      controllerStageColumn(body, { controllerId: 'body', stage: 'SENDING', bytesSent: 0, totalBytes: 100 }),
      controllerStageColumn(core, { controllerId: 'core', stage: 'SENDING', bytesSent: 54, totalBytes: 100 }),
      controllerStageColumn(dome, undefined),
    ],
  },
};
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/components/firmware/firmwareStagesBoard/__tests__/AstrosFirmwareStagesBoard.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/firmware/firmwareStagesBoard/
git commit -m "feat(firmware): AstrosFirmwareStagesBoard per-controller STAGES grid"
```

---

## Task 6: Wire into FirmwareView, update barrel, delete old StagesList

**Files:**
- Modify: `astros_vue/src/components/firmware/index.ts:8` and `:18-24`
- Modify: `astros_vue/src/views/FirmwareView.vue` (import line ~9, storeToRefs ~36, template ~294-327, possibly CSS)
- Modify: `astros_vue/src/views/__tests__/FirmwareView.spec.ts:66`
- Delete: the 5 `firmwareStagesList/` files listed in File Structure.

- [ ] **Step 1: Update the firmware barrel**

In `src/components/firmware/index.ts`:
- Replace line 8 (`export { default as AstrosFirmwareStagesList } ...`) with:

```typescript
export { default as AstrosFirmwareStagesBoard } from './firmwareStagesBoard/AstrosFirmwareStagesBoard.vue';
```

- After the `ControllersPanelProps` type block (line ~13-17), add:

```typescript
export type { StageColumnModel } from '@/utils/firmwareStageBoard';
```

- [ ] **Step 2: Update FirmwareView script**

In `src/views/FirmwareView.vue`:
- In the `@/components` import (lines 5-12), replace `AstrosFirmwareStagesList,` with `AstrosFirmwareStagesBoard,`.
- In `storeToRefs(firmware)` (lines 26-41), replace `downloadPercent,` with `stageBoard,`.

- [ ] **Step 3: Update FirmwareView template**

Replace the left-column + board region. Change the left column (lines ~298-315) to drop the stages list:

```html
            <div class="firmware-view__left-column">
              <AstrosFirmwareTopology
                v-if="topologyFleet"
                :fleet="topologyFleet"
                :selected-ids="[...selectedControllerIds]"
                :target="target"
                :phase="phase"
                :current-stage="currentStage"
                :failed-controller-ids="failedControllerIds"
              />
            </div>
```

Then add the full-width board **after** the closing `</div>` of `.firmware-view__grid` (after line ~327, still inside `.firmware-view__content`):

```html
          <AstrosFirmwareStagesBoard
            v-if="(phase === 'flashing' || phase === 'done' || phase === 'failed') && !lockConflict"
            :columns="stageBoard"
          />
```

- [ ] **Step 4: Update the FirmwareView test stub**

In `src/views/__tests__/FirmwareView.spec.ts:66`, rename the stub:

```typescript
        AstrosFirmwareStagesBoard: { template: '<div data-test="stages-board" />' },
```

(If any assertion in that file queries `[data-test="stages-list"]`, update it to `[data-test="stages-board"]`.)

- [ ] **Step 5: Delete the old StagesList files**

```bash
git rm src/components/firmware/firmwareStagesList/AstrosFirmwareStagesList.vue \
       src/components/firmware/firmwareStagesList/AstrosFirmwareStagesList.stories.ts \
       src/components/firmware/firmwareStagesList/stageRowState.ts \
       src/components/firmware/firmwareStagesList/__tests__/AstrosFirmwareStagesList.spec.ts \
       src/components/firmware/firmwareStagesList/__tests__/stageRowState.spec.ts
```

- [ ] **Step 6: Verify no dangling references**

Run: `grep -rn "StagesList\|stageRowState\|downloadPercent\|stages-list" src/ | grep -v node_modules`
Expected: no output.

- [ ] **Step 7: Type-check + run the affected suites**

Run: `npx vue-tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

Run: `npx vitest run src/views/__tests__/FirmwareView.spec.ts src/stores/__tests__/firmware.spec.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(firmware): swap STAGES list for per-controller board in FirmwareView"
```

---

## Task 7: Full verification + manual QA + pre-commit review

- [ ] **Step 1: Format + lint**

Run: `npm run prettier:write && npm run lint`
Expected: clean.

- [ ] **Step 2: Full build (type-check) + full test run**

Run: `npm run build`
Expected: build succeeds.

Run: `npx vitest run`
Expected: all suites PASS.

- [ ] **Step 3: Manual QA via Storybook**

Run: `npm run storybook`
Verify `AstrosFirmwareStagesBoard / MidUpdate` matches the mockup: Body MASTER (Download done 100%, Transfer current), Core PADAWAN (Download "Master only" dash, Receive 54% current), Dome NOT IN UPDATE (greyed). Check the responsive stack below 720px.

- [ ] **Step 4: Code review (pre-commit)**

Invoke `superpowers:requesting-code-review` on the full branch diff. Include the store/util/component contract boundary and the deleted `downloadPercent`/`StagesList` surface so the reviewer can catch any dangling consumer. Address Critical/Important before finishing.

- [ ] **Step 5: Mark plan complete + commit**

Check off all boxes in this file and commit:

```bash
git add .docs/plans/20260529-2115-firmware-per-controller-stages-board.md
git commit -m "docs(plan): mark per-controller stages board plan complete"
```

---

## Self-Review notes

- **Spec coverage:** per-controller columns (Task 4/5), role labels + "Master only" + "NOT IN UPDATE" (Task 1/4), step-2 Transfer/Receive split (Task 2), per-controller live percent + done-100% (Task 2/4), not-in-update greying (Task 4), full-width layout move (Task 6), source strip untouched (no task — intentional). ✔
- **Type consistency:** `StageColumnModel` / `StageBoardRow` / `controllerStageColumn` names are used identically across util, store, and both components. ✔
- **No placeholders:** all steps carry full code. ✔
- **Open risk to confirm during execution:** `firmware.spec.ts` fixture names (`BODY_MAC`, the started-job helper) — Task 3 Step 1 says to read the file's existing fixtures and match them rather than assume.
