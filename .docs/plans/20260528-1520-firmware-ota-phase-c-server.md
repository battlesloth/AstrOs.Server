# Firmware OTA Phase C — Server-side Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve `PadawanStatus::PENDING` rows in `FW_DEPLOY_DONE` (introduced by AstrOs.ESP Phase C firmware) by holding the deploy in a new `Finalizing` state, mutating PENDING rows to `VersionConfirmed` on the master's post-reboot heartbeat, or to `Failed("post_reboot_timeout")` after a 90 s safety timer.

**Architecture:** New `FwStage.Finalizing` (in-memory) ↔ `"PENDING"` (wire). Server holds the deploy open while any Finalizing row exists; `notifyMasterHeartbeat` mutates Finalizing → VersionConfirmed; a 90 s `finalizeTimer` falls back to Failed. UI gets a new `'finalizing'` pill kind. Builds on the existing `decidePostDeployHeartbeat` → `notifyMasterHeartbeat` pipeline (no new heartbeat plumbing needed).

**Tech Stack:** TypeScript (api: Node 22 + Vitest + Express; vue: Vue 3 + Pinia + Tailwind 4 + DaisyUI 5 + Vitest/jsdom). Backend on `astros_api/`; frontend on `astros_vue/`.

**Companion docs:**
- Spec: [`.docs/specs/20260528-1512-firmware-ota-phase-c-server-design.md`](../specs/20260528-1512-firmware-ota-phase-c-server-design.md)
- Handoff context: [`.docs/plans/20260528-1455-handoff-firmware-ota-pr-set-2-phase-c-server-side.md`](20260528-1455-handoff-firmware-ota-pr-set-2-phase-c-server-side.md)
- Firmware-side design: `/home/jeff/Source/astros/AstrOs.ESP/.docs/plans/20260528-1234-firmware-ota-pr-set-2-phase-c-master-self-flash-design.md`

**Branch:** `feature/firmware-ota-phase-c-server` (already created and tracking the spec + handoff at commit `b10e365`). Per-commit pre-commit dance: `npm run prettier:write && npm run lint:fix` then `npm run build` then `npx vitest run` (api) / `npm run test:unit -- --run` (vue), then `superpowers:requesting-code-review` for any task touching `.ts` / `.tsx` / `.vue` / test files. Doc-only tasks (15, 16) skip steps 3.

**Per-task commit message convention:** `<type>(<scope>): <subject>` matching the repo style. The HEREDOC `Co-Authored-By` trailer is automatically applied by your commit tooling per the user's existing convention — keep it.

**Scope rationale (>8 tasks):** This plan has 17 tasks. The CLAUDE.md scope guard suggests breaking into phases at that size, but the user explicitly chose one full PR in brainstorming because (a) the parser fix alone leaves the UI rendering Finalizing rows as "unknown", which is a worse intermediate state than no PR at all, and (b) the work is tightly coupled across layers (wire → state machine → orchestrator → UI → locale). Each task is independently committable and self-contained; the boundary just isn't at the PR level.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `astros_api/src/serial/message_handler.ts` | modify (lines 357-378) | Accept `"PENDING"` outcome + PENDING-specific empty-finalVersion cross-field check |
| `astros_api/src/serial/message_handler.test.ts` | modify | New test cases for PENDING accept + PENDING-finalVersion reject |
| `astros_api/src/models/firmware/firmware_messages.ts` | modify | Add `FwStage.Finalizing = 'FINALIZING'`; extend `FwDeployDoneResult.outcome` union |
| `astros_api/src/models/firmware/flash_job_state.ts` | modify | Add `Finalizing` arm with `pendingDetail: string` to `ControllerFlashState` discriminated union |
| `astros_api/src/firmware/flash_job_state_machine.ts` | modify | Extend `LEGAL_NEXT_STAGES`; add Finalizing overload + runtime check to `transitionControllerState` |
| `astros_api/src/firmware/flash_job_state_machine.test.ts` | modify | Test legal/illegal Finalizing transitions; required-payload check |
| `astros_api/src/firmware/flash_orchestrator.ts` | modify | `finalizeTimer` field; `DEFAULT_FINALIZE_TIMEOUT_MS`; `finalizeTimeoutMs` opt; `handleDeployDone` PENDING branch; `completePendingResolution` helper; `notifyMasterHeartbeat` extension; `releaseLock` dispose extension |
| `astros_api/src/firmware/flash_orchestrator.test.ts` | modify | Tests for PENDING flow: arm finalizeTimer, heartbeat resolution, timeout resolution, cancel-during-Finalizing, first-fire-wins mutation test |
| `astros_api/src/firmware/late_join_snapshot.test.ts` | modify | Test: active job with Finalizing rows + undefined endedAt returns snapshot |
| `astros_vue/src/types/firmware.ts` | modify | `ServerFwStage` + `FirmwareStatusPillKind` + both `ControllerFlashState` unions + `FLASH_ERROR_REASONS` |
| `astros_vue/src/utils/firmwareStageMapping.ts` | modify | `mapServerStageToUiStage` + `controllerStatePillKind` Finalizing cases |
| `astros_vue/src/utils/__tests__/firmwareStageMapping.spec.ts` | modify | Tests for Finalizing → null UI stage + 'finalizing' pill kind |
| `astros_vue/src/stores/firmware.ts` | modify | Two switch-on-stage sites: `buildControllerStatesMap` translator + `applyJobFailed` normalize |
| `astros_vue/src/stores/__tests__/firmware.spec.ts` | modify | Test: Finalizing state flows through WS event lifecycle |
| `astros_vue/src/components/firmware/firmwareStatusPill/AstrosFirmwareStatusPill.vue` | modify | Add `finalizing` kind label + modifier + style |
| `astros_vue/src/components/firmware/firmwareStatusPill/AstrosFirmwareStatusPill.stories.ts` | modify | Add finalizing story |
| `astros_vue/src/locales/enUS.json` | modify | `firmware_view.controllers.pill.finalizing` + `firmware_view.flash_errors.post_reboot_timeout` |
| `.docs/protocol.md` | modify | `FW_DEPLOY_DONE` payload field layout: add PENDING to outcome enum + PENDING-semantics note |
| `.docs/qa/firmware-ota-phase-c-server.md` | create | Bench test plan mirroring firmware C.1–C.3 from server viewpoint |

---

## Task 1: Parser — accept `"PENDING"` outcome with TDD

**Files:**
- Modify: `astros_api/src/serial/message_handler.ts:357-378`
- Test: `astros_api/src/serial/message_handler.test.ts`

The current parser strictly rejects any outcome that isn't OK or FAILED, so a Phase C master row trashes the entire DEPLOY_DONE. This task adds PENDING support to the outcome guard, plus a parallel PENDING-specific cross-field check (PENDING rows MUST have empty `finalVersion` per the firmware contract — the master hasn't booted yet).

- [ ] **Step 1: Find the existing FW_DEPLOY_DONE test block to anchor new cases**

Run: `grep -n "FW_DEPLOY_DONE\|handleFwDeployDone\|describe.*deploy.*done\|describe.*FwDeployDone" astros_api/src/serial/message_handler.test.ts`

Expected: line numbers of existing test blocks for FW_DEPLOY_DONE handling. Read that section so your new tests slot into the existing describe block with matching style.

- [ ] **Step 2: Add the failing tests**

Open `astros_api/src/serial/message_handler.test.ts` and add to the FW_DEPLOY_DONE describe block (use the same import + helper style already present in that file — likely a `buildDeployDoneMessage` helper or inline string assembly with `MessageHelper.US` / `RS`):

```typescript
it('accepts PENDING outcome with empty finalVersion and non-empty error', () => {
  // Firmware-side contract: master self-flash success row reports PENDING
  // with finalVersion="" and error="awaiting_post_reboot_version" per
  // AstrOs.ESP OtaForwarder::handleLocalFlashResult.
  const transferId = 'xfer-1';
  const masterRow = ['00:00:00:00:00:00', 'PENDING', '', 'awaiting_post_reboot_version'].join(
    MessageHelper.US,
  );
  const padawanRow = ['11:22:33:44:55:66', 'OK', '1.4.0', ''].join(MessageHelper.US);
  const msg = `${transferId}${MessageHelper.US}${masterRow}${MessageHelper.RS}${padawanRow}`;

  const handler = new MessageHandler();
  const result = handler.handleFwDeployDone(msg);

  expect(result.type).toBe(SerialWorkerResponseType.FW_DEPLOY_DONE);
  if (result.type !== SerialWorkerResponseType.FW_DEPLOY_DONE) return;
  expect(result.payload.results).toHaveLength(2);
  expect(result.payload.results[0]).toEqual({
    controllerId: '00:00:00:00:00:00',
    outcome: 'PENDING',
    finalVersion: '',
    error: 'awaiting_post_reboot_version',
  });
  expect(result.payload.results[1].outcome).toBe('OK');
});

it('rejects PENDING result with non-empty finalVersion (firmware contract violation)', () => {
  // Cross-field invariant: PENDING rows are emitted BEFORE the master
  // reboots, so finalVersion must be empty. A non-empty finalVersion
  // here means either a firmware regression or a corrupt frame; reject
  // the whole DEPLOY_DONE rather than apply a contradictory state.
  const transferId = 'xfer-1';
  const badRow = ['00:00:00:00:00:00', 'PENDING', '1.4.0', 'awaiting_post_reboot_version'].join(
    MessageHelper.US,
  );
  const msg = `${transferId}${MessageHelper.US}${badRow}`;

  const handler = new MessageHandler();
  const result = handler.handleFwDeployDone(msg);

  expect(result.type).toBe(SerialWorkerResponseType.UNKNOWN);
});
```

- [ ] **Step 3: Run new tests to verify they fail**

Run: `cd astros_api && npx vitest run src/serial/message_handler.test.ts -t "PENDING"`

Expected: 2 FAIL. The accept test fails because the existing guard returns UNKNOWN for `PENDING`; the reject test fails for the same reason (or passes for the wrong reason — UNKNOWN return — which a tester would catch by inspecting which guard fired in the logs). Either way, both should fail to assert the intended new behavior.

- [ ] **Step 4: Implement parser changes**

Edit `astros_api/src/serial/message_handler.ts` lines 357-378 (the outcome + cross-field check section inside `handleFwDeployDone`'s for-loop). Replace the existing OK/FAILED-only outcome check + OK-specific error check with:

```typescript
const outcome = fields[1];
if (outcome !== 'OK' && outcome !== 'FAILED' && outcome !== 'PENDING') {
  logger.error(`FW_DEPLOY_DONE has unknown outcome: ${outcome}`);
  return { type: SerialWorkerResponseType.UNKNOWN };
}

const finalVersion = fields[2];
const error = fields[3];

// Cross-field invariants — each outcome enforces its own contract.
//   OK: error must be empty (success leaves no error).
//   PENDING: master self-flash success row; emitted BEFORE master
//            reboots so finalVersion must be empty. A populated value
//            indicates a firmware regression — reject the frame.
//   FAILED: error populated; no finalVersion constraint here.
if (outcome === 'OK' && error !== '') {
  logger.error(`FW_DEPLOY_DONE OK result has non-empty error: ${error}`);
  return { type: SerialWorkerResponseType.UNKNOWN };
}
if (outcome === 'PENDING' && finalVersion !== '') {
  logger.error(
    `FW_DEPLOY_DONE PENDING result has non-empty finalVersion: ${finalVersion}`,
  );
  return { type: SerialWorkerResponseType.UNKNOWN };
}

results.push({
  controllerId: fields[0],
  outcome,
  finalVersion,
  error,
});
```

Note the existing `results.push` block is replaced as part of this edit — `finalVersion` and `error` are now local consts (avoids re-indexing `fields[]` twice). Remove the now-orphan `const error = fields[3];` line below the original guard if you didn't already (the edit above should subsume it).

- [ ] **Step 5: Extend the type union**

Edit `astros_api/src/models/firmware/firmware_messages.ts` `FwDeployDoneResult.outcome`:

```typescript
export interface FwDeployDoneResult {
  controllerId: string;
  outcome: 'OK' | 'FAILED' | 'PENDING';
  finalVersion: string;
  error: string; // empty string when outcome === 'OK'; populated for FAILED; firmware marker for PENDING
}
```

Update the trailing `// empty string when outcome === 'OK'` comment to the broader form shown above so a future reader sees the per-outcome semantics.

- [ ] **Step 6: Run all message_handler tests to confirm**

Run: `cd astros_api && npx vitest run src/serial/message_handler.test.ts`

Expected: ALL pass (existing OK/FAILED tests unchanged; new PENDING-accept + PENDING-reject tests now pass).

- [ ] **Step 7: Pre-commit dance**

Run from `astros_api/`:

```bash
npm run prettier:write
npm run lint:fix
npm run build
npx vitest run
```

Expected: all four pass. Then invoke `superpowers:requesting-code-review` on the diff vs `b10e365` (the spec commit) — frame the prompt as "find anything wrong with parser changes that accept PENDING and reject PENDING+finalVersion; the orchestrator's own outcome guard at flash_orchestrator.ts:1218-1226 will be updated in a later task — flag any contract drift between the two." Address Critical and Important findings; note Minor for later.

- [ ] **Step 8: Commit**

```bash
git add astros_api/src/serial/message_handler.ts astros_api/src/serial/message_handler.test.ts astros_api/src/models/firmware/firmware_messages.ts
git commit -m "$(cat <<'EOF'
fix(serial): accept PENDING outcome in FW_DEPLOY_DONE parser

AstrOs.ESP Phase C firmware (merge 3e55b8d) emits PadawanStatus::PENDING
for the master self-flash success row. The parser strictly rejected any
non-OK/FAILED outcome, trashing the entire DEPLOY_DONE as UNKNOWN and
leaving deploys stuck. Extend the guard to accept PENDING, with a new
cross-field invariant: PENDING rows must have empty finalVersion (the
master hasn't booted yet — a non-empty value indicates a firmware bug).

This unblocks the wire layer. The orchestrator's transition to a new
FwStage.Finalizing state, the 90s safety timer, and the UI surface
follow in subsequent commits.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Add `FwStage.Finalizing` enum value + `pendingDetail` arm on ControllerFlashState

**Files:**
- Modify: `astros_api/src/models/firmware/firmware_messages.ts:20-29` (FwStage enum)
- Modify: `astros_api/src/models/firmware/flash_job_state.ts:16-24` (ControllerFlashState union)

No tests of their own — type additions are exercised by Tasks 3-9. The repo's TypeScript configuration will flag any caller that needs updating.

- [ ] **Step 1: Add the enum value**

Edit `astros_api/src/models/firmware/firmware_messages.ts:20-29`:

```typescript
export enum FwStage {
  Queued = 'QUEUED',
  UploadingToMaster = 'UPLOADING_TO_MASTER',
  Sending = 'SENDING',
  Verifying = 'VERIFYING',
  Flashing = 'FLASHING',
  Rebooting = 'REBOOTING',
  Finalizing = 'FINALIZING',
  VersionConfirmed = 'VERSION_CONFIRMED',
  Failed = 'FAILED',
}
```

Order placement (between Rebooting and VersionConfirmed) reflects the lifecycle ordering: Finalizing is the post-Rebooting, pre-VersionConfirmed limbo where the master has emitted DEPLOY_DONE but the server hasn't yet confirmed via heartbeat.

- [ ] **Step 2: Add the Finalizing arm to ControllerFlashState**

Edit `astros_api/src/models/firmware/flash_job_state.ts:16-24`:

```typescript
export type ControllerFlashState =
  | (BaseControllerFlashState & { stage: FwStage.Queued })
  | (BaseControllerFlashState & { stage: FwStage.UploadingToMaster })
  | (BaseControllerFlashState & { stage: FwStage.Sending })
  | (BaseControllerFlashState & { stage: FwStage.Verifying })
  | (BaseControllerFlashState & { stage: FwStage.Flashing })
  | (BaseControllerFlashState & { stage: FwStage.Rebooting })
  | (BaseControllerFlashState & { stage: FwStage.Finalizing; pendingDetail: string })
  | (BaseControllerFlashState & { stage: FwStage.VersionConfirmed; finalVersion: string })
  | (BaseControllerFlashState & { stage: FwStage.Failed; error: string });
```

`pendingDetail` carries the firmware-provided `error` string verbatim (e.g., `"awaiting_post_reboot_version"`). Distinct field name from `error` so a TypeScript reader of `state.error` knows immediately that the controller is Failed, not Finalizing.

- [ ] **Step 3: Run the api build to see what breaks**

Run: `cd astros_api && npx tsc --noEmit`

Expected: errors in `flash_orchestrator.ts` (`isControllerStageTerminal` + `transitionControllerState` exhaustiveness, and possibly switch sites that don't handle Finalizing). These are *expected* — Tasks 3 and 5+ resolve them. Record the errors so you can use them as a worklist.

- [ ] **Step 4: Commit (type additions only; downstream fixes follow)**

```bash
git add astros_api/src/models/firmware/firmware_messages.ts astros_api/src/models/firmware/flash_job_state.ts
git commit -m "$(cat <<'EOF'
feat(firmware-types): add FwStage.Finalizing + ControllerFlashState arm

Adds the in-memory representation of the wire's PadawanStatus::PENDING:
a new non-terminal FwStage.Finalizing value and a corresponding arm on
the ControllerFlashState discriminated union carrying pendingDetail
(distinct field name from `error` to keep Failed and Finalizing
type-distinguishable). Downstream callers (state machine, orchestrator,
UI) will be updated in subsequent commits — TypeScript will flag every
unhandled site as a worklist.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Note: this commit intentionally leaves the build broken. The next commits restore it. This is the cleanest commit graph for review — each commit captures one conceptual change.

---

## Task 3: State machine — Finalizing transitions

**Files:**
- Modify: `astros_api/src/firmware/flash_job_state_machine.ts:18-33` (LEGAL_NEXT_STAGES)
- Modify: `astros_api/src/firmware/flash_job_state_machine.ts:73-125` (transition overloads + runtime check)
- Test: `astros_api/src/firmware/flash_job_state_machine.test.ts`

TDD. Pure logic, ideal for it.

- [ ] **Step 1: Find the existing transition test structure**

Run: `grep -n "describe\|it.*transition\|LEGAL_NEXT_STAGES" astros_api/src/firmware/flash_job_state_machine.test.ts | head -30`

Expected: a list of existing describe/it blocks for `transitionControllerState`. Read the file to understand the helper conventions (likely a `mkState()` helper that constructs a ControllerFlashState fixture).

- [ ] **Step 2: Add the failing tests**

Append to the appropriate describe block in `astros_api/src/firmware/flash_job_state_machine.test.ts`:

```typescript
describe('Finalizing transitions', () => {
  it('allows Sending → Finalizing with pendingDetail', () => {
    const sending: ControllerFlashState = {
      controllerId: 'c1',
      stage: FwStage.Sending,
      bytesSent: 100,
      totalBytes: 1000,
      detail: '',
    };
    const next = transitionControllerState(sending, FwStage.Finalizing, {
      pendingDetail: 'awaiting_post_reboot_version',
    });
    expect(next.stage).toBe(FwStage.Finalizing);
    if (next.stage !== FwStage.Finalizing) return;
    expect(next.pendingDetail).toBe('awaiting_post_reboot_version');
    expect(next.bytesSent).toBe(100); // carried forward
  });

  it('allows Rebooting → Finalizing (most common production path)', () => {
    const rebooting: ControllerFlashState = {
      controllerId: 'c1',
      stage: FwStage.Rebooting,
      bytesSent: 1000,
      totalBytes: 1000,
      detail: '',
    };
    const next = transitionControllerState(rebooting, FwStage.Finalizing, {
      pendingDetail: 'awaiting_post_reboot_version',
    });
    expect(next.stage).toBe(FwStage.Finalizing);
  });

  it('allows Queued → Finalizing (master with no FW_PROGRESS pre-DEPLOY_DONE)', () => {
    // Phase C master self-flash doesn't go through wire OTA, so OtaWriter
    // doesn't emit per-stage FW_PROGRESS for the master row. The master
    // row stays Queued until FW_DEPLOY_DONE arrives with PENDING.
    const queued: ControllerFlashState = {
      controllerId: '00:00:00:00:00:00',
      stage: FwStage.Queued,
      bytesSent: 0,
      totalBytes: 1000,
      detail: '',
    };
    const next = transitionControllerState(queued, FwStage.Finalizing, {
      pendingDetail: 'awaiting_post_reboot_version',
    });
    expect(next.stage).toBe(FwStage.Finalizing);
  });

  it('allows Finalizing → VersionConfirmed (heartbeat resolution)', () => {
    const finalizing: ControllerFlashState = {
      controllerId: 'c1',
      stage: FwStage.Finalizing,
      bytesSent: 1000,
      totalBytes: 1000,
      detail: '',
      pendingDetail: 'awaiting_post_reboot_version',
    };
    const next = transitionControllerState(finalizing, FwStage.VersionConfirmed, {
      finalVersion: '1.4.0',
    });
    expect(next.stage).toBe(FwStage.VersionConfirmed);
    if (next.stage !== FwStage.VersionConfirmed) return;
    expect(next.finalVersion).toBe('1.4.0');
  });

  it('allows Finalizing → Failed (90s timeout resolution)', () => {
    const finalizing: ControllerFlashState = {
      controllerId: 'c1',
      stage: FwStage.Finalizing,
      bytesSent: 1000,
      totalBytes: 1000,
      detail: '',
      pendingDetail: 'awaiting_post_reboot_version',
    };
    const next = transitionControllerState(finalizing, FwStage.Failed, {
      error: 'post_reboot_timeout',
    });
    expect(next.stage).toBe(FwStage.Failed);
  });

  it('rejects VersionConfirmed → Finalizing (terminal cannot regress)', () => {
    const vc: ControllerFlashState = {
      controllerId: 'c1',
      stage: FwStage.VersionConfirmed,
      bytesSent: 1000,
      totalBytes: 1000,
      detail: '',
      finalVersion: '1.4.0',
    };
    expect(() =>
      transitionControllerState(vc, FwStage.Finalizing, {
        pendingDetail: 'should-not-allow',
      }),
    ).toThrow(/illegal flash-job transition/);
  });

  it('throws when transitioning to Finalizing without pendingDetail', () => {
    const sending: ControllerFlashState = {
      controllerId: 'c1',
      stage: FwStage.Sending,
      bytesSent: 100,
      totalBytes: 1000,
      detail: '',
    };
    // Cast through `unknown` to bypass TS overload — runtime check is the
    // defense-in-depth guard for callers that bypass typing (matches the
    // pattern used by the existing finalVersion/error required-payload tests).
    expect(() =>
      transitionControllerState(sending, FwStage.Finalizing, undefined as unknown as {
        pendingDetail: string;
      }),
    ).toThrow(/requires pendingDetail/);
  });

  it('does not mark Finalizing as terminal', () => {
    expect(isControllerStageTerminal(FwStage.Finalizing)).toBe(false);
  });
});
```

- [ ] **Step 3: Run new tests to verify they fail**

Run: `cd astros_api && npx vitest run src/firmware/flash_job_state_machine.test.ts -t "Finalizing transitions"`

Expected: 8 FAIL with messages like "illegal flash-job transition: SENDING → FINALIZING" (the LEGAL_NEXT_STAGES map has no entries for Finalizing yet).

- [ ] **Step 4: Extend LEGAL_NEXT_STAGES**

Edit `astros_api/src/firmware/flash_job_state_machine.ts:18-33` — add Finalizing as a legal successor of every in-flight stage, and define Finalizing's own successors:

```typescript
const LEGAL_NEXT_STAGES: ReadonlyMap<FwStage, ReadonlySet<FwStage>> = new Map<
  FwStage,
  ReadonlySet<FwStage>
>([
  [
    FwStage.Queued,
    new Set([FwStage.Queued, FwStage.UploadingToMaster, FwStage.Finalizing, FwStage.Failed]),
  ],
  [
    FwStage.UploadingToMaster,
    new Set([FwStage.UploadingToMaster, FwStage.Sending, FwStage.Finalizing, FwStage.Failed]),
  ],
  [
    FwStage.Sending,
    new Set([FwStage.Sending, FwStage.Verifying, FwStage.Finalizing, FwStage.Failed]),
  ],
  [
    FwStage.Verifying,
    new Set([FwStage.Verifying, FwStage.Flashing, FwStage.Finalizing, FwStage.Failed]),
  ],
  [
    FwStage.Flashing,
    new Set([FwStage.Flashing, FwStage.Rebooting, FwStage.Finalizing, FwStage.Failed]),
  ],
  [
    FwStage.Rebooting,
    new Set([FwStage.Rebooting, FwStage.VersionConfirmed, FwStage.Finalizing, FwStage.Failed]),
  ],
  [
    FwStage.Finalizing,
    new Set([FwStage.Finalizing, FwStage.VersionConfirmed, FwStage.Failed]),
  ],
  [FwStage.VersionConfirmed, EMPTY_STAGE_SET],
  [FwStage.Failed, EMPTY_STAGE_SET],
]);
```

The self-edge on Finalizing isn't exercised in production (no progress updates fire during Finalizing) but matches the uniform pattern of other non-terminal stages.

- [ ] **Step 5: Add Finalizing overload + runtime check to transitionControllerState**

Edit `astros_api/src/firmware/flash_job_state_machine.ts:73-125`. Add the FinalizingPayload interface near the other payload interfaces (around lines 39-51) and a new overload + runtime branch:

After the `FailedPayload` interface declaration (around line 51), add:

```typescript
interface FinalizingPayload {
  pendingDetail: string;
}
```

In the `NonTerminalStage` union (around lines 53-59), Finalizing is intentionally NOT included — it has its own overload requiring a payload, just like VersionConfirmed and Failed.

Add a new overload signature alongside the existing VersionConfirmed/Failed/NonTerminalStage signatures (around lines 73-87):

```typescript
export function transitionControllerState(
  current: ControllerFlashState,
  toStage: FwStage.Finalizing,
  payload: FinalizingPayload,
): ControllerFlashState;
```

Extend the catch-all signature's payload type (around lines 88-92) to include FinalizingPayload's keys:

```typescript
export function transitionControllerState(
  current: ControllerFlashState,
  toStage: FwStage,
  payload?: InFlightTransitionPayload &
    Partial<VersionConfirmedPayload> &
    Partial<FailedPayload> &
    Partial<FinalizingPayload>,
): ControllerFlashState {
```

Add the runtime branch inside the function body, after the Failed branch (around lines 115-122):

```typescript
if (toStage === FwStage.Finalizing) {
  if (typeof payload?.pendingDetail !== 'string') {
    throw new Error(
      `flash-job transition to ${FwStage.Finalizing} requires pendingDetail in payload (controllerId=${current.controllerId})`,
    );
  }
  return { ...base, stage: FwStage.Finalizing, pendingDetail: payload.pendingDetail };
}
```

- [ ] **Step 6: Run new tests to verify they pass**

Run: `cd astros_api && npx vitest run src/firmware/flash_job_state_machine.test.ts`

Expected: ALL pass. Existing transition tests should also still pass — the new entries in LEGAL_NEXT_STAGES are additive.

- [ ] **Step 7: Pre-commit dance**

```bash
cd astros_api && npm run prettier:write && npm run lint:fix && npm run build && npx vitest run
```

Note: `npm run build` will STILL fail at this point because flash_orchestrator.ts (which uses `transitionControllerState` and switches on stage) hasn't been updated yet. Run just the state-machine tests instead: `npx vitest run src/firmware/flash_job_state_machine.test.ts`. Skip the cross-task build check; Task 5 restores it. Skip `requesting-code-review` for this commit too — the state machine in isolation is small enough that the review on the orchestrator commits will cover the FSM diff. (This is a deliberate carve-out for tightly-coupled tasks; usually each commit gets reviewed.)

- [ ] **Step 8: Commit**

```bash
git add astros_api/src/firmware/flash_job_state_machine.ts astros_api/src/firmware/flash_job_state_machine.test.ts
git commit -m "$(cat <<'EOF'
feat(firmware-fsm): support FwStage.Finalizing transitions

Extends LEGAL_NEXT_STAGES so any in-flight stage can transition to
Finalizing (the typical path is Queued → Finalizing for the master
self-flash, which doesn't emit per-stage FW_PROGRESS). Finalizing can
exit to VersionConfirmed (heartbeat resolution) or Failed (90s
timeout). isControllerStageTerminal correctly returns false for
Finalizing — the deploy lifecycle treats it as in-flight so the job
stays open until resolution.

Build remains broken pending the orchestrator changes that consume
this state — fix lands in the next commit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Orchestrator — add `finalizeTimer` field, opt, default constant

**Files:**
- Modify: `astros_api/src/firmware/flash_orchestrator.ts:316-317` (default constants)
- Modify: `astros_api/src/firmware/flash_orchestrator.ts:421-434` (FlashJobOrchestratorOpts.config)
- Modify: `astros_api/src/firmware/flash_orchestrator.ts:485-512` (private fields)
- Modify: `astros_api/src/firmware/flash_orchestrator.ts:551-563` (constructor)

Mechanical infrastructure additions. No new tests of their own — exercised by Tasks 5-8.

- [ ] **Step 1: Add the default constant**

Edit `astros_api/src/firmware/flash_orchestrator.ts:316-317`. After the existing `DEFAULT_THROTTLE_WINDOW_MS` constant, add:

```typescript
const DEFAULT_REBOOT_TIMEOUT_MS = 15_000;
const DEFAULT_THROTTLE_WINDOW_MS = 250;
// Phase C: covers worst-case master reboot (~5s) + SD remount (~3s) +
// first poll cycle (~2s) + ~10× safety margin. Per the Phase C firmware
// design Section 6 cross-repo coordination.
const DEFAULT_FINALIZE_TIMEOUT_MS = 90_000;
```

- [ ] **Step 2: Extend FlashJobOrchestratorOpts.config**

Edit `astros_api/src/firmware/flash_orchestrator.ts:421-434`. In the `FlashJobOrchestratorOpts` interface's `config` field, add `finalizeTimeoutMs`:

```typescript
export interface FlashJobOrchestratorOpts {
  bus: SerialBus;
  jobLock: JobLock;
  cache: { fetch(release: ReleaseInfo, asset: AssetInfo): Promise<CachedAsset> };
  upload: { latest(): Promise<StoredUpload | null> };
  releaseService: { getReleases(): Promise<ReleaseListResult> };
  controllersStore: FlashControllersStore;
  emitWs: (msg: FlashOrchestratorWsMessage) => void;
  streamerFactory?: (opts: { bus: SerialBus }) => Streamer;
  clock?: Clock;
  config?: { rebootTimeoutMs?: number; throttleWindowMs?: number; finalizeTimeoutMs?: number };
}
```

- [ ] **Step 3: Add the finalizeTimer field + readonly opt**

Edit `astros_api/src/firmware/flash_orchestrator.ts:485-512`. After the existing `private readonly throttleWindowMs: number;` field, add:

```typescript
  private readonly rebootTimeoutMs: number;
  private readonly throttleWindowMs: number;
  // Phase C: timeout for resolving FwStage.Finalizing rows after
  // FW_DEPLOY_DONE arrives with PENDING. Armed in handleDeployDone,
  // cleared by notifyMasterHeartbeat or by its own callback. Disposed
  // alongside rebootTimer in releaseLock.
  private readonly finalizeTimeoutMs: number;
```

And after the `private rebootTimer: NodeJS.Timeout | null = null;` field declaration (around line 512), add:

```typescript
  private rebootTimer: NodeJS.Timeout | null = null;
  // Phase C: armed when FW_DEPLOY_DONE arrives with any PENDING
  // (Finalizing) rows. Fire callback transitions Finalizing rows to
  // Failed("post_reboot_timeout") and completes the job. First-fire-wins
  // shared with notifyMasterHeartbeat via the null check at both sites.
  private finalizeTimer: NodeJS.Timeout | null = null;
```

- [ ] **Step 4: Wire up the constructor**

Edit `astros_api/src/firmware/flash_orchestrator.ts:551-563`. In the constructor, after the existing `this.throttleWindowMs = ...` line, add:

```typescript
    this.rebootTimeoutMs = opts.config?.rebootTimeoutMs ?? DEFAULT_REBOOT_TIMEOUT_MS;
    this.throttleWindowMs = opts.config?.throttleWindowMs ?? DEFAULT_THROTTLE_WINDOW_MS;
    this.finalizeTimeoutMs = opts.config?.finalizeTimeoutMs ?? DEFAULT_FINALIZE_TIMEOUT_MS;
```

- [ ] **Step 5: Verify type-check at this stage**

Run: `cd astros_api && npx tsc --noEmit 2>&1 | head -20`

Expected: errors remaining about Finalizing not being handled in switch sites (handleDeployDone outcome guard, etc.) — those are Task 5's work. The infrastructure additions themselves should compile cleanly.

- [ ] **Step 6: Commit (infrastructure only, no behavior yet)**

```bash
git add astros_api/src/firmware/flash_orchestrator.ts
git commit -m "$(cat <<'EOF'
feat(flash-orchestrator): scaffold finalizeTimer + 90s default + config opt

Adds the finalizeTimer field, DEFAULT_FINALIZE_TIMEOUT_MS constant
(90s), and finalizeTimeoutMs constructor opt (overridable via
FlashJobOrchestratorOpts.config — mirrors the existing rebootTimeoutMs
pattern so tests can inject short timeouts). No behavior change yet —
the handleDeployDone PENDING branch, completePendingResolution helper,
notifyMasterHeartbeat extension, and releaseLock disposer land in
subsequent commits.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Orchestrator — `handleDeployDone` PENDING branch

**Files:**
- Modify: `astros_api/src/firmware/flash_orchestrator.ts:1205-1321` (handleDeployDone)
- Test: `astros_api/src/firmware/flash_orchestrator.test.ts`

TDD. The most consequential server-side change — `handleDeployDone` now branches on PENDING, transitions to Finalizing, arms `finalizeTimer` (instead of `rebootTimer`), and intentionally does NOT emit `flashJobDone` while Finalizing rows exist.

- [ ] **Step 1: Find the existing flash_orchestrator test conventions**

Run: `grep -n "describe\|fakeClock\|FakeClock\|createOrchestrator\|mkOrchestrator\|emitWs" astros_api/src/firmware/flash_orchestrator.test.ts | head -50`

Expected: existing test fixture helpers. Read the file to understand:
- How a fake `Clock` is constructed (likely with `setTimeout` capturing callback + ms for deterministic firing).
- How `emitWs` is captured (likely a `vi.fn()` or a recorder).
- How a test driver simulates the streamer succeeding then drives the deploy event.

Familiarity with these helpers is required to write the new tests in their style.

- [ ] **Step 2: Add the failing tests — PENDING arrival + Finalizing arming**

Append to `astros_api/src/firmware/flash_orchestrator.test.ts` in the appropriate describe block (likely the `handleDeployDone` / deploy-phase describe):

```typescript
describe('Phase C: PENDING / Finalizing resolution', () => {
  it('transitions master PENDING row to Finalizing without emitting flashJobDone', async () => {
    const { orchestrator, emitWs, clock, driver } = makeOrchestratorHarness({
      // Set finalize timeout short enough for deterministic testing
      finalizeTimeoutMs: 1_000,
    });

    // Drive a deploy targeting one master + one padawan to completion of
    // the upload phase, then simulate FW_DEPLOY_DONE arrival with
    // master=PENDING + padawan=OK.
    await driver.startDeploy({
      targets: ['00:00:00:00:00:00', '11:22:33:44:55:66'],
    });
    await driver.completeUpload();
    driver.deliverDeployDone({
      results: [
        {
          controllerId: '00:00:00:00:00:00',
          outcome: 'PENDING',
          finalVersion: '',
          error: 'awaiting_post_reboot_version',
        },
        {
          controllerId: '11:22:33:44:55:66',
          outcome: 'OK',
          finalVersion: '1.4.0',
          error: '',
        },
      ],
    });

    const job = orchestrator.getCurrentJob();
    expect(job).not.toBeNull();
    const masterRow = job!.controllers.find((c) => c.controllerId === '00:00:00:00:00:00')!;
    expect(masterRow.stage).toBe(FwStage.Finalizing);
    if (masterRow.stage === FwStage.Finalizing) {
      expect(masterRow.pendingDetail).toBe('awaiting_post_reboot_version');
    }
    const padawanRow = job!.controllers.find((c) => c.controllerId === '11:22:33:44:55:66')!;
    expect(padawanRow.stage).toBe(FwStage.VersionConfirmed);

    // Crucial: no flashJobDone yet. The deploy holds open in Finalizing.
    const doneEmits = emitWs.mock.calls
      .map((c) => c[0])
      .filter((m) => m.type === TransmissionType.flashJobDone);
    expect(doneEmits).toHaveLength(0);

    // endedAt is undefined while Finalizing — a late-joining WS client
    // should still receive the snapshot.
    expect(job!.endedAt).toBeUndefined();
  });
});
```

You'll also need `makeOrchestratorHarness` to accept and forward `finalizeTimeoutMs` — locate the existing harness and add the field to its options. If the harness is named differently, adapt accordingly.

- [ ] **Step 3: Run the new test to verify it fails**

Run: `cd astros_api && npx vitest run src/firmware/flash_orchestrator.test.ts -t "PENDING.*Finalizing"`

Expected: FAIL. The current `handleDeployDone` either rejects the PENDING outcome (`protocol_violation`) or doesn't branch correctly. Read the failure to understand which.

- [ ] **Step 4: Extend the outcome guard in handleDeployDone**

Edit `astros_api/src/firmware/flash_orchestrator.ts:1218-1226`. Extend the for-loop guard:

```typescript
for (const r of results) {
  if (r.outcome !== 'OK' && r.outcome !== 'FAILED' && r.outcome !== 'PENDING') {
    this.failDeployPhase(
      'protocol_violation',
      `invalid outcome for controllerId=${r.controllerId}: ${String(r.outcome)}`,
    );
    return;
  }
}
```

- [ ] **Step 5: Add the PENDING transition branch**

Edit `astros_api/src/firmware/flash_orchestrator.ts:1239-1258`. Replace the existing if/else block with:

```typescript
let next: ControllerFlashState;
try {
  if (r.outcome === 'OK') {
    next = transitionControllerState(target, FwStage.VersionConfirmed, {
      finalVersion: r.finalVersion,
    });
  } else if (r.outcome === 'PENDING') {
    next = transitionControllerState(target, FwStage.Finalizing, {
      pendingDetail: r.error,
    });
  } else {
    next = transitionControllerState(target, FwStage.Failed, {
      error: r.error,
    });
  }
} catch (err) {
  // Illegal transition (e.g., terminal arriving when the controller
  // is already terminal — duplicate FW_DEPLOY_DONE). Surface as
  // protocol_violation; we'd rather flag this loudly than swallow
  // a master-side double-send bug.
  const detail = err instanceof Error ? err.message : String(err);
  this.failDeployPhase('protocol_violation', detail);
  return;
}
```

- [ ] **Step 6: Add the post-application Finalizing-vs-done branch**

Edit `astros_api/src/firmware/flash_orchestrator.ts:1295-1321`. Replace the existing lifecycle check + flashJobDone emit + rebootTimer arming block with:

```typescript
const lifecycle = deriveJobLifecycle(this.currentJob);
if (lifecycle !== 'done') {
  // Phase C: any Finalizing row keeps lifecycle off 'done'. Hold the
  // deploy open: do NOT emit flashJobDone yet. Arm finalizeTimer as the
  // safety fallback for the heartbeat-resolution path; on fire it
  // transitions Finalizing rows to Failed("post_reboot_timeout"). The
  // heartbeat path is in notifyMasterHeartbeat.
  const hasFinalizing = this.currentJob.controllers.some(
    (c) => c.stage === FwStage.Finalizing,
  );
  if (hasFinalizing) {
    this.finalizeTimer = this.clock.setTimeout(() => {
      this.finalizeTimer = null;
      this.completePendingResolution('timed_out');
    }, this.finalizeTimeoutMs);
  }
  // Otherwise still in_flight (mid-stage FW_PROGRESS rows present) —
  // unusual on FW_DEPLOY_DONE arrival but possible if the master
  // includes a controller whose flash isn't actually done. The
  // subscriber is already torn down above; nothing else to do.
  return;
}

const jobId = this.currentJob.jobId;
const endedAt = new Date(this.clock.now()).toISOString();
this.currentJob = { ...this.currentJob, endedAt };
this.phase = 'done';
this.safeEmitWs({
  type: TransmissionType.flashJobDone,
  data: { jobId, endedAt },
});

this.rebootTimer = this.clock.setTimeout(() => {
  this.rebootTimer = null;
  this.releaseLock(jobId);
}, this.rebootTimeoutMs);
```

Note: `completePendingResolution` is forward-referenced; implemented in the next step. The TS compiler will error on it temporarily — that's expected within this commit's mid-edits.

- [ ] **Step 7: Add the completePendingResolution helper**

Edit `astros_api/src/firmware/flash_orchestrator.ts`. Insert this method between `handleDeployDone` (ends ~line 1321) and `failDeployPhase` (starts ~line 1327):

```typescript
// Phase C: single resolution path for Finalizing rows. Called from
// notifyMasterHeartbeat (heartbeat-confirmed, version supplied) or
// from the finalizeTimer's fire callback (timeout, version absent).
// Mutates every Finalizing row to its terminal equivalent, emits
// flashControllerResult per mutated row, emits the job-wide
// flashJobDone, and releases the lock immediately — no rebootTimer
// grace period because the resolution signal (heartbeat or timeout)
// already settles the master's post-reboot state.
private completePendingResolution(
  outcome: 'confirmed' | 'timed_out',
  version?: string,
): void {
  if (this.currentJob === null) return;
  const jobId = this.currentJob.jobId;

  const updated: ControllerFlashState[] = [];
  for (const c of this.currentJob.controllers) {
    if (c.stage !== FwStage.Finalizing) {
      updated.push(c);
      continue;
    }
    let next: ControllerFlashState;
    if (outcome === 'confirmed') {
      if (typeof version !== 'string') {
        throw new Error(
          `completePendingResolution: 'confirmed' outcome requires version`,
        );
      }
      next = transitionControllerState(c, FwStage.VersionConfirmed, {
        finalVersion: version,
      });
    } else {
      next = transitionControllerState(c, FwStage.Failed, {
        error: 'post_reboot_timeout',
      });
    }
    updated.push(next);
    this.safeEmitWs({
      type: TransmissionType.flashControllerResult,
      data: { jobId, controller: next },
    });
  }
  this.currentJob = { ...this.currentJob, controllers: updated };

  const endedAt = new Date(this.clock.now()).toISOString();
  this.currentJob = { ...this.currentJob, endedAt };
  this.phase = 'done';
  this.safeEmitWs({
    type: TransmissionType.flashJobDone,
    data: { jobId, endedAt },
  });
  this.releaseLock(jobId);
}
```

- [ ] **Step 8: Run the Phase C test to verify the Finalizing-arming test passes**

Run: `cd astros_api && npx vitest run src/firmware/flash_orchestrator.test.ts -t "PENDING.*Finalizing"`

Expected: PASS. The master row transitions to Finalizing, no flashJobDone is emitted, endedAt is undefined, finalizeTimer is armed (verifiable by inspecting the fake clock's pending timers if your harness exposes them, OR by advancing the clock past the timeout and asserting the timeout-resolution behavior in a later test).

Run the full orchestrator suite too: `npx vitest run src/firmware/flash_orchestrator.test.ts`

Expected: no regressions in pre-existing tests. If any pre-existing OK-only-rows test now fails (because it asserted "flashJobDone emitted immediately" but the order of operations subtly changed), inspect — the spec requires that lifecycle-done-without-PENDING preserves the existing behavior exactly.

- [ ] **Step 9: Pre-commit dance + code review**

```bash
cd astros_api && npm run prettier:write && npm run lint:fix && npm run build && npx vitest run
```

Build should now PASS (the FwStage.Finalizing + ControllerFlashState union are now consumed; switch sites in the orchestrator have a case for Finalizing).

Then `superpowers:requesting-code-review` on the diff vs the previous commit, with the prompt: "find anything wrong with the handleDeployDone PENDING branch and the new completePendingResolution helper. Specifically check: (1) does the lifecycle gate correctly hold flashJobDone for Finalizing rows? (2) is completePendingResolution's setting of `phase='done'` correctly ordered with the flashJobDone emit (cancel race window)? (3) any contract drift with the parser at message_handler.ts (Task 1 commit)?" Address Critical and Important findings.

- [ ] **Step 10: Commit**

```bash
git add astros_api/src/firmware/flash_orchestrator.ts astros_api/src/firmware/flash_orchestrator.test.ts
git commit -m "$(cat <<'EOF'
feat(flash-orchestrator): hold deploy in Finalizing on PENDING rows

handleDeployDone now branches on the PENDING outcome: master rows
transition to FwStage.Finalizing instead of a terminal state, and
flashJobDone is deliberately NOT emitted while any Finalizing row
exists. The deploy holds open and arms a 90s finalizeTimer as a
safety fallback. Resolution arrives via either the existing
notifyMasterHeartbeat (extended in the next commit) or the timer
itself; completePendingResolution centralizes the row-mutation +
flashJobDone emit + lock release into one path.

The pre-Phase-C behavior (no Finalizing rows → emit flashJobDone +
arm rebootTimer 15s + heartbeat or timer releases) is preserved
unchanged for padawan-only and master-FAILED deploys.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Orchestrator — `notifyMasterHeartbeat` Finalizing resolution branch

**Files:**
- Modify: `astros_api/src/firmware/flash_orchestrator.ts:1009-1039` (notifyMasterHeartbeat)
- Test: `astros_api/src/firmware/flash_orchestrator.test.ts`

TDD. The heartbeat resolution path is what makes Phase C complete — without it, every PENDING row times out to FAILED after 90s, which is wrong UX.

- [ ] **Step 1: Add the failing tests for the heartbeat-resolution path**

Append to the `'Phase C: PENDING / Finalizing resolution'` describe block:

```typescript
it('resolves Finalizing → VersionConfirmed when master heartbeat arrives', async () => {
  const { orchestrator, emitWs, clock, driver } = makeOrchestratorHarness({
    finalizeTimeoutMs: 60_000, // Long enough that timer doesn't fire
  });

  await driver.startDeploy({ targets: ['00:00:00:00:00:00'] });
  await driver.completeUpload();
  driver.deliverDeployDone({
    results: [
      {
        controllerId: '00:00:00:00:00:00',
        outcome: 'PENDING',
        finalVersion: '',
        error: 'awaiting_post_reboot_version',
      },
    ],
  });

  // Heartbeat arrives carrying the deployed target version
  orchestrator.notifyMasterHeartbeat('1.4.0');

  const job = orchestrator.getCurrentJob();
  expect(job).toBeNull(); // releaseLock has cleared currentJob

  const controllerResults = emitWs.mock.calls
    .map((c) => c[0])
    .filter((m) => m.type === TransmissionType.flashControllerResult);
  expect(controllerResults).toHaveLength(1);
  const masterResult = controllerResults[0].data.controller;
  expect(masterResult.stage).toBe(FwStage.VersionConfirmed);
  if (masterResult.stage === FwStage.VersionConfirmed) {
    expect(masterResult.finalVersion).toBe('1.4.0');
  }

  const doneEmits = emitWs.mock.calls
    .map((c) => c[0])
    .filter((m) => m.type === TransmissionType.flashJobDone);
  expect(doneEmits).toHaveLength(1);
});

it('resolves Finalizing → Failed("post_reboot_timeout") on finalizeTimer fire', async () => {
  const { orchestrator, emitWs, clock, driver } = makeOrchestratorHarness({
    finalizeTimeoutMs: 1_000,
  });

  await driver.startDeploy({ targets: ['00:00:00:00:00:00'] });
  await driver.completeUpload();
  driver.deliverDeployDone({
    results: [
      {
        controllerId: '00:00:00:00:00:00',
        outcome: 'PENDING',
        finalVersion: '',
        error: 'awaiting_post_reboot_version',
      },
    ],
  });

  // Advance the fake clock past the finalizeTimeoutMs
  clock.advance(1_000);

  const controllerResults = emitWs.mock.calls
    .map((c) => c[0])
    .filter((m) => m.type === TransmissionType.flashControllerResult);
  expect(controllerResults).toHaveLength(1);
  const masterResult = controllerResults[0].data.controller;
  expect(masterResult.stage).toBe(FwStage.Failed);
  if (masterResult.stage === FwStage.Failed) {
    expect(masterResult.error).toBe('post_reboot_timeout');
  }

  const doneEmits = emitWs.mock.calls
    .map((c) => c[0])
    .filter((m) => m.type === TransmissionType.flashJobDone);
  expect(doneEmits).toHaveLength(1);

  expect(orchestrator.getCurrentJob()).toBeNull(); // lock released
});

it('first-fire-wins: heartbeat racing the timer fires only once (mutation guard)', async () => {
  // This test catches a regression where notifyMasterHeartbeat doesn't
  // clear finalizeTimer before completing — a late timer-fire would
  // then attempt to mutate an already-terminal controller and either
  // throw or emit duplicate flashJobDone. Per CLAUDE.md mutation-test
  // discipline: a reviewer should be able to revert the timer-clear
  // line in notifyMasterHeartbeat and watch this test fail.
  const { orchestrator, emitWs, clock, driver } = makeOrchestratorHarness({
    finalizeTimeoutMs: 1_000,
  });

  await driver.startDeploy({ targets: ['00:00:00:00:00:00'] });
  await driver.completeUpload();
  driver.deliverDeployDone({
    results: [
      {
        controllerId: '00:00:00:00:00:00',
        outcome: 'PENDING',
        finalVersion: '',
        error: 'awaiting_post_reboot_version',
      },
    ],
  });

  // Heartbeat arrives BEFORE the timer fires
  orchestrator.notifyMasterHeartbeat('1.4.0');

  // Now advance past the timeout — the timer SHOULD have been cleared
  // by notifyMasterHeartbeat, so this should be a no-op.
  clock.advance(2_000);

  const doneEmits = emitWs.mock.calls
    .map((c) => c[0])
    .filter((m) => m.type === TransmissionType.flashJobDone);
  expect(doneEmits).toHaveLength(1); // exactly one, not two
});
```

- [ ] **Step 2: Run new tests to verify they fail**

Run: `cd astros_api && npx vitest run src/firmware/flash_orchestrator.test.ts -t "PENDING.*Finalizing"`

Expected: 2 of the 3 new tests FAIL (the heartbeat-resolution and first-fire-wins ones). The timeout test should PASS already because Task 5's `handleDeployDone` arms the finalizeTimer with `completePendingResolution('timed_out')` as the callback.

- [ ] **Step 3: Extend notifyMasterHeartbeat**

Edit `astros_api/src/firmware/flash_orchestrator.ts:1009-1039`. Replace the entire `notifyMasterHeartbeat` method with:

```typescript
/**
 * Post-deploy heartbeat from the master (carries its now-running version).
 * Two resolution paths:
 *
 *   1. Phase C — Finalizing path: if `finalizeTimer` is armed, the deploy
 *      is holding open on a Finalizing master row. The heartbeat proves
 *      the master booted into the expected version. Clear the timer,
 *      mutate every Finalizing row to VersionConfirmed via
 *      `completePendingResolution`, emit flashJobDone, release lock.
 *
 *   2. Pre-Phase-C path: if `rebootTimer` is armed (lifecycle === 'done'
 *      with no Finalizing rows — padawan-only or master-FAILED deploys),
 *      clear it and release the lock without mutating any rows. This
 *      preserves the existing 15s post-deploy grace-period semantics.
 *
 * Outside both windows the call is a no-op (out-of-protocol heartbeats:
 * pre-job, mid-upload, mid-deploy, post-release).
 */
notifyMasterHeartbeat(version: string): void {
  if (this.finalizeTimer !== null) {
    if (this.currentJob === null) {
      throw new Error(
        'flash orchestrator invariant: finalizeTimer is set but currentJob is null',
      );
    }
    this.clock.clearTimeout(this.finalizeTimer);
    this.finalizeTimer = null;
    this.completePendingResolution('confirmed', version);
    return;
  }

  if (this.rebootTimer === null) return;
  if (this.currentJob === null) {
    throw new Error('flash orchestrator invariant: rebootTimer is set but currentJob is null');
  }
  const jobId = this.currentJob.jobId;
  this.clock.clearTimeout(this.rebootTimer);
  this.rebootTimer = null;
  this.releaseLock(jobId);
}
```

Note: the existing `// eslint-disable-next-line @typescript-eslint/no-unused-vars` and `_version` parameter are gone. The `version` parameter is now load-bearing (passed to `completePendingResolution`).

- [ ] **Step 4: Run the Phase C tests to verify all pass**

Run: `cd astros_api && npx vitest run src/firmware/flash_orchestrator.test.ts -t "Phase C: PENDING"`

Expected: ALL 4 Phase C tests pass. Also run the full file to check no regressions: `npx vitest run src/firmware/flash_orchestrator.test.ts`

- [ ] **Step 5: Manually verify the first-fire-wins mutation guard works as advertised**

Per CLAUDE.md `feedback_mutation_test_defensive_features`: temporarily revert ONE line in notifyMasterHeartbeat:

```typescript
// this.clock.clearTimeout(this.finalizeTimer);  // <-- comment out
this.finalizeTimer = null;
```

Re-run: `npx vitest run src/firmware/flash_orchestrator.test.ts -t "first-fire-wins"`

Expected: the first-fire-wins test now FAILS (the timer fires after the heartbeat-resolution completes, producing a second flashJobDone or attempting to mutate already-terminal rows). Restore the line and verify it passes again.

If the test doesn't fail with the line commented out, the assertion is vacuous — strengthen the test (e.g., check that the timer was canceled via the fake clock's pending-timers count, or that no duplicate flashControllerResult was emitted).

- [ ] **Step 6: Pre-commit dance + code review**

```bash
cd astros_api && npm run prettier:write && npm run lint:fix && npm run build && npx vitest run
```

Then `superpowers:requesting-code-review` on the diff. Prompt: "find anything wrong with the notifyMasterHeartbeat extension. Specifically check: (1) is the order of timer-clear-then-mutate correct against a re-entrant heartbeat (heartbeat fires while completePendingResolution is running)? (2) does the existing pre-Phase-C branch (rebootTimer path) still behave correctly for padawan-only deploys? (3) is the invariant throw (`finalizeTimer is set but currentJob is null`) reachable in any non-bug scenario?" Address findings.

- [ ] **Step 7: Commit**

```bash
git add astros_api/src/firmware/flash_orchestrator.ts astros_api/src/firmware/flash_orchestrator.test.ts
git commit -m "$(cat <<'EOF'
feat(flash-orchestrator): resolve Finalizing rows on master heartbeat

notifyMasterHeartbeat now branches up front: when finalizeTimer is
armed (Phase C path), the heartbeat proves the master booted into the
expected version — mutate every Finalizing row to VersionConfirmed
with the heartbeat-carried version, emit flashJobDone, release lock
immediately. The pre-Phase-C branch (rebootTimer for padawan-only and
master-FAILED deploys) is preserved unchanged.

First-fire-wins: clearing finalizeTimer before completePendingResolution
prevents a racing timer-fire from double-completing. Mutation-tested
per the team's defensive-feature discipline.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Orchestrator — `releaseLock` disposes finalizeTimer + cancel-during-Finalizing test

**Files:**
- Modify: `astros_api/src/firmware/flash_orchestrator.ts:1073-1133` (releaseLock)
- Test: `astros_api/src/firmware/flash_orchestrator.test.ts`

`releaseLock` is the canonical teardown path — every cleanup site funnels through it. The Phase C `finalizeTimer` must be disposed alongside `rebootTimer`. The cancel-during-Finalizing path (operator cancels while a PENDING row is unresolved) routes through `failJob → releaseLock`, and the Finalizing row is non-terminal so `failNonTerminalControllers` transitions it to Failed.

- [ ] **Step 1: Add the failing test for cancel-during-Finalizing**

Append to the `'Phase C: PENDING / Finalizing resolution'` describe block:

```typescript
it('cancel during Finalizing fails the row and releases the lock', async () => {
  const { orchestrator, emitWs, clock, driver } = makeOrchestratorHarness({
    finalizeTimeoutMs: 60_000,
  });

  await driver.startDeploy({ targets: ['00:00:00:00:00:00'] });
  await driver.completeUpload();
  driver.deliverDeployDone({
    results: [
      {
        controllerId: '00:00:00:00:00:00',
        outcome: 'PENDING',
        finalVersion: '',
        error: 'awaiting_post_reboot_version',
      },
    ],
  });

  // Operator cancels mid-Finalizing
  const result = await orchestrator.cancel('operator_cancel');
  expect(result).not.toBeNull();

  // Master row was Finalizing → cancel transitions it to Failed via
  // failNonTerminalControllers, then emits flashJobFailed and releases lock.
  const failedEmits = emitWs.mock.calls
    .map((c) => c[0])
    .filter((m) => m.type === TransmissionType.flashJobFailed);
  expect(failedEmits).toHaveLength(1);
  expect(failedEmits[0].data.reason).toBe('aborted');
  expect(failedEmits[0].data.abortReason).toBe('operator_cancel');

  expect(orchestrator.getCurrentJob()).toBeNull(); // lock released

  // Advance the fake clock past the original finalize timeout — the
  // timer should have been disposed by releaseLock, so no further
  // emits should fire.
  const emitsBeforeAdvance = emitWs.mock.calls.length;
  clock.advance(120_000);
  expect(emitWs.mock.calls.length).toBe(emitsBeforeAdvance);
});
```

- [ ] **Step 2: Run new test to verify it fails (or partially passes)**

Run: `cd astros_api && npx vitest run src/firmware/flash_orchestrator.test.ts -t "cancel during Finalizing"`

Expected: likely PARTIALLY FAILS — the first half (cancel → Failed emit) probably works because the existing `cancel('deploy')` path routes through `failJob → failNonTerminalControllers → releaseLock`. The second half (clock advance → no further emits) likely FAILS because `releaseLock` doesn't dispose `finalizeTimer` yet, so the timer fires 60s later and emits a duplicate `flashJobDone` against a null `currentJob`.

- [ ] **Step 3: Extend releaseLock to dispose finalizeTimer**

Edit `astros_api/src/firmware/flash_orchestrator.ts:1073-1133`. Add the finalizeTimer dispose block alongside the existing rebootTimer dispose (around the top of the method body, between the `rebootTimer` block and the `deployUnsubscriber` block):

```typescript
private releaseLock(jobId: string): void {
  if (this.rebootTimer !== null) {
    try {
      this.clock.clearTimeout(this.rebootTimer);
    } catch (err) {
      logger.error(
        err,
        `flash orchestrator: clock.clearTimeout threw during releaseLock for job=${jobId}`,
      );
    }
    this.rebootTimer = null;
  }
  if (this.finalizeTimer !== null) {
    // Phase C: cover cancel-during-Finalizing and any other path that
    // releases the lock with a still-armed finalizeTimer. Same idempotent
    // pattern as rebootTimer above; a throw here would propagate up
    // through failJob into the bus's deploy-event dispatcher and take
    // down the worker.
    try {
      this.clock.clearTimeout(this.finalizeTimer);
    } catch (err) {
      logger.error(
        err,
        `flash orchestrator: clock.clearTimeout threw during releaseLock (finalizeTimer) for job=${jobId}`,
      );
    }
    this.finalizeTimer = null;
  }
  if (this.deployUnsubscriber !== null) {
    // ... rest unchanged ...
  }
  // ... rest of releaseLock unchanged ...
}
```

- [ ] **Step 4: Run the cancel test to verify it now passes**

Run: `cd astros_api && npx vitest run src/firmware/flash_orchestrator.test.ts -t "cancel during Finalizing"`

Expected: PASS.

- [ ] **Step 5: Run the full orchestrator suite to confirm no regressions**

Run: `cd astros_api && npx vitest run src/firmware/flash_orchestrator.test.ts`

Expected: all pass.

- [ ] **Step 6: Pre-commit dance + code review**

```bash
cd astros_api && npm run prettier:write && npm run lint:fix && npm run build && npx vitest run
```

Then `superpowers:requesting-code-review`. Prompt: "find anything wrong with the releaseLock finalizeTimer disposal. Specifically check: (1) does the dispose order matter (rebootTimer first vs finalizeTimer first)? (2) is the cancel-during-Finalizing test asserting the right thing — specifically that the finalizeTimer is REALLY cleared rather than just suppressed by some other side effect? (3) does the existing pre-Phase-C cancel-during-deploy test still pass?" Address findings.

- [ ] **Step 7: Commit**

```bash
git add astros_api/src/firmware/flash_orchestrator.ts astros_api/src/firmware/flash_orchestrator.test.ts
git commit -m "$(cat <<'EOF'
feat(flash-orchestrator): dispose finalizeTimer in releaseLock

Covers the cancel-during-Finalizing path and any other teardown route
that fires while finalizeTimer is armed. Without this, a cancel mid-
Finalizing would clear currentJob via failJob but leave the 90s timer
running — it would then fire against a null currentJob, emitting a
spurious second flashJobDone after the operator already saw the cancel.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Late-join snapshot — pin Finalizing-state behavior

**Files:**
- Test: `astros_api/src/firmware/late_join_snapshot.test.ts`

No production-code change — `decideLateJoinSnapshot` already returns the in-flight snapshot when `endedAt === undefined`, and Finalizing rows leave `endedAt` undefined. This task adds a regression test pinning the behavior so a future refactor that decides to skip the snapshot during Finalizing would surface immediately.

- [ ] **Step 1: Find the existing late-join test conventions**

Run: `grep -n "describe\|decideLateJoinSnapshot\|kind.*flashJobStarted" astros_api/src/firmware/late_join_snapshot.test.ts`

Expected: existing test fixtures. Read for style.

- [ ] **Step 2: Add the failing-because-missing test**

Append to the existing describe block in `astros_api/src/firmware/late_join_snapshot.test.ts`:

```typescript
it('returns flashJobStarted snapshot while a Finalizing row exists', () => {
  // Phase C: during the PENDING-resolution window (after FW_DEPLOY_DONE,
  // before notifyMasterHeartbeat or finalize timeout), the deploy is
  // in-flight and endedAt is undefined. A late-joining WS client should
  // receive the snapshot with Finalizing rows so its UI shows the
  // "Finalizing…" pill rather than nothing.
  const job: FlashJobState = {
    jobId: 'job-1',
    source: {
      kind: 'github',
      version: '1.4.0',
      sha256: 'a'.repeat(64),
      sizeBytes: 1000,
      displayName: 'astros-esp 1.4.0 (lolin_d32_pro)',
    },
    controllers: [
      {
        controllerId: '00:00:00:00:00:00',
        stage: FwStage.Finalizing,
        bytesSent: 1000,
        totalBytes: 1000,
        detail: '',
        pendingDetail: 'awaiting_post_reboot_version',
      },
      {
        controllerId: '11:22:33:44:55:66',
        stage: FwStage.VersionConfirmed,
        bytesSent: 1000,
        totalBytes: 1000,
        detail: '',
        finalVersion: '1.4.0',
      },
    ],
    startedAt: '2026-05-28T15:00:00Z',
    // endedAt deliberately undefined — Finalizing keeps the deploy open
  };
  const snapshot = decideLateJoinSnapshot(job);
  expect(snapshot.kind).toBe('flashJobStarted');
  if (snapshot.kind === 'flashJobStarted') {
    expect(snapshot.data).toBe(job);
  }
});
```

- [ ] **Step 3: Run the test to verify it passes**

Run: `cd astros_api && npx vitest run src/firmware/late_join_snapshot.test.ts -t "Finalizing"`

Expected: PASS immediately — no production code change needed. This is a regression pin.

If it FAILS, the production code in `late_join_snapshot.ts` doesn't handle Finalizing correctly and needs fixing — investigate and report. (Per the spec, this shouldn't happen because the existing `endedAt === undefined` gate covers it, but confirm.)

- [ ] **Step 4: Pre-commit dance (no code review — test-only change)**

```bash
cd astros_api && npm run prettier:write && npm run lint:fix && npx vitest run
```

Skip `superpowers:requesting-code-review` for test-only commits per the CLAUDE.md carve-out logic (no source change, no behavior risk).

- [ ] **Step 5: Commit**

```bash
git add astros_api/src/firmware/late_join_snapshot.test.ts
git commit -m "$(cat <<'EOF'
test(late-join-snapshot): pin Finalizing-row snapshot behavior

Regression pin: a late-joining WS client during the PENDING-resolution
window should receive the in-flight snapshot with Finalizing rows.
decideLateJoinSnapshot already does the right thing (endedAt is
undefined during Finalizing), but a future refactor that decides to
suppress the snapshot during Finalizing should surface immediately.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: UI types — extend ServerFwStage, ControllerFlashState, FirmwareStatusPillKind, FLASH_ERROR_REASONS

**Files:**
- Modify: `astros_vue/src/types/firmware.ts`

Type-only commit — pure additions. The TypeScript compiler is the worklist; running `npm run build` will surface every consumer that needs the new case (Tasks 10-12 fix them).

- [ ] **Step 1: Extend ServerFwStage**

Edit `astros_vue/src/types/firmware.ts:224-232`:

```typescript
export type ServerFwStage =
  | 'QUEUED'
  | 'UPLOADING_TO_MASTER'
  | 'SENDING'
  | 'VERIFYING'
  | 'FLASHING'
  | 'REBOOTING'
  | 'FINALIZING'
  | 'VERSION_CONFIRMED'
  | 'FAILED';
```

- [ ] **Step 2: Extend FirmwareStatusPillKind**

Edit `astros_vue/src/types/firmware.ts:95-103`:

```typescript
export type FirmwareStatusPillKind =
  | 'idle'
  | 'queued'
  | 'updating'
  | 'finalizing'
  | 'done'
  | 'failed'
  | 'upToDate'
  | 'offline'
  | 'downgrade';
```

- [ ] **Step 3: Extend both ControllerFlashState unions**

Edit `astros_vue/src/types/firmware.ts:262-285`. Add the Finalizing arm to both `ControllerFlashState` (wire form) and `ControllerFlashStateBySlot` (in-store form):

```typescript
export type ControllerFlashState =
  | {
      controllerId: string;
      stage: 'QUEUED' | 'UPLOADING_TO_MASTER' | 'SENDING' | 'VERIFYING' | 'FLASHING' | 'REBOOTING';
      bytesSent?: number;
      totalBytes?: number;
    }
  | { controllerId: string; stage: 'FINALIZING'; pendingDetail: string }
  | { controllerId: string; stage: 'VERSION_CONFIRMED'; finalVersion: string }
  | { controllerId: string; stage: 'FAILED'; error: string };

export type ControllerFlashStateBySlot =
  | {
      controllerId: SlotId;
      stage: 'QUEUED' | 'UPLOADING_TO_MASTER' | 'SENDING' | 'VERIFYING' | 'FLASHING' | 'REBOOTING';
      bytesSent?: number;
      totalBytes?: number;
    }
  | { controllerId: SlotId; stage: 'FINALIZING'; pendingDetail: string }
  | { controllerId: SlotId; stage: 'VERSION_CONFIRMED'; finalVersion: string }
  | { controllerId: SlotId; stage: 'FAILED'; error: string };
```

- [ ] **Step 4: Add post_reboot_timeout to FLASH_ERROR_REASONS**

Edit `astros_vue/src/types/firmware.ts:162-205`. Add `'post_reboot_timeout'` to the tuple — best placed alongside related deploy-phase reasons:

```typescript
export const FLASH_ERROR_REASONS = [
  'invalid_body',
  'job_already_running',
  // ... existing entries ...
  'protocol_violation',
  'streamer_unknown_error',
  // Phase C: server-emitted when a Finalizing row's 90s safety timer
  // fires before the master's post-reboot heartbeat arrives. The
  // operator's per-row error renders the firmware_view.flash_errors.
  // post_reboot_timeout copy.
  'post_reboot_timeout',
  // Streamer-emitted reasons ...
  'source_read_failed',
  // ... rest unchanged ...
] as const;
```

Place `'post_reboot_timeout'` between `streamer_unknown_error` and the streamer-emitted block to group it with orchestrator-emitted reasons (matches the comment-block structure already in place).

- [ ] **Step 5: Run vue build to inventory broken consumers**

Run: `cd astros_vue && npx vue-tsc --noEmit 2>&1 | head -30`

Expected: errors in `firmwareStageMapping.ts` (missing case in exhaustiveness switches) and possibly `stores/firmware.ts`. Capture the file:line list — Tasks 10 and 11 resolve them.

- [ ] **Step 6: Commit (types-only; consumers fixed next)**

```bash
git add astros_vue/src/types/firmware.ts
git commit -m "$(cat <<'EOF'
feat(firmware-ui-types): add FINALIZING + 'finalizing' pill + post_reboot_timeout

Mirrors the server-side FwStage.Finalizing addition: ServerFwStage,
both ControllerFlashState unions (wire + BySlot), FirmwareStatusPillKind,
and the FLASH_ERROR_REASONS tuple. Without the FLASH_ERROR_REASONS
entry the store's KNOWN_FLASH_ERROR_REASONS.has(reason) check would
silently reject post_reboot_timeout and the operator would see a
generic banner instead of the specific copy.

vue-tsc errors in firmwareStageMapping.ts and stores/firmware.ts are
expected and fixed in the next two commits.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: UI stage mapping — handle FINALIZING

**Files:**
- Modify: `astros_vue/src/utils/firmwareStageMapping.ts`
- Test: `astros_vue/src/utils/__tests__/firmwareStageMapping.spec.ts`

TDD. Pure-function mapping logic.

- [ ] **Step 1: Find existing stage-mapping test conventions**

Run: `grep -n "describe\|it\|mapServerStageToUiStage\|controllerStatePillKind" astros_vue/src/utils/__tests__/firmwareStageMapping.spec.ts`

Read the file for fixture/helper style.

- [ ] **Step 2: Add the failing tests**

Append to the existing describe block(s) in `astros_vue/src/utils/__tests__/firmwareStageMapping.spec.ts`:

```typescript
describe('Phase C: FINALIZING mapping', () => {
  it('maps server FINALIZING to null UI stage row', () => {
    // No global stage row for Finalizing — the per-controller pill
    // carries the affordance. The global stage indicator stays at
    // whatever the prior stage was.
    expect(mapServerStageToUiStage('FINALIZING')).toBeNull();
  });

  it('maps Finalizing controller state to the "finalizing" pill kind', () => {
    const state: ControllerFlashState = {
      controllerId: '00:00:00:00:00:00',
      stage: 'FINALIZING',
      pendingDetail: 'awaiting_post_reboot_version',
    };
    expect(controllerStatePillKind(state)).toBe('finalizing');
  });

  it('returns null stage label key for FINALIZING', () => {
    const state: ControllerFlashState = {
      controllerId: '00:00:00:00:00:00',
      stage: 'FINALIZING',
      pendingDetail: 'awaiting_post_reboot_version',
    };
    expect(controllerStageLabelKey(state)).toBeNull();
  });
});
```

- [ ] **Step 3: Run new tests to verify they fail**

Run: `cd astros_vue && npx vitest run src/utils/__tests__/firmwareStageMapping.spec.ts -t "FINALIZING"`

Expected: FAIL. The default branch's `console.warn` fires (current behavior is "unknown stage" warn + return null/`'updating'`), so the assertion about `'finalizing'` pill kind fails specifically.

- [ ] **Step 4: Add the FINALIZING cases**

Edit `astros_vue/src/utils/firmwareStageMapping.ts:15-49`. In `mapServerStageToUiStage`, add FINALIZING to the null-mapping cases:

```typescript
export function mapServerStageToUiStage(stage: ServerFwStage): FirmwareStage | null {
  switch (stage) {
    case 'UPLOADING_TO_MASTER':
      return 'download';
    case 'SENDING':
      return 'transfer';
    case 'VERIFYING':
      return 'verify';
    case 'FLASHING':
      return 'flash';
    case 'REBOOTING':
      return 'reboot';
    case 'QUEUED':
    case 'FINALIZING':
    case 'VERSION_CONFIRMED':
    case 'FAILED':
      // FINALIZING is post-reboot; the per-controller pill renders the
      // "Finalizing…" affordance. No global stage row advances during
      // this window.
      return null;
    default: {
      // ... existing exhaustiveness fallback unchanged ...
    }
  }
}
```

Edit `astros_vue/src/utils/firmwareStageMapping.ts:52-83`. In `controllerStatePillKind`, add the FINALIZING case:

```typescript
export function controllerStatePillKind(state: ControllerFlashState): FirmwareStatusPillKind {
  switch (state.stage) {
    case 'QUEUED':
      return 'queued';
    case 'UPLOADING_TO_MASTER':
    case 'SENDING':
    case 'VERIFYING':
    case 'FLASHING':
    case 'REBOOTING':
      return 'updating';
    case 'FINALIZING':
      return 'finalizing';
    case 'VERSION_CONFIRMED':
      return 'done';
    case 'FAILED':
      return 'failed';
    default: {
      // ... existing exhaustiveness fallback unchanged ...
    }
  }
}
```

- [ ] **Step 5: Run all stage-mapping tests + the vue build**

Run from `astros_vue/`:

```bash
npx vitest run src/utils/__tests__/firmwareStageMapping.spec.ts
npx vue-tsc --noEmit 2>&1 | head -30
```

Expected: tests PASS. The build will likely STILL show errors in `stores/firmware.ts` — that's Task 11.

- [ ] **Step 6: Pre-commit dance + code review**

```bash
cd astros_vue && npm run format && npm run lint && npx vitest run src/utils/__tests__/firmwareStageMapping.spec.ts
```

(`npm run format` runs prettier on vue; `npm run lint` is the eslint fix.)

Then `superpowers:requesting-code-review`. Prompt: "find anything wrong with the FINALIZING stage-mapping cases. Specifically check: (1) is the `null` return for `mapServerStageToUiStage('FINALIZING')` the right operator UX (the global stage row freezes at the prior stage)? (2) does the exhaustiveness `never` guard still fire for genuine unknowns?" Address findings.

- [ ] **Step 7: Commit**

```bash
git add astros_vue/src/utils/firmwareStageMapping.ts astros_vue/src/utils/__tests__/firmwareStageMapping.spec.ts
git commit -m "$(cat <<'EOF'
feat(firmware-ui-mapping): handle FINALIZING in stage + pill mappers

mapServerStageToUiStage returns null for FINALIZING (no global stage
row advances during the PENDING-resolution window — the per-controller
pill carries the affordance). controllerStatePillKind returns the new
'finalizing' kind for FINALIZING controllers. controllerStageLabelKey
correspondingly returns null.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: UI store — handle FINALIZING in switch sites

**Files:**
- Modify: `astros_vue/src/stores/firmware.ts:335-345` (applyJobFailed normalize)
- Modify: `astros_vue/src/stores/firmware.ts:365-403` (buildControllerStatesMap)
- Test: `astros_vue/src/stores/__tests__/firmware.spec.ts`

TDD. The store's existing exhaustiveness checks (`const _exhaustive: never = stage`) catch any missed switch — treat the type errors from vue-tsc as the worklist.

- [ ] **Step 1: Inventory the switch sites needing FINALIZING**

Run: `cd astros_vue && npx vue-tsc --noEmit 2>&1 | grep -E "firmware\.ts|FINALIZING|exhaustive" | head -20`

Expected: specific line numbers in `stores/firmware.ts` where the FINALIZING case is missing. The two known sites:
- `buildControllerStatesMap` translator (must pass `pendingDetail` through during the wire→BySlot re-keying).
- `applyJobFailed` normalize (the "stage at failure" should be `null` for Finalizing — no UI stage row maps to it).

- [ ] **Step 2: Find existing store test fixtures**

Run: `grep -n "describe\|applyControllerUpdate\|applyJobStarted\|buildControllerStatesMap" astros_vue/src/stores/__tests__/firmware.spec.ts | head -30`

Read the file for fixture style.

- [ ] **Step 3: Add the failing test**

Append to `astros_vue/src/stores/__tests__/firmware.spec.ts` in the appropriate describe block:

```typescript
describe('Phase C: FINALIZING controller state', () => {
  it('translates a wire FINALIZING row into a BySlot FINALIZING row', () => {
    const store = useFirmwareStore();
    // Set up controller registry so the wire MAC translates to a SlotId
    // (use whatever the existing fixtures do for this — likely a
    // applyControllers() call or store-level setControllerRegistry).
    setupFixtureControllerRegistry(store, [
      { mac: '00:00:00:00:00:00', slot: 'core' },
    ]);

    const job: FlashJobState = {
      jobId: 'job-1',
      source: { kind: 'github', version: '1.4.0' },
      controllers: [
        {
          controllerId: '00:00:00:00:00:00',
          stage: 'FINALIZING',
          pendingDetail: 'awaiting_post_reboot_version',
        },
      ],
      startedAt: '2026-05-28T15:00:00Z',
    };
    store.applyJobStarted(job);

    const state = store.controllerStates.get('core');
    expect(state).toBeDefined();
    expect(state!.stage).toBe('FINALIZING');
    if (state!.stage === 'FINALIZING') {
      expect(state!.pendingDetail).toBe('awaiting_post_reboot_version');
      expect(state!.controllerId).toBe('core');
    }
  });

  it('applyJobFailed normalizes a Finalizing controller stage to null', () => {
    // When a job fails (e.g., operator cancels mid-Finalizing), the
    // "stage at failure" recorded for the row is the in-flight stage.
    // FINALIZING has no UI stage row (Task 10) — normalize to null
    // so FailedControllerSummary.stage matches the pattern.
    const store = useFirmwareStore();
    setupFixtureControllerRegistry(store, [
      { mac: '00:00:00:00:00:00', slot: 'core' },
    ]);
    store.applyJobStarted({
      jobId: 'job-1',
      source: { kind: 'github', version: '1.4.0' },
      controllers: [
        {
          controllerId: '00:00:00:00:00:00',
          stage: 'FINALIZING',
          pendingDetail: 'awaiting_post_reboot_version',
        },
      ],
      startedAt: '2026-05-28T15:00:00Z',
    });
    store.applyJobFailed({
      jobId: 'job-1',
      endedAt: '2026-05-28T15:01:00Z',
      reason: 'aborted',
      abortReason: 'operator_cancel',
    });

    const summary = store.failedControllers.find((c) => c.id === 'core');
    expect(summary).toBeDefined();
    expect(summary!.stage).toBeNull();
  });
});
```

If your store's API names differ (e.g., `applyJobStarted` is named `handleFlashJobStarted`), adapt accordingly. Use the existing tests' patterns.

- [ ] **Step 4: Run new tests to verify they fail**

Run: `cd astros_vue && npx vitest run src/stores/__tests__/firmware.spec.ts -t "Phase C: FINALIZING"`

Expected: FAIL — the store's switch sites don't handle FINALIZING.

- [ ] **Step 5: Fix buildControllerStatesMap to pass FINALIZING through**

Edit `astros_vue/src/stores/firmware.ts:365-403`. In the switch on `stage` inside `buildControllerStatesMap`, add a FINALIZING case:

```typescript
function buildControllerStatesMap(
  states: ReadonlyArray<ControllerFlashState> | undefined,
): ReadonlyMap<SlotId, ControllerFlashStateBySlot> {
  const m = new Map<SlotId, ControllerFlashStateBySlot>();
  if (!states) return m;
  for (const s of states) {
    const slot = slotForMac(s.controllerId);
    if (slot === null) continue;
    let translated: ControllerFlashStateBySlot;
    switch (s.stage) {
      case 'QUEUED':
      case 'UPLOADING_TO_MASTER':
      case 'SENDING':
      case 'VERIFYING':
      case 'FLASHING':
      case 'REBOOTING':
        translated = { ...s, controllerId: slot };
        break;
      case 'FINALIZING':
        translated = {
          controllerId: slot,
          stage: 'FINALIZING',
          pendingDetail: s.pendingDetail,
        };
        break;
      case 'VERSION_CONFIRMED':
        translated = {
          controllerId: slot,
          stage: 'VERSION_CONFIRMED',
          finalVersion: s.finalVersion,
        };
        break;
      case 'FAILED':
        translated = { controllerId: slot, stage: 'FAILED', error: s.error };
        break;
      default: {
        const _exhaustive: never = s;
        void _exhaustive;
        continue;
      }
    }
    m.set(slot, translated);
  }
  return m;
}
```

The exact existing structure may differ — adapt the FINALIZING case to fit the pattern actually used. The key invariant: `pendingDetail` is carried through the translation.

- [ ] **Step 6: Fix applyJobFailed to normalize FINALIZING → null**

Edit `astros_vue/src/stores/firmware.ts:335-345` (the FailedControllerSummary normalize). Read the existing block first to understand how stages are mapped to `FailedControllerSummary.stage`. The pattern likely uses `mapServerStageToUiStage`, which already returns null for FINALIZING (per Task 10) — in that case no additional change is needed. If it uses a separate hand-written switch, add a FINALIZING → null case.

If the normalize already uses `mapServerStageToUiStage`, this step is a no-op; document this in the commit message and confirm via the test.

- [ ] **Step 7: Run tests + vue build**

```bash
cd astros_vue && npx vitest run src/stores/__tests__/firmware.spec.ts && npx vue-tsc --noEmit
```

Expected: store tests PASS, no remaining type errors.

- [ ] **Step 8: Pre-commit dance + code review**

```bash
cd astros_vue && npm run format && npm run lint && npx vitest run
```

Then `superpowers:requesting-code-review`. Prompt: "find anything wrong with the FINALIZING store integration. Specifically check: (1) does the buildControllerStatesMap translator correctly preserve pendingDetail through wire→BySlot conversion? (2) does applyJobFailed's normalize produce the right FailedControllerSummary.stage for a Finalizing controller? (3) any other switch-on-stage sites in firmware.ts that the test didn't cover?" Address findings.

- [ ] **Step 9: Commit**

```bash
git add astros_vue/src/stores/firmware.ts astros_vue/src/stores/__tests__/firmware.spec.ts
git commit -m "$(cat <<'EOF'
feat(firmware-store): propagate FINALIZING through translator + failed-normalize

buildControllerStatesMap carries pendingDetail across the wire→BySlot
re-keying. applyJobFailed's failed-controller summary normalizes
FINALIZING stage to null (consistent with mapServerStageToUiStage).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: UI component — finalizing pill kind in AstrosFirmwareStatusPill

**Files:**
- Modify: `astros_vue/src/components/firmware/firmwareStatusPill/AstrosFirmwareStatusPill.vue`
- Modify: `astros_vue/src/components/firmware/firmwareStatusPill/AstrosFirmwareStatusPill.stories.ts`

Per CLAUDE.md `feedback_tdd_exceptions`: UI layout work is exempt from TDD. Manual verification via Storybook + the locale-coverage test (Task 13) pins the i18n key.

- [ ] **Step 1: Add the finalizing kind to KIND_LABEL_KEY and KIND_MODIFIER**

Edit `astros_vue/src/components/firmware/firmwareStatusPill/AstrosFirmwareStatusPill.vue`. In the `<script setup>` block:

```typescript
const KIND_LABEL_KEY: Record<FirmwareStatusPillKind, string> = {
  idle: 'firmware_view.controllers.pill.idle',
  queued: 'firmware_view.controllers.pill.queued',
  updating: 'firmware_view.controllers.pill.updating',
  finalizing: 'firmware_view.controllers.pill.finalizing',
  done: 'firmware_view.controllers.pill.done',
  failed: 'firmware_view.controllers.pill.failed',
  upToDate: 'firmware_view.controllers.pill.up_to_date',
  offline: 'firmware_view.controllers.pill.offline',
  downgrade: 'firmware_view.controllers.pill.downgrade',
};

const KIND_MODIFIER: Record<FirmwareStatusPillKind, string> = {
  idle: 'idle',
  queued: 'queued',
  updating: 'updating',
  finalizing: 'finalizing',
  done: 'done',
  failed: 'failed',
  upToDate: 'up-to-date',
  offline: 'offline',
  downgrade: 'downgrade',
};
```

(The exact existing keys for `idle`/`upToDate`/`offline`/`downgrade` may differ — preserve them verbatim and only ADD the `finalizing` line in both maps.)

- [ ] **Step 2: Add the .astros-firmware-status-pill--finalizing style**

Edit the `<style>` block of the same .vue file. Add a finalizing modifier styled after `updating` (in-progress aesthetic) but visually distinct so the operator can tell "actively transferring data" apart from "waiting for post-reboot heartbeat":

```css
.astros-firmware-status-pill--finalizing {
  /* Same in-progress affordance as updating (animated spinner if the
     component renders one), but a distinct color — pick a muted blue
     or indigo from the AstrOs palette to signal "waiting on master"
     vs the orange/amber "actively transferring". Match the existing
     pattern of color tokens used elsewhere in the file. */
  background-color: var(--color-status-finalizing, oklch(75% 0.12 250));
  color: var(--color-status-finalizing-text, oklch(20% 0.04 250));
}
```

Confirm the exact CSS variables / token names by reading the existing rules (`.astros-firmware-status-pill--updating`, etc.) and matching the pattern. If the file uses DaisyUI tokens or Tailwind classes inline, use those instead — the goal is "distinct hue, in-progress aesthetic" however the existing rules express it.

- [ ] **Step 3: Add a finalizing story**

Edit `astros_vue/src/components/firmware/firmwareStatusPill/AstrosFirmwareStatusPill.stories.ts`. Add a `Finalizing` story alongside the existing `Updating`/`Done`/etc. stories:

```typescript
export const Finalizing: Story = {
  args: {
    kind: 'finalizing',
  },
};
```

(Match the existing story conventions — args structure, decorators, etc.)

- [ ] **Step 4: Run Storybook for manual visual verification**

Run: `cd astros_vue && npm run storybook`

Open the new `Finalizing` story in the browser. Verify:
- The pill renders with the new color/style.
- The label text shows the placeholder "Finalizing…" (will be populated once Task 13 adds the locale key — until then it shows the raw key path).
- The aesthetic distinction from `Updating` is visually clear.

Take a screenshot or note the visual outcome for the commit.

- [ ] **Step 5: Pre-commit dance (no TDD per the exemption)**

```bash
cd astros_vue && npm run format && npm run lint && npx vue-tsc --noEmit
```

Skip the explicit test run for this commit — the new kind is type-checked, and Task 13's locale-coverage test will pin the i18n key on the next commit. Code-review prompt: "find anything wrong with the finalizing pill kind addition. Specifically check: (1) is the KIND_LABEL_KEY entry pointed at a locale key that will exist after the next commit? (2) is the CSS modifier distinct enough from updating to read as a separate visual state?"

- [ ] **Step 6: Commit**

```bash
git add astros_vue/src/components/firmware/firmwareStatusPill/AstrosFirmwareStatusPill.vue astros_vue/src/components/firmware/firmwareStatusPill/AstrosFirmwareStatusPill.stories.ts
git commit -m "$(cat <<'EOF'
feat(firmware-pill): add 'finalizing' kind with distinct color

Adds the new pill kind to KIND_LABEL_KEY (points at
firmware_view.controllers.pill.finalizing — added in the next
commit), KIND_MODIFIER, and a new style block with a muted blue
hue to distinguish "waiting for post-reboot heartbeat" from the
orange "actively transferring" updating state. Storybook story
added for manual verification and future visual regression.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: i18n — add finalizing pill copy + post_reboot_timeout error copy

**Files:**
- Modify: `astros_vue/src/locales/enUS.json`

The locale-coverage test (if one exists at the vue tests level) will fail until the keys land — that's the pinning mechanism.

- [ ] **Step 1: Find the existing structure of firmware_view.controllers.pill**

Run: `grep -n -A 20 '"firmware_view"' astros_vue/src/locales/enUS.json | head -60`

Read the existing keys to understand the JSON structure (likely `firmware_view.controllers.pill.*` and `firmware_view.flash_errors.*` exist already with siblings).

- [ ] **Step 2: Add the new keys**

Edit `astros_vue/src/locales/enUS.json`. In the `firmware_view.controllers.pill` block, add:

```json
"finalizing": "Finalizing…"
```

In the `firmware_view.flash_errors` block, add:

```json
"post_reboot_timeout": "Master controller did not report a matching firmware version within 90 seconds. The flash may have failed; verify the controller and retry."
```

Place each new key alphabetically among its siblings (matching the file's existing ordering convention; if the file isn't alphabetized, just place near related keys).

- [ ] **Step 3: Check if a locale-coverage test exists**

Run: `grep -rln "enUS\|locale.*coverage\|FLASH_ERROR_REASONS.*locale\|every.*reason.*key" astros_vue/src --include="*.spec.ts" --include="*.test.ts"`

Expected: zero or more matches. If a locale-coverage test exists, the new `post_reboot_timeout` key will need to be referenced there too (the spec calls out this drift risk).

If a test exists, run it: `cd astros_vue && npx vitest run <that-spec-file>` — expected PASS after the new key is added (the test iterates `FLASH_ERROR_REASONS` and checks each has a locale key; Task 9 added `'post_reboot_timeout'` to that tuple).

If no locale-coverage test exists, add a minimal one (this is worth doing to prevent future drift):

```typescript
// astros_vue/src/locales/__tests__/coverage.spec.ts (new file)
import { describe, it, expect } from 'vitest';
import enUS from '../enUS.json';
import { FLASH_ERROR_REASONS } from '@/types/firmware';

describe('locale coverage', () => {
  it('every FLASH_ERROR_REASONS entry has a firmware_view.flash_errors key', () => {
    for (const reason of FLASH_ERROR_REASONS) {
      const key = enUS.firmware_view?.flash_errors?.[reason];
      expect(key, `missing firmware_view.flash_errors.${reason}`).toBeDefined();
    }
  });

  it('every FirmwareStatusPillKind value has a firmware_view.controllers.pill key', () => {
    const kinds = [
      'idle', 'queued', 'updating', 'finalizing',
      'done', 'failed', 'upToDate', 'offline', 'downgrade',
    ] as const;
    for (const kind of kinds) {
      // The pill component uses snake_case for upToDate → up_to_date;
      // adjust the lookup accordingly. Confirm by reading the pill .vue.
      const snake = kind.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase());
      const key = enUS.firmware_view?.controllers?.pill?.[snake];
      expect(key, `missing firmware_view.controllers.pill.${snake}`).toBeDefined();
    }
  });
});
```

(Adapt to the actual JSON key casing — read enUS.json before adding to verify whether keys use camelCase or snake_case.)

- [ ] **Step 4: Run the locale test (or all vue tests)**

Run: `cd astros_vue && npx vitest run`

Expected: PASS. The Storybook pill should now render "Finalizing…" instead of the raw key path.

- [ ] **Step 5: Pre-commit dance (doc/locale-only — no code review needed for JSON-only commit)**

```bash
cd astros_vue && npm run format && npx vitest run
```

Skip `npm run lint` (eslint doesn't cover .json). Skip `requesting-code-review` — locale string copy is human-judgment territory, not code-pattern territory, and a reviewer subagent won't add value.

- [ ] **Step 6: Commit**

```bash
git add astros_vue/src/locales/enUS.json astros_vue/src/locales/__tests__/coverage.spec.ts
git commit -m "$(cat <<'EOF'
i18n(firmware): add finalizing pill + post_reboot_timeout error copy

firmware_view.controllers.pill.finalizing wires the new pill label.
firmware_view.flash_errors.post_reboot_timeout populates the operator
banner when the 90s safety timer fires (master never reported a
matching version after reboot — likely auto-rollback fired and the
controller is running the old image).

Adds a locale-coverage test pinning every FLASH_ERROR_REASONS entry
and every FirmwareStatusPillKind has a matching locale key, so a
future drift surfaces immediately.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

(If the locale-coverage test already existed, drop it from the `git add` and adjust the commit message.)

---

## Task 14: Protocol doc — `FW_DEPLOY_DONE` PENDING update

**Files:**
- Modify: `.docs/protocol.md:96-98` (FW_DEPLOY_DONE payload field layout)

Doc-only change. The matching `AstrOs.ESP/.docs/protocol.md` copy will be updated cross-repo as a follow-up (call this out in the commit message).

- [ ] **Step 1: Edit the field layout line**

Edit `.docs/protocol.md:96-98`. Find:

```
FW_DEPLOY_DONE:       transfer-id<US>per-controller-result-list
                      result = controllerId<US>OK|FAILED<US>finalVersion<US>errorOrEmpty (RS-separated)
```

Replace with:

```
FW_DEPLOY_DONE:       transfer-id<US>per-controller-result-list
                      result = controllerId<US>OK|FAILED|PENDING<US>finalVersion<US>errorOrEmpty (RS-separated)
                      PENDING is emitted ONLY for the master self-flash success
                      row (AstrOs.ESP Phase C). The master writes its inactive
                      partition, emits FW_DEPLOY_DONE with master=PENDING,
                      then reboots. finalVersion MUST be empty on PENDING
                      rows; errorOrEmpty carries a firmware-domain marker
                      ("awaiting_post_reboot_version"). The server holds the
                      deploy open in Finalizing until either the master's
                      post-reboot POLL_ACK arrives with a matching version
                      (PENDING → OK, VersionConfirmed) or a 90s safety timer
                      fires (PENDING → FAILED("post_reboot_timeout")).
```

- [ ] **Step 2: Verify markdown renders cleanly**

Run: `cd /home/jeff/Source/astros/AstrOs.Server && grep -A 15 "FW_DEPLOY_DONE:" .docs/protocol.md`

Expected: the replacement is in place and indentation is consistent with sibling field layouts.

- [ ] **Step 3: Commit (doc-only carve-out — no pre-commit dance)**

```bash
git add .docs/protocol.md
git commit -m "$(cat <<'EOF'
docs(protocol): document PENDING outcome in FW_DEPLOY_DONE

Phase C firmware emits PadawanStatus::PENDING (wire byte 2) for the
master self-flash success row; finalVersion is empty, errorOrEmpty
carries a firmware marker. Server holds the deploy open in Finalizing
until heartbeat resolution (PENDING → OK) or 90s timeout
(PENDING → FAILED). Cross-repo: AstrOs.ESP/.docs/protocol.md has
the same content and needs the same update — coordinate as a
follow-up doc PR.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: QA plan — bench test scenarios

**Files:**
- Create: `.docs/qa/firmware-ota-phase-c-server.md`

Doc-only. The plan mirrors firmware C.1–C.3 from the server viewpoint, plus negative cases unique to the server side.

- [ ] **Step 1: Write the QA plan**

Create `.docs/qa/firmware-ota-phase-c-server.md`:

```markdown
# QA — Firmware OTA Phase C (server-side)

**Feature:** Server-side Finalizing state + 90 s `finalizeTimer` + UI pill for
the master self-flash PENDING wire outcome introduced by AstrOs.ESP Phase C.

**Preconditions:**
- Spare master-role ESP32 (lolin_d32_pro or metro_s3 reconfigured via
  `main.cpp` role-config) — NEVER test on production master.
- USB serial tether between the spare master and the server host.
- Server built from `feature/firmware-ota-phase-c-server` branch.
- At least one padawan online for the multi-controller deploys.
- Firmware released to GitHub or staged via `POST /api/firmware/upload`.

## Case S1 — Master self-flash happy path (mirrors firmware C.1)

1. Open the FirmwareView in a browser.
2. Select master + one padawan (e.g., body or core) as deploy targets.
3. Pick a firmware source (github release or uploaded binary).
4. Click "Flash".
5. Observe the per-controller flow: padawan goes through Sending →
   Verifying → Flashing → Rebooting → VersionConfirmed (green "Done"
   pill). The master row stays Queued until DEPLOY_DONE arrives.
6. When the master emits DEPLOY_DONE: master row pill shows
   "Finalizing…" (new blue pill kind). NO "flash complete" banner /
   modal yet. The job is held open.
7. Within ~10 s the master reboots and sends its first self-POLL_ACK
   with the new version. The master row pill flips to green "Done";
   the job-wide "flash complete" affordance fires.
8. Total elapsed: ~30 s for the padawan flash + ~10 s for the Finalizing
   window. Lock released. Operator can start another flash.

## Case S2 — Master self-flash failure (mirrors firmware C.2)

1. With a debug build that forces master flash failure (per firmware C.2
   instructions), deploy master + one padawan.
2. Master row arrives in DEPLOY_DONE as FAILED with a reason like "ESP_FAIL".
3. Master row pill renders immediately as red "Failed". NO Finalizing
   pill — failed rows skip the resolution window.
4. Job-wide failure banner shows the reason. Lock released within the
   normal 15 s rebootTimer window (existing behavior unchanged).

## Case S3 — Post-reboot timeout (mirrors firmware C.3 with auto-rollback)

1. With a debug build that crashes immediately on boot (per firmware C.3,
   `abort()` at top of `app_main`), deploy master-only.
2. Master self-flash succeeds; DEPLOY_DONE arrives with master=PENDING;
   master row pill shows "Finalizing…".
3. Master reboots into the crashing image; auto-rollback fires; master
   boots into the OLD image; self-POLL_ACK starts firing with the OLD
   version (not the requested target).
4. `decidePostDeployHeartbeat` returns `version_mismatch` (silent log on
   server side); Finalizing row remains.
5. **Within 90 s** of DEPLOY_DONE arrival, the finalizeTimer fires.
   Master row pill flips to red "Failed" with error "post_reboot_timeout".
6. Operator banner: "Master controller did not report a matching firmware
   version within 90 seconds. The flash may have failed; verify the
   controller and retry." (the new locale copy).
7. Lock released. Master is still functional, just on the old image.

## Case S4 — Cancel during Finalizing

1. Deploy master + one padawan as in S1.
2. Once the master row enters Finalizing (UI shows "Finalizing…" pill),
   click "Cancel" before the master's heartbeat arrives (this is timing-
   sensitive; the Finalizing window is normally only ~10 s, so for testing
   you may need to either (a) hold the master in reset during the
   Finalizing window or (b) use a server build that overrides
   `finalizeTimeoutMs` to a longer value).
3. Cancel fires. Master row pill flips to red "Failed" with abort-reason
   shown. Lock released. The finalizeTimer is disposed and does NOT fire
   later — confirm by waiting past the original timeout window and
   verifying no further events appear in the UI / server logs.

## Case S5 — Late-join WebSocket connect mid-Finalizing

1. Deploy master + one padawan as in S1.
2. Once the master row enters Finalizing, open a SECOND browser tab to
   the same FirmwareView URL (simulates a late-joining operator).
3. The second tab should immediately render the FlashJobState snapshot
   with the master row showing "Finalizing…" — proving
   `decideLateJoinSnapshot` correctly returns the in-flight snapshot.
4. When the master's heartbeat arrives, BOTH tabs should update the
   master row to green "Done" simultaneously (the WS `flashControllerResult`
   event broadcasts to all connected clients).

## Case S6 — Test override observable in <1 s

1. Server start with `FlashJobOrchestratorOpts.config.finalizeTimeoutMs = 500`
   (this is a test-time override; not exposed to operators in production —
   the value is set via a development build configuration or env var if
   added later, OR by running the orchestrator's unit test fixture).
2. Deploy a synthetic PENDING row (use vitest harness, not a real deploy).
3. Observe the timeout-resolution flow firing within ~500 ms instead of
   90 s. Confirms test override path works.

## Negative coverage notes

- **Server restart mid-Finalizing**: documented behavior — `JobLock` is
  in-memory; on restart everything is dropped. The master's post-restart
  POLL_ACK with the new version returns `no_active_job` from
  `decidePostDeployHeartbeat` (silent). Operator must verify manually.
  Acceptable for this PR; restart-recovery is out of scope.
- **Two heartbeats race during Finalizing**: documented behavior — first
  fires, mutates rows, releases lock; second hits `finalizeTimer === null
  && rebootTimer === null` and is a no-op. Covered by the orchestrator
  unit test "first-fire-wins" assertion.
- **finalizeTimer fires while heartbeat is in flight**: documented behavior
  — JavaScript event loop is single-threaded, so the timer callback runs
  only after the heartbeat handler returns. The heartbeat handler clears
  the timer at the top of its branch, so the callback finds
  `this.finalizeTimer === null` and short-circuits.
```

- [ ] **Step 2: Commit (doc-only)**

```bash
git add .docs/qa/firmware-ota-phase-c-server.md
git commit -m "$(cat <<'EOF'
docs(qa): add Phase C server-side QA plan (S1-S6 + negative coverage)

Bench plan mirroring firmware C.1-C.3 from the server viewpoint,
plus S4 (cancel during Finalizing), S5 (late-join), and S6 (test
override observable in <1s). Negative coverage notes document the
documented-but-not-tested behaviors (server restart, heartbeat
races, timer-vs-heartbeat ordering).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: Cross-cut integration — full build, full test suite, browser smoke test

This is a verification task with no code changes — it ensures the entire branch composes correctly before pre-push review.

- [ ] **Step 1: Run full backend test suite**

Run from `astros_api/`:

```bash
npm run prettier:write
npm run lint:fix
npm run build
npx vitest run
```

Expected: all four pass. Investigate any failures.

- [ ] **Step 2: Run full frontend test suite**

Run from `astros_vue/`:

```bash
npm run format
npm run lint
npm run build
npm run test:unit -- --run
```

Expected: all pass. The `npm run build` includes vue-tsc type-check.

- [ ] **Step 3: Browser smoke test of the FirmwareView**

Start the dev server: `cd astros_vue && npm run dev` (and `cd astros_api && npm run start:tsx` in another terminal). Navigate to the FirmwareView. Without a real bench, confirm:
- The view loads without console errors.
- Existing flash flow widgets (controller selection, source picker, etc.) render and respond.
- Open the AstrosFirmwareStatusPill story in Storybook for the "Finalizing" variant — confirms the new pill visually distinguishable from Updating.

Per CLAUDE.md: "For UI or frontend changes, start the dev server and use the feature in a browser before reporting the task as complete." Bench-level verification (a real flash with a real master) is covered by Task 17.

- [ ] **Step 4: No commit (verification-only task)**

If everything passes, move on. If something fails, fix it (commit the fix as a new commit, not amending an earlier one — pre-commit hooks failing means commits didn't happen).

---

## Task 17: Pre-push branch review

**No file changes.** Per CLAUDE.md, every PR touching code must run `/pr-review-toolkit:review-pr` on the full branch diff vs `develop` before push. This dispatches 5 specialized agents in parallel against the whole-branch surface.

- [ ] **Step 1: Run the pre-push review**

In the repo root:

```bash
/pr-review-toolkit:review-pr
```

Per CLAUDE.md, prompt the agents with hazard categories (concurrency, operability, resource lifecycle) — not "review this fix." Specific concerns for this PR:
- **Concurrency**: TOCTOU on the heartbeat-vs-finalizeTimer race (first-fire-wins); WS event ordering for late-join during Finalizing.
- **Operability**: `process.exit` in library code (shouldn't be any new ones); `close()` on a Finalizing-state orchestrator on shutdown; listener leaks across job lifecycles.
- **Resource lifecycle**: finalizeTimer cleanup on every exit path (cancel, error, normal resolution); env restore for the test-override `finalizeTimeoutMs` opt.

Sweep targets specific to the partial-fix discipline in CLAUDE.md:
- Doc-vs-code drift (spec/plan claims that don't match runtime behavior).
- Dead metadata (declared fields with no read sites — e.g., is `pendingDetail` actually used by the UI?).
- Test-name format string drift (the new mutation test must actually fail when the timer-clear line is reverted).
- Cross-repo contract (server's `'PENDING'` outcome string must match firmware's `PadawanStatus::PENDING` wire byte — pin via the parser test).

- [ ] **Step 2: Address Critical and Important findings**

Each finding gets fixed in a NEW commit (not amending). Minor findings may be deferred to a follow-up commit on a different branch, but flag them in the PR description.

- [ ] **Step 3: After address — final clean build verification**

Re-run Task 16's Step 1 and Step 2 to confirm the addresses didn't regress anything.

- [ ] **Step 4: Push via VS Code (NOT the terminal)**

Per CLAUDE.md user-memory feedback_git_push: "Never run git push from terminal; user pushes through VS Code." Hand the branch over to the user with the message:

> "Branch `feature/firmware-ota-phase-c-server` is ready to push. All Phase C tasks complete (parser + types + state machine + orchestrator + UI + i18n + protocol + QA). Full backend + frontend test suites pass; pre-push branch review dispatched and findings addressed. Please push via VS Code, then I'll open the PR with `gh pr create --base develop`."

- [ ] **Step 5: After push: open the PR**

Once the user confirms the push, run:

```bash
gh pr create --base develop --title "fix(firmware-ota): server-side Phase C — PENDING handling + Finalizing state" --body "$(cat <<'EOF'
## Summary
- Server-side resolution for AstrOs.ESP Phase C's PadawanStatus::PENDING wire outcome (merged 2026-05-28, PR #41, commit 3e55b8d).
- Adds FwStage.Finalizing as the in-memory model; orchestrator holds deploys open while PENDING rows exist.
- Heartbeat path mutates PENDING → VersionConfirmed via the existing decidePostDeployHeartbeat → notifyMasterHeartbeat pipeline; 90 s finalizeTimer is the safety fallback (PENDING → Failed("post_reboot_timeout")).
- UI gains a new "finalizing" pill kind with distinct color + locale copy.

## Test plan
- [ ] Manual: run S1 (master + padawan happy path) on the bench with a spare master
- [ ] Manual: run S3 (90s timeout via crashing-firmware debug build)
- [ ] Manual: run S4 (cancel during Finalizing)
- [ ] Manual: run S5 (late-join WS during Finalizing)
- [x] Automated: full backend test suite passing
- [x] Automated: full frontend test suite passing
- [x] Automated: pre-push branch review dispatched, findings addressed

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Then surface the PR URL to the user.

---

## Spec coverage check

Reviewing the spec section-by-section against the plan:

- **Section 1 (parser + types)** → Tasks 1, 2 ✓
- **Section 2 (state machine)** → Tasks 2, 3 ✓
- **Section 3 (orchestrator)** → Tasks 4, 5, 6, 7 ✓
- **Section 4 (UI)** → Tasks 9, 10, 11, 12, 13 ✓
- **Section 5 (tests)** → Each preceding TDD task; plus Task 8 (late-join regression pin) and the locale-coverage test in Task 13 ✓
- **Section 6 (files-to-touch)** → All files in the spec's table appear in the plan's File Structure ✓
- **Failure-mode considerations** → Covered by orchestrator test cases (Tasks 5-7) + QA negative coverage notes (Task 15)
- **Cross-repo dependencies** → Task 14 (protocol.md update with cross-repo coordination note)
- **Risks deferred** → Documented in the spec; QA Task 15 references them

No gaps found.

---

## Execution Handoff

**Plan complete and saved to** `.docs/plans/20260528-1520-firmware-ota-phase-c-server.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. The plan's 17 tasks are well-bounded; the subagent gets task N's full file + step list, returns when done, I review the diff + commit, then dispatch task N+1.

**2. Inline Execution** — Execute tasks in this session using executing-plans. Batch execution with checkpoints for review at the end of each Group (A: wire/types — Tasks 1-2, B: FSM — Task 3, C: Orchestrator — Tasks 4-7, D: late-join — Task 8, E: UI — Tasks 9-13, F: Docs — Tasks 14-15, G: Integration — Tasks 16-17).

Which approach?
