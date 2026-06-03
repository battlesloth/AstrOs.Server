# Firmware OTA — PR set 2 Phase C — Server-side `Finalizing` state + `PENDING` outcome — design

## Context

AstrOs.ESP Phase C firmware merged to develop on 2026-05-28 (PR #41, merge `3e55b8d`).
It introduces a new `PadawanStatus::PENDING` wire value (byte `2`) emitted in
`FW_DEPLOY_DONE` for the master self-flash success row. The master writes
to its inactive partition, reports PENDING in `FW_DEPLOY_DONE`, then reboots;
on its first post-reboot self-POLL_ACK the new image proves itself live by
matching the requested version.

The current AstrOs.Server `handleFwDeployDone` parser strictly rejects any
outcome that isn't `OK` or `FAILED`, so a Phase C master row carrying
`PENDING` will trash the entire `FW_DEPLOY_DONE` as `UNKNOWN` and leave the
deploy stuck in whatever pre-DEPLOY_DONE state it was in. This breaks every
master-included deploy until the server PR lands.

Cross-repo handoff with full background:
[`.docs/plans/20260528-1455-handoff-firmware-ota-pr-set-2-phase-c-server-side.md`](../plans/20260528-1455-handoff-firmware-ota-pr-set-2-phase-c-server-side.md).

Firmware-side Phase C design (Section 5 covers the server contract):
`/home/jeff/Source/astros/AstrOs.ESP/.docs/plans/20260528-1234-firmware-ota-pr-set-2-phase-c-master-self-flash-design.md`.

## Scope confirmation

- **One full server PR** (parser + types + Finalizing state + 90s timer + UI + tests),
  not a parser-only hotfix followed by a UI follow-up. Bench-tested as a
  coherent unit; no transient "master row renders as unknown" UI window.
- **New `FwStage.Finalizing` enum value** as the in-memory model for PENDING
  rows. Direct mirror of the wire's `PadawanStatus::PENDING`; type-safe
  separation from `VersionConfirmed` (success) and `Failed` (terminal failure).
- **`finalizeTimeoutMs` overridable via constructor opts**, default `90_000`.
  Mirrors the existing `rebootTimeoutMs` pattern in `FlashJobOrchestratorOpts.config`.
- **The 90 s value covers** worst-case master reboot (~5 s) + SD remount (~3 s)
  + first poll cycle (~2 s) + ~10× safety margin (per firmware design Section 6).

## Decisions

- **Wire form `"PENDING"` mapped to in-memory `FwStage.Finalizing = 'FINALIZING'`**.
  Wire and in-memory names diverge intentionally: `PENDING` is the firmware-domain
  word for "row not yet finalized," while `FINALIZING` is the server-domain word
  for "deploy holds open while this row resolves." A reader of either stack sees
  the term that fits its viewpoint.
- **PENDING-specific cross-field invariant** in the parser: `outcome === 'PENDING'`
  requires `finalVersion === ''` (the master hasn't booted into the new image
  yet — a non-empty `finalVersion` on a PENDING row indicates a firmware bug).
  Symmetric in spirit to the existing OK + empty-error check.
- **Firmware's `error="awaiting_post_reboot_version"` string** is surfaced
  as `pendingDetail: string` on the Finalizing arm of `ControllerFlashState`
  — distinct field name from `error` (which is reserved for Failed) so a
  future reader of the typed state cannot confuse "currently pending" with
  "failed." The detail is primarily diagnostic; the UI pill renders only
  "Finalizing…".
- **`flashJobDone` is held until PENDING resolves**. While any Finalizing
  row exists, the deploy stays in lifecycle `'in_flight'` (no change to
  `deriveJobLifecycle` is needed — the existing definition already treats
  Finalizing as non-terminal). The operator sees the per-controller
  "Finalizing…" pill until the heartbeat or timeout fires.
- **Lock release happens AFTER PENDING resolution** (heartbeat or timeout
  path). The existing 15 s `rebootTimer` is *not* armed on the PENDING path
  — the heartbeat we receive during PENDING resolution already proves the
  master is healthy, so we don't need an extra grace period.
- **The existing 15 s `rebootTimer` still applies** to padawan-only deploys
  and master-FAILED deploys (no Finalizing rows). Unchanged behavior for
  those paths.
- **Cancel during Finalizing is supported** (not a no-op). Routes through
  the existing `failJob('aborted', reason, { abortReason })`; Finalizing is
  non-terminal so `failNonTerminalControllers` will transition it to Failed
  along with any other in-flight rows.
- **Late-join during Finalizing surfaces the in-flight snapshot** — `endedAt`
  is undefined during Finalizing, so `decideLateJoinSnapshot` already returns
  `{ kind: 'flashJobStarted', data: currentJob }`. No code change; a test
  pins the behavior.

## Architecture

### Section 1 — Wire parser + type extensions

#### `astros_api/src/serial/message_handler.ts` — `handleFwDeployDone`

Current outcome check at lines 357-361 (strict OK/FAILED only) becomes:

```typescript
const outcome = fields[1];
if (outcome !== 'OK' && outcome !== 'FAILED' && outcome !== 'PENDING') {
  logger.error(`FW_DEPLOY_DONE has unknown outcome: ${outcome}`);
  return { type: SerialWorkerResponseType.UNKNOWN };
}

const finalVersion = fields[2];
const error = fields[3];

// Cross-field invariants — each outcome enforces its own contract.
//   OK: finalVersion populated; error must be empty (existing check).
//   PENDING: master hasn't booted yet; finalVersion must be empty.
//            error carries the firmware's awaiting-state marker.
//   FAILED: error populated; finalVersion may be empty or the
//           pre-flash version (no constraint here).
if (outcome === 'OK' && error !== '') {
  logger.error(`FW_DEPLOY_DONE OK result has non-empty error: ${error}`);
  return { type: SerialWorkerResponseType.UNKNOWN };
}
if (outcome === 'PENDING' && finalVersion !== '') {
  logger.error(`FW_DEPLOY_DONE PENDING result has non-empty finalVersion: ${finalVersion}`);
  return { type: SerialWorkerResponseType.UNKNOWN };
}
```

The PENDING-finalVersion check pins the firmware contract: per the Phase C
firmware design, `insertMasterRow(PadawanStatus::PENDING, "", "awaiting_post_reboot_version")`
always uses empty `finalVersion`. A non-empty value on the wire would
indicate either a firmware regression or a corrupt frame; the parser
rejects the whole DEPLOY_DONE rather than apply it.

#### `astros_api/src/models/firmware/firmware_messages.ts`

- Add `Finalizing = 'FINALIZING'` to the `FwStage` enum.
- Extend `FwDeployDoneResult.outcome` union from `'OK' | 'FAILED'` to
  `'OK' | 'FAILED' | 'PENDING'`.

The wire string stays `"PENDING"`; the in-memory enum stays `"FINALIZING"`.
The mapping happens at the orchestrator (`handleDeployDone`) when it
transitions the controller's stage.

### Section 2 — State-machine extensions

#### `astros_api/src/models/firmware/flash_job_state.ts`

Extend the `ControllerFlashState` discriminated union with a Finalizing arm:

```typescript
export type ControllerFlashState =
  | (BaseControllerFlashState & { stage: FwStage.Queued })
  // ... existing arms ...
  | (BaseControllerFlashState & { stage: FwStage.Finalizing; pendingDetail: string })
  | (BaseControllerFlashState & { stage: FwStage.VersionConfirmed; finalVersion: string })
  | (BaseControllerFlashState & { stage: FwStage.Failed; error: string });
```

`pendingDetail` carries the firmware-provided `error` string verbatim
(e.g. `"awaiting_post_reboot_version"`). Distinct field name from `error`
so a TypeScript reader of `state.error` knows immediately that the
controller is Failed, not Finalizing.

#### `astros_api/src/firmware/flash_job_state_machine.ts`

`LEGAL_NEXT_STAGES` additions:

| Current stage | Add to legal-next-stages set |
|---|---|
| Queued | Finalizing |
| UploadingToMaster | Finalizing |
| Sending | Finalizing |
| Verifying | Finalizing |
| Flashing | Finalizing |
| Rebooting | Finalizing |
| Finalizing | { Finalizing (self-edge), VersionConfirmed, Failed } |

Self-edge on Finalizing is unused today (no progress updates fire during
Finalizing) but keeps the pattern uniform with other non-terminal stages.

`isControllerStageTerminal`:

```typescript
export function isControllerStageTerminal(stage: FwStage): boolean {
  return stage === FwStage.VersionConfirmed || stage === FwStage.Failed;
}
```

Unchanged — Finalizing is non-terminal by omission.

`transitionControllerState` overloads — add one for Finalizing:

```typescript
interface FinalizingPayload {
  pendingDetail: string;
}

export function transitionControllerState(
  current: ControllerFlashState,
  toStage: FwStage.Finalizing,
  payload: FinalizingPayload,
): ControllerFlashState;
// ... existing overloads ...
```

Runtime defense: the Finalizing branch requires `pendingDetail` in payload
(same pattern as VersionConfirmed requires `finalVersion` and Failed
requires `error`). The catch-all signature's body adds:

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

`deriveJobLifecycle`: **no change required**. A job with any Finalizing
controller fails the existing `every(c => isControllerStageTerminal(c.stage))`
check and falls through to `'in_flight'` — exactly the behavior we want.

### Section 3 — Orchestrator extensions

#### New field + opt

```typescript
private finalizeTimer: NodeJS.Timeout | null = null;
private readonly finalizeTimeoutMs: number;

// In FlashJobOrchestratorOpts.config:
config?: {
  rebootTimeoutMs?: number;
  throttleWindowMs?: number;
  finalizeTimeoutMs?: number;  // new
};

// At top of file:
const DEFAULT_FINALIZE_TIMEOUT_MS = 90_000;

// In constructor:
this.finalizeTimeoutMs = opts.config?.finalizeTimeoutMs ?? DEFAULT_FINALIZE_TIMEOUT_MS;
```

#### `handleDeployDone` modifications

Outcome guard at lines 1218-1226 extended to accept `'PENDING'`:

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

Per-result transition branch:

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
  // ... existing illegal-transition guard ...
}
```

Post-application branch (replaces the existing "if all terminal → emit
flashJobDone + arm rebootTimer" block):

```typescript
this.currentJob = { ...this.currentJob, controllers: updated };

// ... existing deployUnsubscriber teardown (unchanged) ...

// Decide which post-deploy gate to arm.
const hasFinalizing = this.currentJob.controllers.some(
  (c) => c.stage === FwStage.Finalizing,
);
if (hasFinalizing) {
  // Hold the deploy open. No flashJobDone yet — the operator's UI keeps
  // the per-controller Finalizing pill visible. Resolution arrives via
  // notifyMasterHeartbeat (primary) or finalizeTimer (fallback).
  this.finalizeTimer = this.clock.setTimeout(() => {
    this.finalizeTimer = null;
    this.completePendingResolution('timed_out');
  }, this.finalizeTimeoutMs);
  return;
}

// No PENDING rows. Existing path: only emit flashJobDone when all
// controllers are terminal (deriveJobLifecycle === 'done').
const lifecycle = deriveJobLifecycle(this.currentJob);
if (lifecycle !== 'done') return;

// ... existing flashJobDone emit + rebootTimer arming (unchanged) ...
```

#### New `completePendingResolution` helper

Single resolution path for both heartbeat-success and timeout-failure:

```typescript
private completePendingResolution(
  outcome: 'confirmed' | 'timed_out',
  version?: string,
): void {
  if (this.currentJob === null) return;
  const jobId = this.currentJob.jobId;

  // Mutate every Finalizing row to its terminal equivalent and emit
  // per-row flashControllerResult so the UI updates each pill.
  const updated: ControllerFlashState[] = [];
  for (const c of this.currentJob.controllers) {
    if (c.stage !== FwStage.Finalizing) {
      updated.push(c);
      continue;
    }
    let next: ControllerFlashState;
    if (outcome === 'confirmed') {
      // Invariant: heartbeat path only calls us with a version string.
      // Defensive — the caller should never pass undefined here.
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

  // Emit job-wide done and release the lock immediately. We don't need
  // the 15 s rebootTimer grace period because the heartbeat (or timeout)
  // we just processed already proves the master's post-reboot state.
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

#### `notifyMasterHeartbeat` extension

Add the Finalizing-resolution branch up front:

```typescript
notifyMasterHeartbeat(version: string): void {
  // Phase C: PENDING-resolution path. If the deploy is holding open on
  // any Finalizing rows, the heartbeat proves the master booted into the
  // expected version — mutate every Finalizing row to VersionConfirmed
  // and complete the job. First-fire-wins: clearing the timer + nulling
  // the field prevents a late timer-fire from double-completing.
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

  // Existing path: clear the 15 s rebootTimer if armed and release lock.
  // (No changes from current implementation.)
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

The `version` parameter is now load-bearing (passed into
`completePendingResolution`). The existing eslint-disable comment for
`_version` is removed.

#### `releaseLock` extension

Dispose `finalizeTimer` alongside `rebootTimer`:

```typescript
private releaseLock(jobId: string): void {
  if (this.rebootTimer !== null) {
    try { this.clock.clearTimeout(this.rebootTimer); }
    catch (err) { /* existing log */ }
    this.rebootTimer = null;
  }
  if (this.finalizeTimer !== null) {
    try { this.clock.clearTimeout(this.finalizeTimer); }
    catch (err) {
      logger.error(
        err,
        `flash orchestrator: clock.clearTimeout threw during releaseLock (finalizeTimer) for job=${jobId}`,
      );
    }
    this.finalizeTimer = null;
  }
  // ... rest unchanged ...
}
```

This covers the cancel-during-Finalizing path: `cancel()` → `failJob('aborted', ...)`
→ `releaseLock` disposes both timers + clears Finalizing rows via
`failNonTerminalControllers` (which already transitions every non-terminal
controller to Failed).

#### `cancel()` behavior during Finalizing

No change to `cancel()` logic — the existing `phase === 'deploy'` branch
covers Finalizing because `phase` is still `'deploy'` during the
Finalizing window (we never transition to `'done'` until
`completePendingResolution` runs). The existing `failJob('aborted',
reason, { abortReason: reason })` call handles Finalizing rows via
`failNonTerminalControllers`.

The only subtle interaction: `phase === 'done'` no-op short-circuit at
the top of `cancel()`. After Phase C, `phase` is set to `'done'` inside
`completePendingResolution` (not in `handleDeployDone` for the PENDING
path), so the no-op only fires post-resolution. Mid-Finalizing cancels
correctly route through the `'deploy'` branch.

#### Late-join

`decideLateJoinSnapshot(currentJob)` returns `{ kind: 'flashJobStarted',
data: currentJob }` when `currentJob !== null && endedAt === undefined`.
Finalizing rows leave `endedAt` undefined (set only by
`completePendingResolution` after resolution), so late-joiners during
the Finalizing window see the snapshot with Finalizing rows. No code
change; a test pins the behavior.

### Section 4 — UI extensions

#### `astros_vue/src/types/firmware.ts`

```typescript
// Mirror of server's FwStage — add the new value:
export type ServerFwStage =
  | 'QUEUED' | 'UPLOADING_TO_MASTER' | 'SENDING' | 'VERIFYING'
  | 'FLASHING' | 'REBOOTING' | 'FINALIZING' | 'VERSION_CONFIRMED' | 'FAILED';

// Pill-kind extension:
export type FirmwareStatusPillKind =
  | 'idle' | 'queued' | 'updating' | 'finalizing' | 'done'
  | 'failed' | 'upToDate' | 'offline' | 'downgrade';

// ControllerFlashState — add Finalizing arm to both wire and BySlot forms:
export type ControllerFlashState =
  | { controllerId: string; stage: 'QUEUED' | 'UPLOADING_TO_MASTER' | 'SENDING'
      | 'VERIFYING' | 'FLASHING' | 'REBOOTING';
      bytesSent?: number; totalBytes?: number }
  | { controllerId: string; stage: 'FINALIZING'; pendingDetail: string }
  | { controllerId: string; stage: 'VERSION_CONFIRMED'; finalVersion: string }
  | { controllerId: string; stage: 'FAILED'; error: string };

// Same shape for ControllerFlashStateBySlot.
```

#### `astros_vue/src/utils/firmwareStageMapping.ts`

```typescript
export function mapServerStageToUiStage(stage: ServerFwStage): FirmwareStage | null {
  switch (stage) {
    // ... existing cases ...
    case 'FINALIZING':
      // No global stage row — the per-controller pill carries the affordance.
      return null;
    case 'QUEUED':
    case 'VERSION_CONFIRMED':
    case 'FAILED':
      return null;
    // ... exhaustiveness guard unchanged ...
  }
}

export function controllerStatePillKind(state: ControllerFlashState): FirmwareStatusPillKind {
  switch (state.stage) {
    // ... existing cases ...
    case 'FINALIZING':
      return 'finalizing';
    // ... rest unchanged ...
  }
}
```

#### `astros_vue/src/components/firmware/firmwareStatusPill/AstrosFirmwareStatusPill.vue`

- Add `finalizing: 'firmware_view.controllers.pill.finalizing'` to `KIND_LABEL_KEY`.
- Add `finalizing: 'finalizing'` to `KIND_MODIFIER`.
- Add `.astros-firmware-status-pill--finalizing` style. Suggested visual:
  same in-progress spinner glyph as `updating`, but a distinct color (e.g.,
  a muted blue or indigo) to differentiate "actively transferring data"
  from "waiting for post-reboot heartbeat." Final color choice deferred to
  the established AstrOs visual language during implementation.

#### `astros_vue/src/components/firmware/firmwareStatusPill/AstrosFirmwareStatusPill.stories.ts`

Add a `'finalizing'` story.

#### `astros_vue/src/locales/enUS.json`

```json
"firmware_view": {
  "controllers": {
    "pill": {
      "finalizing": "Finalizing…"
    }
  },
  "flash_errors": {
    "post_reboot_timeout": "Master controller did not report a matching firmware version within 90 seconds. The flash may have failed; verify the controller and retry."
  }
}
```

#### `astros_vue/src/types/firmware.ts` — error-code tuple

Add `'post_reboot_timeout'` to the `FLASH_ERROR_REASONS` tuple. Per the
tuple's docstring, this is the canonical mirror of every server-side
error code that lands on a flash-error envelope — adding the reason here
keeps the type union, the `KNOWN_FLASH_ERROR_REASONS` runtime Set, and
the locale-coverage test all in sync. Without this entry, the firmware
store's `KNOWN_FLASH_ERROR_REASONS.has(reason)` check at
`firmware.ts:618` would silently reject `post_reboot_timeout` and the
operator's banner would fall back to a generic message instead of the
specific copy.

#### `astros_vue/src/stores/firmware.ts`

Two specific switch sites need the new `'FINALIZING'` case:

- `buildControllerStatesMap` (around `firmware.ts:365-403`): the wire-to-
  in-store translator — pass through `pendingDetail` for Finalizing rows.
- `applyJobFailed` normalize (around `firmware.ts:335-345`): when a job
  fails while a controller is Finalizing, the "stage at failure" should
  normalize to `null` (no UI stage row maps to Finalizing) — same pattern
  as the existing Rebooting handling.

The store's existing exhaustiveness guards (`const _exhaustive: never = stage`)
will surface any missed switch as a compile error; treat the type errors
as the worklist.

### Section 5 — Tests

#### Backend

| File | New cases |
|---|---|
| `astros_api/src/serial/message_handler.test.ts` | Parser accepts PENDING with empty finalVersion + non-empty error; parser rejects PENDING with non-empty finalVersion; existing OK + FAILED tests unchanged |
| `astros_api/src/firmware/flash_job_state_machine.test.ts` | Legal transition `Sending → Finalizing` (and other in-flight → Finalizing); legal `Finalizing → VersionConfirmed`; legal `Finalizing → Failed`; illegal `VersionConfirmed → Finalizing` throws; `transitionControllerState` to Finalizing requires `pendingDetail` |
| `astros_api/src/firmware/flash_orchestrator.test.ts` | DEPLOY_DONE with PENDING master + OK padawan → master in Finalizing, no `flashJobDone` emitted, `finalizeTimer` armed; heartbeat during Finalizing → row mutates to VersionConfirmed with heartbeat version, `flashControllerResult` + `flashJobDone` emitted, lock released; finalize-timeout → row mutates to Failed("post_reboot_timeout"), same emits; cancel during Finalizing → Finalizing row transitions to Failed, lock released; mutation test for the heartbeat-vs-timer first-fire-wins guard |
| `astros_api/src/firmware/post_deploy_heartbeat.test.ts` | No new cases — Phase C only changes the orchestrator's handling of `'fire'`, not the decision rules themselves. A regression test asserting current behavior is unchanged is sufficient |
| `astros_api/src/firmware/late_join_snapshot.test.ts` | New case: active job with Finalizing rows + undefined `endedAt` returns `{ kind: 'flashJobStarted', data: currentJob }` |

#### Frontend

| File | New cases |
|---|---|
| `astros_vue/src/utils/__tests__/firmwareStageMapping.spec.ts` | FINALIZING → null UI stage; FINALIZING → 'finalizing' pill kind |
| `astros_vue/src/stores/__tests__/firmware.spec.ts` | Store handles Finalizing state through the WS event flow (flashJobStarted → flashControllerResult mutating Finalizing → VersionConfirmed) |
| Locale-coverage test | New `firmware_view.controllers.pill.finalizing` key present; `firmware_view.flash_errors.post_reboot_timeout` key present |

#### QA

`.docs/qa/firmware-ota-phase-c-server.md` (new): bench plan mirroring
firmware C.1–C.4 from the server-side viewpoint:
- C.1 server view: master row → Finalizing pill → resolves to VersionConfirmed on post-reboot heartbeat
- C.2 server view: master FAILED row → Failed pill immediately, no Finalizing
- C.3 server view: master self-flash succeeds + reboot crashes → Finalizing pill → 90 s timeout → Failed("post_reboot_timeout")
- C.4 (no server-side equivalent — pure firmware concern)

Plus negative cases:
- Late-join WebSocket connect mid-Finalizing → snapshot includes Finalizing row
- Operator cancels mid-Finalizing → row → Failed, lock released
- Test override `finalizeTimeoutMs: 500` to make the timeout path observable in <1 s

### Section 6 — Files to touch

| Layer | File | Change |
|---|---|---|
| Wire | `astros_api/src/serial/message_handler.ts` | Accept PENDING + PENDING-specific empty-finalVersion check |
| Types | `astros_api/src/models/firmware/firmware_messages.ts` | `FwStage.Finalizing`; extend `FwDeployDoneResult.outcome` |
| Types | `astros_api/src/models/firmware/flash_job_state.ts` | Add Finalizing arm to `ControllerFlashState` with `pendingDetail` |
| FSM | `astros_api/src/firmware/flash_job_state_machine.ts` | `LEGAL_NEXT_STAGES` entries; `transitionControllerState` Finalizing overload + runtime check |
| Orchestrator | `astros_api/src/firmware/flash_orchestrator.ts` | `finalizeTimer` field + opt; `DEFAULT_FINALIZE_TIMEOUT_MS`; `handleDeployDone` PENDING branch; `completePendingResolution` helper; `notifyMasterHeartbeat` extension; `releaseLock` dispose extension |
| UI types | `astros_vue/src/types/firmware.ts` | `ServerFwStage`, `ControllerFlashState`, `FirmwareStatusPillKind` extensions; add `'post_reboot_timeout'` to `FLASH_ERROR_REASONS` |
| UI mapping | `astros_vue/src/utils/firmwareStageMapping.ts` | `mapServerStageToUiStage` + `controllerStatePillKind` Finalizing cases |
| UI component | `astros_vue/src/components/firmware/firmwareStatusPill/AstrosFirmwareStatusPill.vue` | New kind label + modifier + style |
| UI story | `astros_vue/src/components/firmware/firmwareStatusPill/AstrosFirmwareStatusPill.stories.ts` | Add `finalizing` story |
| UI store | `astros_vue/src/stores/firmware.ts` | Switch-on-stage updates (likely small — store doesn't render, just propagates) |
| i18n | `astros_vue/src/locales/enUS.json` | `firmware_view.controllers.pill.finalizing`; `firmware_view.flash_errors.post_reboot_timeout` |
| Backend tests | 5 test files | Parser, FSM, orchestrator, heartbeat (regression), late-join |
| Frontend tests | 2 test files + 1 story | Stage mapping, store, story |
| QA | `.docs/qa/firmware-ota-phase-c-server.md` (new) | Bench plan with C.1–C.3 + negative cases |
| Protocol doc | `.docs/protocol.md` (this repo) | `FW_DEPLOY_DONE` payload field layout: change `result = controllerId<US>OK\|FAILED<US>finalVersion<US>errorOrEmpty` to `OK\|FAILED\|PENDING`, plus add a PENDING-semantics note (master self-flash success row; finalVersion is empty; server resolves via post-reboot heartbeat or 90 s timeout). The matching `/home/jeff/Source/astros/AstrOs.ESP/.docs/protocol.md` copy (currently also unupdated despite Phase C firmware shipping) must be updated in lockstep; coordinate cross-repo when this PR lands |

## Failure-mode considerations

The Finalizing window is a narrow but real failure surface. Key risks:

| Failure | Behavior |
|---|---|
| Master boots crashed firmware, auto-rollback fires → boots OLD image → reports OLD version in POLL_ACK | `decidePostDeployHeartbeat` returns `version_mismatch` (current behavior, no change) — server logs it and ignores the heartbeat. Finalizing row remains until 90 s timer fires → Failed("post_reboot_timeout"). Operator sees correct outcome. |
| Master successfully boots but never sends a POLL_ACK (serial-link dead) | 90 s timer fires → Failed("post_reboot_timeout"). Lock released. Operator can retry. |
| Master sends a POLL_ACK with matching version BEFORE the deploy completes | `decidePostDeployHeartbeat` returns `'fire'`; `notifyMasterHeartbeat` runs. If `finalizeTimer === null && rebootTimer === null`, both branches are no-ops (existing safety net) — heartbeat is dropped. The pre-Phase-C invariant "heartbeat only matters between flashJobDone and lock release" still holds; Phase C extends it to "between PENDING-row arrival and resolution" without overlapping. |
| Cancel arrives mid-Finalizing | `failJob('aborted')` → Finalizing rows → Failed via `failNonTerminalControllers`. Lock released. Operator sees Failed pills + abort banner. |
| WS late-join mid-Finalizing | `decideLateJoinSnapshot` returns the current `FlashJobState`; client renders Finalizing pills. Subsequent `flashControllerResult` + `flashJobDone` events transition the client through resolution. |
| Server restarts mid-Finalizing | `JobLock` is in-memory only; on restart everything is dropped. Master may report its new version on first post-restart POLL_ACK; without an active job, `decidePostDeployHeartbeat` returns `no_active_job` (silent). Operator must verify manually. This matches pre-Phase-C restart behavior — no regression. |
| Two heartbeats race during Finalizing (master double-polls) | First fires → clears `finalizeTimer`, mutates rows, releases lock. Second hits `finalizeTimer === null && rebootTimer === null` → no-op (existing first-fire-wins guard). |
| Finalize-timer fires WHILE notifyMasterHeartbeat is running | JavaScript single-threaded event loop — the timer callback runs only after the heartbeat handler returns. The heartbeat handler clears the timer at the top of its branch, so the timer callback finds `this.finalizeTimer === null` (set inside its own callback's first line); no double-fire. The orchestrator-internal first-fire-wins pattern matches the existing `rebootTimer` guard. |

## Risks deferred (out of scope)

- **Configurable timeout via env var or settings UI** — not in scope; constructor
  override is sufficient for tests, and 90 s is conservative enough for production.
- **Per-row finalize timeout** (one timer per Finalizing row) — only the master
  produces PENDING rows today, so one job-wide timer is sufficient. If padawans
  ever produce PENDING, revisit.
- **Heartbeat backfill** (treating an early-arrived heartbeat as resolution-eligible
  if a Finalizing row appears later) — protocol-impossible in current design:
  the heartbeat carries the master's running version, which only equals the
  target after the master has rebooted, which only happens after PENDING is
  emitted. The narrow race window (PENDING arrives ~ms before the heartbeat)
  is covered by the standard event-loop ordering.

## Cross-repo dependencies

- **Firmware-side merged**: AstrOs.ESP develop branch, merge commit `3e55b8d`
  (PR #41, 2026-05-28).
- **Firmware PadawanStatus wire bytes**: `OK=0`, `FAILED=1`, `PENDING=2` (pinned
  by firmware-side `FwDeployDone_PendingRow_StatusByteIsTwo` native test).
- **Firmware emits PENDING ONLY** for the master self-flash success row;
  `OtaFlashStatus` (padawan path) has no PENDING input. Server may treat any
  controllerId reporting PENDING as Finalizing — there's no special-cased
  "only master can be PENDING" rule, but in practice that's the only producer.
