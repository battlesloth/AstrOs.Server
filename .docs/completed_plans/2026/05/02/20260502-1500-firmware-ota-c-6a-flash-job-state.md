# c.6a — FlashJob state machine + types

Light plan for the first sub-project of c.6 under the by-layer split. c.6a ships pure types + a small set of pure-function transitions that model a flash job's state — no I/O, no Express, no serial integration. Subsequent phases consume this: c.6b (chunk-streaming transport) reads `FwStage` to emit progress; c.6c (orchestrator + harness) drives the transitions in response to serial events and JobLock state.

**Branch:** `feature/firmware-ota-c-6a-flash-job-state` (off `develop`).
**PR target base:** `develop`.
**References:** [decomposition plan](./20260427-2202-firmware-ota-decomposition.md) § "Sub-project decomposition" + § "C. Server ↔ Vue (WebSocket)" (lines 193–233 for the on-the-wire shapes that motivate the type design).

## Context

c.6 (FlashJob orchestrator) was flagged in the original decomposition as the highest-risk piece in the c-series, and the c.5 plan-mode workflow noted it warrants splitting. The by-layer split keeps each sub-project independently reviewable and testable:

- **c.6a** (this plan) — FSM types + transitions, pure compute
- **c.6b** — sliding-window chunk streamer (sender side)
- **c.6c** — orchestrator that composes a/b with `JobLock`, source resolver (cache + upload), WS emit points, and a PTY-stub harness

c.6a's payoff: by the time c.6c is written, the FSM rules are locked in tests and don't have to be re-litigated against the orchestrator's I/O loops. The protocol contract (`.docs/protocol.md` § A) already enumerates the seven stages a controller moves through; this plan codifies them as a discriminated union with a single legal-transition function so the orchestrator can never produce an illegal sequence.

## API overview

**Types** (in `astros_api/src/models/firmware/flash_job_state.ts`):

- `ControllerFlashState` — discriminated union over `FwStage` (existing enum at `models/firmware/firmware_messages.ts`). All variants carry `controllerId`, `bytesSent`, `totalBytes`, `detail` (required string — mirrors the wire shape `FwProgress.detail`; empty string when no message). Terminal variants add stage-specific fields:
    - `VersionConfirmed` adds `finalVersion: string`
    - `Failed` adds `error: string`
- `FlashJobState` — `{ jobId, source: FlashSource, controllers: ControllerFlashState[], startedAt: string, endedAt?: string, abortReason?: string }`. Ordered array, not Map — keeps JSON serialization (c.7's WS payloads) trivial; ~3 controllers means O(n) lookup is a non-issue.
- `FlashSource` — `{ kind: 'github' | 'upload', version: string, sha256: string, sizeBytes: number, displayName: string }`. Unifying view over c.4's `CachedAsset` and c.5's `StoredUpload`. `displayName` is what UI shows ("astros-esp 1.4.0" or "firmware-rc1.bin").
- `JobLifecycle` — string union `'pending' | 'in_flight' | 'done' | 'failed'`. Derived from the aggregate of controller states + `abortReason` (see `deriveJobLifecycle` below).

**Functions** (in `astros_api/src/firmware/flash_job_state_machine.ts`):

- `transitionControllerState(current, toStage, payload?): ControllerFlashState` — overloaded so the type system requires `finalVersion` when `toStage === FwStage.VersionConfirmed` and `error` when `toStage === FwStage.Failed`. Throws on illegal transitions (skipping stages, reversing, leaving a terminal state). Returns a new state object — input is not mutated.
- `deriveJobLifecycle(state: FlashJobState): JobLifecycle`:
    - `failed` if `abortReason` is set
    - `pending` if every controller is `Queued`
    - `done` if every controller is terminal (`VersionConfirmed` or `Failed`)
    - `in_flight` otherwise
- `isControllerStageTerminal(stage: FwStage): boolean` — small predicate, exported because c.6c will pre-check before constructing transition payloads.

Legal-transition rules (from `.docs/protocol.md` § A happy path):

```
Queued → UploadingToMaster → Sending → Verifying → Rebooting → VersionConfirmed
                                                         ↘
  any-non-terminal → Failed
```

## Tasks

- [x] **Typed models** (new `astros_api/src/models/firmware/flash_job_state.ts`):
    - `ControllerFlashState` discriminated union (7 variants matching the seven `FwStage` values)
    - `FlashJobState` interface
    - `FlashSource` interface
    - `JobLifecycle` string union
    - All inline comments only where the type's role is non-obvious (mirrors `cache.ts` / `upload.ts` style); no field-by-field narration

- [x] **State machine functions** (new `astros_api/src/firmware/flash_job_state_machine.ts`):
    - `LEGAL_NEXT_STAGES`: `Map<FwStage, ReadonlySet<FwStage>>` — single source of truth for the transition graph. Keeps the validator's logic out of a giant switch.
    - `isControllerStageTerminal(stage)` — `stage === FwStage.VersionConfirmed || stage === FwStage.Failed`
    - `transitionControllerState` — overloaded signatures:
        - `(current, FwStage.VersionConfirmed, { finalVersion })` → terminal-OK
        - `(current, FwStage.Failed, { error })` → terminal-fail
        - `(current, non-terminal-stage, { bytesSent?, totalBytes?, detail? })` → in-flight progress
    - Implementation throws `Error` with the stage names when transition is illegal; throws when payload doesn't carry the required field (defense for callers that bypass the types).
    - `deriveJobLifecycle` — early-returns `'failed'` on `abortReason`, `'pending'` if all `Queued`, `'done'` if all terminal, else `'in_flight'`.

- [x] **Tests** (new `astros_api/src/firmware/flash_job_state_machine.test.ts`):
    - Happy path: full linear progression Queued→…→VersionConfirmed succeeds; each step preserves immutability of the input state
    - Failed reachable from each non-terminal stage (5 tests, one per source)
    - Illegal transitions throw with informative error messages:
        - Skip a stage (e.g., Queued→Sending)
        - Reverse direction (e.g., Sending→Queued)
        - Out of either terminal state (VersionConfirmed→anything, Failed→anything) — covers all 7 destination stages for each (14 tests, parameterized)
    - Payload validation:
        - `transitionControllerState(_, VersionConfirmed, {})` throws
        - `transitionControllerState(_, Failed, {})` throws
        - In-flight transition with no payload preserves prior `bytesSent` / `totalBytes` / `detail`
        - In-flight transition with partial payload merges (e.g., bytesSent updates, totalBytes stays)
    - `isControllerStageTerminal` — true for VersionConfirmed + Failed, false for the other 5
    - `deriveJobLifecycle`:
        - `abortReason` set → `'failed'` regardless of controller states
        - All controllers in `Queued` → `'pending'`
        - Mixed (one Queued, one Sending) → `'in_flight'`
        - All terminal-OK → `'done'`
        - All terminal-Failed → `'done'` (the job *completed*, even if every controller failed individually — `flashJobFailed` is for early aborts only, per the decomp's WS payload distinction)
        - Mixed terminal (one OK, one Failed) → `'done'`
        - Empty controllers array → `'done'` (degenerate; document the choice)

## Verification

- [x] `npm run build` clean (lint + tsc).
- [x] `npm run test` green (432 → 475, +43 new tests; parameterized `it.each` cases counted individually).
- [x] `npm run prettier:write` and `npm run lint:fix` clean.
- [x] No new fs / network / serial imports — c.6a's only external dep is `FwStage`.

## Source files in scope (3)

1. `astros_api/src/models/firmware/flash_job_state.ts` — discriminated union, FlashJobState, FlashSource, JobLifecycle
2. `astros_api/src/firmware/flash_job_state_machine.ts` — transitions + derivation + terminal-check
3. `astros_api/src/firmware/flash_job_state_machine.test.ts` — tests

3 source files, well under the 10-file cap. **Does not modify any existing source module** — the new types reference `FwStage` from c.1 and that's the only inbound dep.

**Also in this PR's diff but out of c.6a's feature scope:**
- This plan file itself (`.docs/plans/20260502-1500-firmware-ota-c-6a-flash-job-state.md`), per the "plan committed before implementation" rule in CLAUDE.md.
- A workflow update to `CLAUDE.md` adding `superpowers:requesting-code-review` as a mandatory pre-commit step. Process change driven by accumulated PR-review-round cost across c.5 / c.6a; rides along on this branch for operational simplicity rather than its own PR.

## Out of scope

- Any I/O — fs, serial, WebSocket. c.6a is pure compute; c.6b owns transport, c.6c owns orchestration.
- The `FlashSource` *resolver* (logic that picks cache vs upload and produces the `FlashSource` shape from a request) — that's c.6c. c.6a only defines the type.
- Persistence / restart-survival — explicitly out per the decomp's "v1 non-goals."
- Per-controller progress throttling (the protocol's 4 Hz cap) — that's the WS layer (c.7) and the orchestrator (c.6c), not the FSM.
- Failure-mode inventory — c.6a is pure compute, no fs / concurrency / network state. CLAUDE.md says skip FMI for that case.

## Notes for the reviewer

- **Why discriminated union over a single shape with optional fields.** The protocol distinguishes `flashControllerUpdate` (in-flight, requires `stage` + bytes) from `flashControllerResult` (terminal, requires `result` + `finalVersion`/`error`). A single shape with everything optional would let TypeScript accept `{ stage: VersionConfirmed }` without a `finalVersion`, exactly the thing the type is supposed to prevent. Discriminated union pushes the protocol's invariants into the type system, so the orchestrator can't construct an illegal payload at compile time, never mind runtime.

- **Why `abortReason` lives at the job level, not as a controller state.** The protocol's `flashJobFailed` event represents a job-wide abort (master serial disconnect, hash mismatch on master's SD copy, upload failed), distinct from any per-controller `Failed`. A controller's `Failed` is local — others can still complete. A job abort is global. Keeping the two separate matches the decomp's WS event vocabulary and lets `deriveJobLifecycle` distinguish "job ran to completion (some/all controllers may have failed individually)" from "job was aborted before all controllers attempted."

- **Why a `Map` for `LEGAL_NEXT_STAGES` rather than a switch.** The transition graph is small and static; a `Map` literal makes the rules visible at-a-glance and makes the validator a one-liner (`return LEGAL_NEXT_STAGES.get(from)?.has(to) ?? false`). A switch would scatter the rules across cases and tempt readers to look in two places.

- **Empty-controllers-array yields `'done'`.** This is a degenerate input the orchestrator should never produce (a job with no targets shouldn't have started). Documenting `'done'` as the choice means `deriveJobLifecycle` is total — no `undefined`, no throw — which keeps callers simple. An invariant assertion could be added at the orchestrator layer if it's worth defending; not c.6a's job.
