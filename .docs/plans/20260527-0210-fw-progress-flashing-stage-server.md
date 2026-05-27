# FwStage.Flashing + state-machine + UI-mapping + row-order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `Flashing` stage to the server-side firmware state machine + UI mapping, fix the UI's `FIRMWARE_STAGES` row order so verify precedes flash (matching the firmware lifecycle), and clear the path for the M4 firmware deploy to render `✓ download ✓ transfer ✓ verify ! flash idle-reboot`.

**Architecture:** Adds one variant to `FwStage`, two state-machine transitions (`Verifying → Flashing`, `Flashing → Rebooting`, plus `Flashing → Failed` via the universal terminal arm), one UI stage mapping (`FLASHING → 'flash'`), and reorders the visual row constant. No new files, no orchestrator behavior change — just the state-machine surface area needed for the firmware-side work in the sister plan (`AstrOs.ESP/.docs/plans/20260527-0211-fw-progress-flashing-stage-firmware.md`) to land cleanly.

**Tech Stack:** TypeScript, vitest, Vue 3, Pinia.

**Parent design:** [`AstrOs.ESP/.docs/plans/20260527-0143-firmware-ota-progress-emission-design.md`](../../../AstrOs.ESP/.docs/plans/20260527-0143-firmware-ota-progress-emission-design.md)

**Branch:** Create `feature/fw-progress-flashing-stage` off `ota_testing`.

---

## Migration order

This plan ships **first**. Existing M4 firmware in the field continues to hit the `illegal flash-job transition: SENDING → VERSION_CONFIRMED` bug after this plan lands — no regression, because that's already broken. The firmware-side plan ships second; only after both ship does the M4 deploy render correctly in the UI.

## Pre-commit workflow (per AstrOs.Server CLAUDE.md)

Each implementation commit (not plan-only commits) runs:

```bash
cd astros_api && npm run prettier:write && npm run lint:fix && npm run build && npx vitest run
cd astros_vue && npm run lint && npm run build && npx vitest run
```

Then invoke `superpowers:requesting-code-review` on the diff against the prior commit. Fix Critical / Important items before committing.

---

## File Structure

| File | Responsibility | Change type |
|---|---|---|
| `astros_api/src/models/firmware/firmware_messages.ts` | Single source of truth for `FwStage` enum | Modify — add `Flashing` variant |
| `astros_api/src/firmware/flash_job_state_machine.ts` | Per-controller transition graph | Modify — add Flashing transitions |
| `astros_api/src/firmware/flash_job_state_machine.test.ts` | State machine tests | Modify — new transition tests |
| `astros_api/src/serial/message_handler.ts` | FW_PROGRESS parser | Already works via `FW_STAGE_VALUES.has(stage)` — verify no changes needed |
| `astros_vue/src/types/firmware.ts` | UI-side `ServerFwStage` union | Modify — add `'FLASHING'` |
| `astros_vue/src/utils/firmwareStageMapping.ts` | Server stage → UI stage | Modify — add FLASHING arm |
| `astros_vue/src/utils/__tests__/firmwareStageMapping.spec.ts` | Mapping tests | Modify — new FLASHING tests |
| `astros_vue/src/components/firmware/firmwareStagesList/stageRowState.ts` | `FIRMWARE_STAGES` constant | Modify — reorder to put verify before flash |
| `astros_vue/src/components/firmware/firmwareStagesList/__tests__/stageRowState.spec.ts` | Stage-row state tests | Audit — any tests that hard-code indices need updating |
| `.docs/protocol.md` | Wire-protocol source of truth | Modify — document new FLASHING stage |

---

## Tasks

### Task 0: Commit plan file

**Files:**
- Stage: this plan file

- [ ] **Step 1: Create branch and commit**

```bash
cd /home/jeff/Source/astros/AstrOs.Server
git checkout ota_testing
git pull
git checkout -b feature/fw-progress-flashing-stage
git add .docs/plans/20260527-0210-fw-progress-flashing-stage-server.md
git commit -m "$(cat <<'EOF'
docs(firmware): plan — add FwStage.Flashing + state machine + UI mapping

Plan for the server-side half of the FW_PROGRESS emission feature.
Ships before the AstrOs.ESP firmware plan so the server can accept
the new FLASHING stage. See parent design at:
AstrOs.ESP/.docs/plans/20260527-0143-firmware-ota-progress-emission-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 1: Add `FwStage.Flashing` to the enum

**Files:**
- Modify: `astros_api/src/models/firmware/firmware_messages.ts:20-28`

- [ ] **Step 1: Add the variant**

Open `astros_api/src/models/firmware/firmware_messages.ts` and edit lines 20-28:

```typescript
export enum FwStage {
  Queued = 'QUEUED',
  UploadingToMaster = 'UPLOADING_TO_MASTER',
  Sending = 'SENDING',
  Verifying = 'VERIFYING',
  Flashing = 'FLASHING',
  Rebooting = 'REBOOTING',
  VersionConfirmed = 'VERSION_CONFIRMED',
  Failed = 'FAILED',
}
```

The enum is string-valued, so the new variant has no ordinal impact. The wire format carries `'FLASHING'` literally.

- [ ] **Step 2: Verify the `FW_STAGE_VALUES` derived set picks it up**

`grep -n "FW_STAGE_VALUES" astros_api/src/`. If the set is derived from `Object.values(FwStage)`, no further change is needed. If it's a hand-maintained literal list, add `'FLASHING'` to it. Document the location you found in the commit message.

- [ ] **Step 3: Build + test**

```bash
cd astros_api
npm run prettier:write && npm run lint:fix && npm run build && npx vitest run
```

Expected: all existing tests pass. No new tests needed yet (next tasks add them).

- [ ] **Step 4: Commit**

```bash
git add astros_api/src/models/firmware/firmware_messages.ts
git commit -m "feat(firmware): add FwStage.Flashing variant

String enum value 'FLASHING'. Wire-format compatible — the parser at
message_handler.ts:308 reads the string directly via FW_STAGE_VALUES.has.
State-machine transitions land in the next commit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: State-machine — allow Verifying → Flashing → {Rebooting, Failed}

**Files:**
- Modify: `astros_api/src/firmware/flash_job_state_machine.ts:18-32`
- Modify: `astros_api/src/firmware/flash_job_state_machine.test.ts`

- [ ] **Step 1: Write failing tests for the new transitions**

Open `astros_api/src/firmware/flash_job_state_machine.test.ts` and add to the legal-transitions describe block:

```typescript
describe('transitionControllerState — Flashing transitions', () => {
  const withStage = (stage: FwStage): ControllerFlashState => ({
    controllerId: 'pad1',
    stage: stage as FwStage.UploadingToMaster | FwStage.Sending | FwStage.Verifying | FwStage.Rebooting,
    bytesSent: 0,
    totalBytes: 100,
    detail: '',
  });

  it('Verifying → Flashing is legal', () => {
    const before = withStage(FwStage.Verifying);
    const after = transitionControllerState(before, FwStage.Flashing);
    expect(after.stage).toBe(FwStage.Flashing);
  });

  it('Flashing → Rebooting is legal', () => {
    const flashing = transitionControllerState(withStage(FwStage.Verifying), FwStage.Flashing);
    const after = transitionControllerState(flashing, FwStage.Rebooting);
    expect(after.stage).toBe(FwStage.Rebooting);
  });

  it('Flashing → Failed is legal', () => {
    const flashing = transitionControllerState(withStage(FwStage.Verifying), FwStage.Flashing);
    const after = transitionControllerState(flashing, FwStage.Failed, {
      error: 'flash_not_implemented',
    });
    expect(after.stage).toBe(FwStage.Failed);
  });

  it('Flashing → Flashing (self-edge) is legal', () => {
    const flashing = transitionControllerState(withStage(FwStage.Verifying), FwStage.Flashing);
    const after = transitionControllerState(flashing, FwStage.Flashing);
    expect(after.stage).toBe(FwStage.Flashing);
  });

  it('Sending → Flashing is illegal (must go through Verifying)', () => {
    expect(() =>
      transitionControllerState(withStage(FwStage.Sending), FwStage.Flashing),
    ).toThrow(/illegal/i);
  });

  it('Flashing → VersionConfirmed is illegal (must go through Rebooting)', () => {
    const flashing = transitionControllerState(withStage(FwStage.Verifying), FwStage.Flashing);
    expect(() =>
      transitionControllerState(flashing, FwStage.VersionConfirmed, { finalVersion: 'v1' }),
    ).toThrow(/illegal/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd astros_api
npx vitest run flash_job_state_machine.test.ts
```

Expected: 6 new tests fail with `illegal flash-job transition`.

- [ ] **Step 3: Update the transition graph**

In `astros_api/src/firmware/flash_job_state_machine.ts:18-32`, change the map entries:

```typescript
const LEGAL_NEXT_STAGES: ReadonlyMap<FwStage, ReadonlySet<FwStage>> = new Map<
  FwStage,
  ReadonlySet<FwStage>
>([
  [FwStage.Queued, new Set([FwStage.Queued, FwStage.UploadingToMaster, FwStage.Failed])],
  [
    FwStage.UploadingToMaster,
    new Set([FwStage.UploadingToMaster, FwStage.Sending, FwStage.Failed]),
  ],
  [FwStage.Sending, new Set([FwStage.Sending, FwStage.Verifying, FwStage.Failed])],
  [FwStage.Verifying, new Set([FwStage.Verifying, FwStage.Flashing, FwStage.Failed])],
  [FwStage.Flashing, new Set([FwStage.Flashing, FwStage.Rebooting, FwStage.Failed])],
  [FwStage.Rebooting, new Set([FwStage.Rebooting, FwStage.VersionConfirmed, FwStage.Failed])],
  [FwStage.VersionConfirmed, EMPTY_STAGE_SET],
  [FwStage.Failed, EMPTY_STAGE_SET],
]);
```

Verify the `NonTerminalStage` type discriminator at line 52-57 covers `FwStage.Flashing`:

```typescript
type NonTerminalStage =
  | FwStage.Queued
  | FwStage.UploadingToMaster
  | FwStage.Sending
  | FwStage.Verifying
  | FwStage.Flashing
  | FwStage.Rebooting;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd astros_api
npx vitest run flash_job_state_machine.test.ts
```

Expected: all tests pass (existing + 6 new).

- [ ] **Step 5: Commit**

```bash
cd /home/jeff/Source/astros/AstrOs.Server
git add astros_api/src/firmware/flash_job_state_machine.ts astros_api/src/firmware/flash_job_state_machine.test.ts
git commit -m "feat(firmware): state machine — Verifying → Flashing → {Rebooting, Failed}

Adds the Flashing stage to the per-controller transition graph.
- Verifying → Flashing (verification complete, padawan entering pre-flash delay)
- Flashing → Rebooting (PR set 2: flash committed, padawan rebooting)
- Flashing → Failed (M4: flash deliberately not implemented; or PR set 2: esp_ota_set_boot_partition returned error)

Sending → Flashing remains illegal (must traverse Verifying) and
Flashing → VersionConfirmed remains illegal (must traverse Rebooting)
— the state machine still catches genuine skip-bugs.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: UI mapping — FLASHING → 'flash'

**Files:**
- Modify: `astros_vue/src/types/firmware.ts` (find the `ServerFwStage` union)
- Modify: `astros_vue/src/utils/firmwareStageMapping.ts:15-47, 50-80`
- Modify: `astros_vue/src/utils/__tests__/firmwareStageMapping.spec.ts`

- [ ] **Step 1: Update `ServerFwStage` union**

```bash
grep -n "ServerFwStage" astros_vue/src/types/firmware.ts
```

Add `'FLASHING'` to the union, in lifecycle order between `'VERIFYING'` and `'REBOOTING'`. Example shape (actual code may differ slightly — match the existing style):

```typescript
export type ServerFwStage =
  | 'QUEUED'
  | 'UPLOADING_TO_MASTER'
  | 'SENDING'
  | 'VERIFYING'
  | 'FLASHING'
  | 'REBOOTING'
  | 'VERSION_CONFIRMED'
  | 'FAILED';
```

- [ ] **Step 2: Write failing tests for the new mapping**

Open `astros_vue/src/utils/__tests__/firmwareStageMapping.spec.ts` and add:

```typescript
describe('mapServerStageToUiStage — FLASHING', () => {
  it("maps 'FLASHING' to UI stage 'flash'", () => {
    expect(mapServerStageToUiStage('FLASHING')).toBe('flash');
  });
});

describe('controllerStatePillKind — FLASHING', () => {
  it("returns 'updating' for FLASHING state (mid-flight visual indicator)", () => {
    const state: ControllerFlashState = {
      controllerId: 'pad1',
      stage: 'FLASHING',
      bytesSent: 100,
      totalBytes: 100,
      detail: '',
    };
    expect(controllerStatePillKind(state)).toBe('updating');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd astros_vue
npx vitest run firmwareStageMapping.spec.ts
```

Expected: 2 new tests fail (mapping returns null for FLASHING, pill kind returns 'updating' via fallback with a warn).

- [ ] **Step 4: Add mapping arms**

In `astros_vue/src/utils/firmwareStageMapping.ts`, add to `mapServerStageToUiStage`:

```typescript
case 'FLASHING':
  return 'flash';
```

And to `controllerStatePillKind`:

```typescript
case 'UPLOADING_TO_MASTER':
case 'SENDING':
case 'VERIFYING':
case 'FLASHING':
case 'REBOOTING':
  return 'updating';
```

(Add `'FLASHING'` to the existing fall-through group.)

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd astros_vue
npx vitest run firmwareStageMapping.spec.ts
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
cd /home/jeff/Source/astros/AstrOs.Server
git add astros_vue/src/types/firmware.ts astros_vue/src/utils/firmwareStageMapping.ts astros_vue/src/utils/__tests__/firmwareStageMapping.spec.ts
git commit -m "feat(firmware-ui): map FLASHING server stage to 'flash' UI row

ServerFwStage union gains FLASHING in lifecycle order.
mapServerStageToUiStage projects FLASHING → 'flash' so the existing
FIRMWARE_STAGES 'flash' row can finally be reached.
controllerStatePillKind treats FLASHING as 'updating' (mid-flight),
joining the SENDING/VERIFYING/REBOOTING fall-through group.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Reorder `FIRMWARE_STAGES` — verify before flash

**Files:**
- Modify: `astros_vue/src/components/firmware/firmwareStagesList/stageRowState.ts:3`
- Audit: `astros_vue/src/components/firmware/firmwareStagesList/__tests__/stageRowState.spec.ts`

- [ ] **Step 1: Reorder the constant**

In `astros_vue/src/components/firmware/firmwareStagesList/stageRowState.ts` line 3:

```typescript
// BEFORE — verify rendered after flash; contradicts firmware lifecycle
export const FIRMWARE_STAGES = ['download', 'transfer', 'flash', 'verify', 'reboot'] as const;

// AFTER — matches transfer → verify → flash → reboot lifecycle
export const FIRMWARE_STAGES = ['download', 'transfer', 'verify', 'flash', 'reboot'] as const;
```

Background: the firmware verifies (3 integrity gates on padawan: SHA, esp_ota_end, readback rehash) **before** the boot-partition commit (the "flash" step). Rendering verify after flash was a pre-existing UI bug.

- [ ] **Step 2: Audit test file for index-coupled assertions**

```bash
cd astros_vue
grep -n "FIRMWARE_STAGES\[" src/components/firmware/firmwareStagesList/__tests__/stageRowState.spec.ts
grep -n "'flash'\|'verify'" src/components/firmware/firmwareStagesList/__tests__/stageRowState.spec.ts
```

For each match: if the test hard-codes an index (e.g. `FIRMWARE_STAGES[2]`) or asserts the visual order, update it to reflect the new ordering. If it just iterates `FIRMWARE_STAGES` or uses stage names directly, no change needed.

Specifically check that tests asserting `stageRowState({ stage: 'verify', currentStage: 'flash', ... })` style behavior account for the swap: `verify` now precedes `flash`, so if `currentStage='flash'`, `verify` should be 'done' (not 'idle'). And if `currentStage='verify'`, `flash` should be 'idle' (not 'done').

- [ ] **Step 3: Run tests**

```bash
cd astros_vue
npx vitest run stageRowState.spec.ts
```

Expected: all tests pass after audit-driven updates.

- [ ] **Step 4: Build + run full Vue test suite**

```bash
cd astros_vue
npm run build && npx vitest run
```

Expected: clean build, all tests pass. If a snapshot test renders `FIRMWARE_STAGES`-derived UI it may need a snapshot refresh — review the diff before accepting.

- [ ] **Step 5: Commit**

```bash
cd /home/jeff/Source/astros/AstrOs.Server
git add astros_vue/src/components/firmware/firmwareStagesList/stageRowState.ts astros_vue/src/components/firmware/firmwareStagesList/__tests__/stageRowState.spec.ts
git commit -m "fix(firmware-ui): reorder FIRMWARE_STAGES so verify precedes flash

The firmware lifecycle is transfer → verify (3 integrity gates) → flash
(boot-partition commit) → reboot. The UI's stage row order had verify
*after* flash, which would render nonsensically once any controller
actually reaches the flash stage. Reorder matches the lifecycle so row
position reflects progression direction.

Drive-by correctness fix inside the surface area touched by the
FwStage.Flashing addition.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Orchestrator integration test — M4 sequence end-to-end

**Files:**
- Modify: `astros_api/src/firmware/flash_orchestrator.test.ts` (or create a new integration test file under `astros_api/src/firmware/integration/`)

- [ ] **Step 1: Find the existing orchestrator-test fixture**

```bash
grep -rn "handleDeployEvent\|handleDeployProgress\|handleDeployDone" astros_api/src/firmware/*.test.ts astros_api/src/firmware/integration/*.test.ts | head -20
```

Use the test-fixture pattern already established in that file (or in the nearest sibling).

- [ ] **Step 2: Write the failing integration test**

Add a test that simulates the M4 sequence:

```typescript
describe('flash orchestrator — M4 deploy (transfer + verify + flash placeholder)', () => {
  it('walks Sending → Verifying → Flashing → Failed(flash_not_implemented) cleanly', () => {
    const fx = makeOrchestratorFixture();
    fx.startJob({ jobId: 'j1', controllers: ['pad1'] });

    // Simulate FW_PROGRESS chain
    fx.deliverProgress({ transferId: 't1', controllerId: 'pad1', stage: FwStage.Sending, bytesSent: 0, totalBytes: 1000, detail: '' });
    fx.deliverProgress({ transferId: 't1', controllerId: 'pad1', stage: FwStage.Sending, bytesSent: 500, totalBytes: 1000, detail: '' });
    fx.deliverProgress({ transferId: 't1', controllerId: 'pad1', stage: FwStage.Sending, bytesSent: 1000, totalBytes: 1000, detail: '' });
    fx.deliverProgress({ transferId: 't1', controllerId: 'pad1', stage: FwStage.Verifying, bytesSent: 1000, totalBytes: 1000, detail: '' });
    fx.deliverProgress({ transferId: 't1', controllerId: 'pad1', stage: FwStage.Flashing, bytesSent: 1000, totalBytes: 1000, detail: '' });

    // FW_DEPLOY_DONE with M4 placeholder failure
    fx.deliverDeployDone({
      transferId: 't1',
      results: [{ controllerId: 'pad1', outcome: 'FAILED', finalVersion: '', error: 'flash_not_implemented' }],
    });

    const controller = fx.currentControllerState('pad1');
    expect(controller.stage).toBe(FwStage.Failed);
    expect(controller.error).toBe('flash_not_implemented');

    const events = fx.collectedWsEvents();
    const stages = events
      .filter((e) => e.type === TransmissionType.flashControllerUpdate || e.type === TransmissionType.flashControllerResult)
      .map((e) => e.data.controller.stage);
    expect(stages).toContain(FwStage.Sending);
    expect(stages).toContain(FwStage.Verifying);
    expect(stages).toContain(FwStage.Flashing);
    expect(stages[stages.length - 1]).toBe(FwStage.Failed);
  });
});
```

If the existing fixture doesn't have `makeOrchestratorFixture` / `deliverProgress` / `deliverDeployDone` / `collectedWsEvents` helpers, adapt to whatever pattern the file uses (typically `new FlashOrchestrator({ ... })`, then `.handleDeployEvent(...)` directly).

- [ ] **Step 3: Run test to verify it fails (or already passes)**

```bash
cd astros_api
npx vitest run flash_orchestrator.test.ts -t "M4 deploy"
```

If this test passes immediately, that's good — Tasks 1-2 wired up the state machine correctly. If it fails, the failure mode reveals what's wrong (state machine, orchestrator, fixture).

- [ ] **Step 4: Fix any issues and re-run**

If the test fails, walk the failure: state-machine throw means a transition is missing; orchestrator throw means dispatch is wrong; assertion failure means events aren't being emitted as expected. Most likely outcome: passes on first try because Tasks 1-2 covered the state-machine surface.

- [ ] **Step 5: Commit**

```bash
cd /home/jeff/Source/astros/AstrOs.Server
git add astros_api/src/firmware/flash_orchestrator.test.ts
git commit -m "test(firmware): orchestrator walks M4 sequence Sending→…→Failed

Pins the M4 deploy contract end-to-end on the server side: FW_PROGRESS
chain advances the controller through Sending → Verifying → Flashing,
then FW_DEPLOY_DONE outcome=FAILED with reason=flash_not_implemented
lands as the Failed terminal. WS events emitted in the same order so
the UI surface gets each transition.

Sister-repo firmware emission lands in AstrOs.ESP plan
20260527-0211-fw-progress-flashing-stage-firmware.md.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Update `.docs/protocol.md`

**Files:**
- Modify: `.docs/protocol.md` (Stage enum section)

- [ ] **Step 1: Find and update the Stage enum docs**

```bash
grep -n "Stage enum\|VERIFYING\|REBOOTING" .docs/protocol.md | head -10
```

Add `FLASHING` to the documented stage list, between `VERIFYING` and `REBOOTING`. Document its meaning: "Padawan has completed verification and is in the pre-flash delay window. PR set 2: padawan calls `esp_ota_set_boot_partition`. M4: padawan reports FLASH_NOT_IMPLEMENTED placeholder via the new OTA_FLASH_RESULT message."

- [ ] **Step 2: Note that the AstrOs.ESP copy must stay in sync**

The protocol doc lives in both repos (per `firmware_messages.ts:3-4`). Confirm whether updating both is in scope for this PR or the firmware PR. Recommendation: update both copies in lockstep — easier review, no drift window.

- [ ] **Step 3: Commit**

```bash
git add .docs/protocol.md
git commit -m "docs(protocol): document FwStage.FLASHING

New stage between VERIFYING and REBOOTING. Documents the M4 vs PR set 2
semantics. The sister AstrOs.ESP copy of protocol.md is updated in
lockstep in the firmware-side plan.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Push + open PR

- [ ] **Step 1: Push the branch**

```bash
cd /home/jeff/Source/astros/AstrOs.Server
git push -u origin feature/fw-progress-flashing-stage
```

Note: `git push` is auth-dependent — run in VS Code terminal if Claude Code's bash environment hits an auth wall.

- [ ] **Step 2: Open PR against the appropriate base**

Determine base: `develop`, `main`, or the parent feature branch (`ota_testing`). Per the project's branching workflow, this likely targets `ota_testing` since it's continuing the OTA-development arc.

```bash
gh pr create --title "feat(firmware): add FwStage.Flashing + state machine + UI mapping + row order" --body "$(cat <<'EOF'
## Summary

Server-side half of the FW_PROGRESS emission feature. Unblocks the M4 firmware deploy from rendering "Flash failed: illegal flash-job transition: SENDING → VERSION_CONFIRMED" in the UI on a successful transfer.

- Adds `FwStage.Flashing` string enum variant
- State machine: `Verifying → Flashing → {Rebooting, Failed}`
- UI mapping: `FLASHING → 'flash'`
- Reorders `FIRMWARE_STAGES` to put verify before flash (fixes pre-existing UI bug)
- Orchestrator integration test covering full M4 sequence
- `.docs/protocol.md` updated

Per the parent design doc, ships **first**; the AstrOs.ESP firmware-side PR ships after this lands.

## Parent design

`AstrOs.ESP/.docs/plans/20260527-0143-firmware-ota-progress-emission-design.md`

## Test plan

- [ ] All vitest suites pass (`astros_api` and `astros_vue`)
- [ ] Manual: existing M4 firmware deploy still produces the illegal-transition error (no regression — the firmware side hasn't shipped yet)
- [ ] When sister firmware PR lands: deploy a 2-padawan M4 firmware, UI renders `✓ download ✓ transfer ✓ verify ! flash idle-reboot`, controller-detail surfaces `flash_not_implemented`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review checklist (run before declaring complete)

- [ ] All 7 tasks completed and committed
- [ ] `npm run build` clean in both `astros_api` and `astros_vue`
- [ ] Full `vitest run` passes in both directories
- [ ] No new ESLint warnings
- [ ] PR opened with the right base branch
- [ ] Sister firmware PR's coordination notes mention this PR's number
