# Handoff: Firmware OTA PR set 2 Phase C — server-side `Finalizing` state + `PENDING` outcome

> **Briefing for a fresh Claude Code session rooted in AstrOs.Server.** Hand this document to a new session to give it the context it needs to scope and implement the work.

## TL;DR

The AstrOs.ESP Phase C firmware merged to develop on 2026-05-28 (PR #41, merge `3e55b8d`). It introduces a new `PadawanStatus::PENDING` wire status for the master self-flash row in `FW_DEPLOY_DONE`. **The current AstrOs.Server's parser strictly rejects any outcome that isn't `OK` or `FAILED` — so a `PENDING` row will cause the entire `FW_DEPLOY_DONE` to be discarded as `UNKNOWN`, leaving the deploy stuck in whatever pre-DEPLOY_DONE state it was in.** This breaks every master-included deploy until the server PR lands.

Padawan-only deploys, master-only deploys *without* triggering master self-flash, and Phase A's behavior are all unaffected — only the new master self-flash success path produces a `PENDING` row.

The fix is two stacked layers: a one-line parser relaxation (unblocks the immediate failure) plus a `Finalizing`-state mechanism that uses the **existing** `post_deploy_heartbeat.ts` watcher infrastructure to resolve `PENDING` rows.

## The BLOCKING finding (verified 2026-05-28)

Read `astros_api/src/serial/message_handler.ts:357-361`:

```typescript
const outcome = fields[1];
if (outcome !== 'OK' && outcome !== 'FAILED') {
  logger.error(`FW_DEPLOY_DONE has unknown outcome: ${outcome}`);
  return { type: SerialWorkerResponseType.UNKNOWN };
}
```

When the new Phase C firmware emits `FW_DEPLOY_DONE` with a master row carrying `outcome="PENDING"`:
- `handleFwDeployDone` returns `{ type: UNKNOWN }`
- The whole DEPLOY_DONE is logged as an error and discarded
- The deploy record in the orchestrator is never updated
- Operator sees the deploy stuck in `Flashing` or `Rebooting` forever (whatever the last successful FW_PROGRESS stage was)

## What the Server already has (good news)

After exploration, the server-side infrastructure for the post-reboot version-match heartbeat is **already in place** from Phase A's coordination — Phase C should mostly hook into it:

- **`FwStage` enum** (`astros_api/src/models/firmware/firmware_messages.ts:20-30`) already includes `Rebooting` and `VersionConfirmed`. Phase A's firmware emits these as `FW_PROGRESS` stages; the orchestrator already handles them.
- **`post_deploy_heartbeat.ts` + `decidePostDeployHeartbeat`** is a pure-function watcher with `MASTER_POLL_ADDRESS = '00:00:00:00:00:00'`. It already decides whether an incoming POLL_ACK from the master with a matching version should fire the orchestrator's post-deploy heartbeat. Comments reference the 15 s reboot-timer fallback that Phase A's master-side `versionConfirmTimer` provides — the two halves are already coordinated.
- **`flash_orchestrator.ts`** is the deploy state machine. Already has version-match resolution logic for the master's heartbeat.
- **`late_join_snapshot.ts`** + **`flash_job_state_machine.ts`** handle operator UX state.

What's MISSING for Phase C:

1. **Parser doesn't accept `"PENDING"`** (the BLOCKING finding above).
2. **No type for a `Pending` outcome** — `FwDeployDoneResult.outcome` is currently typed as `'OK' | 'FAILED'`.
3. **No `Finalizing` deploy state** — when DEPLOY_DONE arrives with all rows resolved (`OK` or `FAILED`), the orchestrator closes the deploy. With Phase C, a master `PENDING` row should keep the deploy open in a new "Finalizing" sub-state until either: (a) the existing `decidePostDeployHeartbeat` fires for the master with the expected version → mutate `PENDING → OK`, then complete the deploy, or (b) a 90 s safety timeout → mutate `PENDING → FAILED("post_reboot_timeout")`, then complete the deploy.
4. **UI: PENDING row rendering** — show a spinner / "Awaiting post-reboot heartbeat" placeholder until resolved. The UI already renders `OK` (green pill) and `FAILED` (red pill); add a third visual.

## Context references

- **Firmware-side merged PR** (AstrOs.ESP develop): PR #41 merge commit `3e55b8d`.
- **Firmware-side Phase C design**: `/home/jeff/Source/astros/AstrOs.ESP/.docs/plans/20260528-1234-firmware-ota-pr-set-2-phase-c-master-self-flash-design.md`. Section 5 of that doc describes the server-side expectations.
- **Firmware-side Phase C implementation plan**: `/home/jeff/Source/astros/AstrOs.ESP/.docs/plans/20260528-1243-firmware-ota-pr-set-2-phase-c-master-self-flash.md`.
- **Firmware-side Phase C PR summary**: `/home/jeff/Source/astros/AstrOs.ESP/.tmp/pr-summary-ota-pr-set-2-phase-c.md`. Has the full picture of what shipped firmware-side + the deferred follow-up list.
- **Cross-repo decomposition** (older): `AstrOs.Server/.docs/completed_plans/2026/04/27/20260427-2202-firmware-ota-decomposition.md`.
- **Phase A server-side PR** (already merged): `feature/fw-progress-flashing-stage` — landed `FwStage.Flashing` + state-machine transitions + UI mapping. Phase C builds on that scaffolding.

## Proposed scope (subject to brainstorm/refinement)

### Minimum viable change (just unblock the failure)

- One line in `handleFwDeployDone`: extend the outcome check to also accept `"PENDING"`. Adds `'PENDING'` to the `FwDeployDoneResult.outcome` union. Master `PENDING` rows now parse instead of trashing the whole DEPLOY_DONE.
- Without further work, the orchestrator would receive the `PENDING` row but have no resolution path. The deploy record would close with master row stuck at PENDING forever (UI would render as unknown).
- This is acceptable as a stopgap if the Finalizing-state work needs to wait; the firmware would no longer break the server, just leave a per-deploy "unresolved master row" record.

### Proper completion (recommended for this PR)

1. **Parser update** — accept `"PENDING"`.
2. **Type union update** — `FwDeployDoneResult.outcome: 'OK' | 'FAILED' | 'PENDING'`.
3. **Orchestrator: `Finalizing` deploy sub-state** — when DEPLOY_DONE arrives with any PENDING rows, hold the deploy in a new state (could be a flag on the existing job record rather than a new top-level state).
4. **Hook into existing `decidePostDeployHeartbeat`** — when the watcher fires `'fire'` for a deploy that has a PENDING master row, resolve that row: `PENDING → OK` with `finalVersion` populated, complete the deploy.
5. **90 s safety timeout** — if PENDING isn't resolved within 90 s of DEPLOY_DONE arrival, mutate `PENDING → FAILED("post_reboot_timeout")` and complete the deploy. 90 s covers worst-case ESP boot (~5 s) + SD remount (~3 s) + first poll cycle (~2 s) + 10× margin.
6. **UI** — render PENDING as a spinner / "Finalizing" indicator; existing `OK` and `FAILED` rendering needs no change once rows mutate.
7. **Tests** — extend `message_handler.test.ts` for the parser change, `flash_orchestrator.test.ts` for the Finalizing state transitions, `post_deploy_heartbeat.test.ts` for the PENDING-resolution decision rules, `late_join_snapshot.test.ts` for the operator-UX state.

### Sanity checks before brainstorming

- Verify the deploy state machine genuinely needs a NEW state vs. just a flag on an existing one. The existing `Verifying → Flashing → Rebooting → VersionConfirmed` flow may already provide a natural place to defer completion.
- Check whether `post_deploy_heartbeat.ts` currently routes the `'fire'` decision through `notifyMasterHeartbeat` to a resolution path that already does "mutate a row → mark deploy complete." If yes, Phase C may be mostly wiring + the parser update.
- The 90 s timeout — does the orchestrator already have a watchdog timer infrastructure? Reuse it if so.

## Recommended next-session opening prompt

When opening a fresh Claude Code session rooted at `/home/jeff/Source/astros/AstrOs.Server`, paste roughly:

> The AstrOs.ESP Phase C firmware just merged (develop merge `3e55b8d`, 2026-05-28) and introduces a `PadawanStatus::PENDING` wire status. Our server's `handleFwDeployDone` parser strictly rejects unknown outcomes, so the new firmware breaks every master-included deploy. Read `.docs/plans/20260528-1455-handoff-firmware-ota-pr-set-2-phase-c-server-side.md` for the full context and the proposed scope, then brainstorm + plan + implement the server-side completion. Sister-repo references are in that doc.

The new session will then read this file, follow its own CLAUDE.md conventions (brainstorming → plan → implement workflow), and produce the server PR.

## Open questions for the new session to settle

- Is the parser-only "minimum viable" change worth shipping as a separate hotfix before the Finalizing work, or are master-included deploys rare enough that we can wait for the full PR?
- Does the existing `flash_job_state_machine.ts` enum need a new top-level state (e.g., `Finalizing`), or is a sub-state / boolean flag on the existing job record sufficient?
- Should the 90 s timeout be configurable, or is the documented value good enough?
- UI: spinner-with-text or just an outlined pill? Defer to the established AstrOs visual language.
- Test fixture: who owns producing a synthetic `FW_DEPLOY_DONE` with a `PENDING` row for the parser test? Likely a new helper in `message_handler.test.ts`.
