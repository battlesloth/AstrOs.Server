# Design: Firmware OTA deploy-phase watchdog

**Date:** 2026-05-29
**Branch:** `feature/firmware-deploy-watchdog` (off `develop`)
**Status:** design — pending user review

## Problem

During an OTA flash, after the server sends `FW_DEPLOY_BEGIN` it enters the
**deploy phase** (`phase = 'deploy'`, deploy subscriber armed) and waits for the
master to drive `FW_PROGRESS` frames and finally `FW_DEPLOY_DONE`. **There is no
timeout on this wait.** The post-`FW_DEPLOY_DONE` reboot/heartbeat wait is
covered by `rebootTimer` (~15 s) and `finalizeTimer` (~90 s), but both are armed
*inside* `handleDeployDone` — so if `FW_DEPLOY_DONE` never arrives, neither ever
arms.

Confirmed on the bench (2026-05-29): a master that crashed mid-self-flash
(`ota_writer_task` stack overflow) rebooted into the old image and never sent
`FW_DEPLOY_DONE`. The job hung indefinitely (196 s+ observed), the `JobLock`
stayed held (blocking further flashes), and the UI sat on "reboot in progress"
forever. Recovery required a manual `DELETE /api/firmware/flash` or a restart.

This gap is pre-existing on `develop`; it was previously masked for one
sub-case by a (buggy) `protocol_violation` self-heal that the
`fix/firmware-progress-terminal-stage` PR correctly removed.

## Goal

Bound the deploy-phase wait: if the master goes silent (no deploy events) for a
configurable interval, fail the job cleanly — release the lock and emit
`flashJobFailed{reason:'deploy_timeout'}` so the operator sees a definite failure
instead of a permanent hang.

**Non-goal:** making a crashing/dead master *succeed*. The watchdog converts an
infinite hang into a bounded, visible failure. (The firmware crash itself is an
AstrOs.ESP concern, already fixed separately.)

## Design decisions (settled in brainstorming)

1. **Inactivity model** (not an overall deadline). Reset on each deploy event;
   fire only after N ms of silence. Scales with deploy size and tolerates slow
   boards; an overall deadline would have to exceed total deploy time (which
   scales with controller count) and risks false-failing large deploys.
2. **Timer-only this PR.** Wiring serial `close`/`error` → fail-job (a faster
   fast-path for physical unplug) is a **separate follow-up**; the observed
   failure (crash+reboot, USB-serial port stayed open) is caught by the timer
   regardless.
3. **Default 90 s, configurable** via `config.deployStallTimeoutMs`. Must exceed
   the longest quiet gap in a *healthy* deploy — chiefly the master's own
   self-flash write (~1.27 MB, no `FW_PROGRESS` emitted during it). Too short =
   false-fail a working deploy (worse than a slow recovery), so the default is
   conservative and matches the existing `finalizeTimer` magnitude.

## Mechanism

New state on `FlashJobOrchestrator`:
- `private deployStallTimer: NodeJS.Timeout | null = null`
- `private readonly deployStallTimeoutMs: number` (← config, default
  `DEFAULT_DEPLOY_STALL_TIMEOUT_MS = 90_000`)

New error reason:
- `'deploy_timeout'` added to the `FlashOrchestratorErrorReason` union, plus an
  entry in the exhaustive reason→HTTP-status map in
  `firmware_flash_controller.ts`. It never fires during the synchronous HTTP
  `start()` call (it is a background timeout surfaced via the `flashJobFailed`
  WS event), so the HTTP map entry exists only for exhaustiveness — mapped to
  `504 Gateway Timeout`.

Lifecycle (all timer ops via the injected `Clock`, so fake-timer testable):

| Event | Action |
|---|---|
| `phase → 'deploy'` (subscriber attaches) | **Arm** `deployStallTimer` for `deployStallTimeoutMs`. |
| Any deploy event enters `handleDeployEvent` (`FW_PROGRESS` or `FW_DEPLOY_DONE`) | **Kick**: clear + re-arm. Proof the master is alive. |
| `handleDeployDone` runs | **Disarm** (hand off to `finalizeTimer`/`rebootTimer`). |
| `releaseLock` (cancel, failJob, attach-failure, any teardown) | **Disarm** (canonical chokepoint). |
| Timer fires | Null the field, then `failDeployPhase('deploy_timeout', detail)`. |

**POLL_ACK heartbeats do NOT kick the timer** — they flow through
`decidePostDeployHeartbeat`, not `handleDeployEvent`. This is essential: a
rebooted master polling with the wrong version every ~4 s must not keep the
watchdog alive forever (that is exactly the bench stuck-state).

On fire, `failDeployPhase('deploy_timeout', …)` reuses the existing failure path:
transition non-terminal controllers → `Failed`, emit `flashControllerResult`
per controller, emit `flashJobFailed{jobId, reason:'deploy_timeout', detail,
endedAt}`, release the lock, broadcast `lockStateChanged`.

## Races & invariants (to be expanded in the failure-mode inventory)

- **First-fire-wins.** The timer callback guards on `currentJob !== null &&
  phase === 'deploy'` before acting, and nulls `deployStallTimer` first — so a
  callback that races a teardown is a no-op, and `releaseLock`'s clear is
  idempotent.
- **Disarm on every exit.** `releaseLock` is the single teardown chokepoint
  (already disposes subscriber + throttle + reboot/finalize timers); clearing
  the stall timer there + in `handleDeployDone` covers all paths. Mirror the
  existing "timer set but currentJob null" invariant assertions.
- **Kick-then-disarm on DONE.** Kicking at the top of `handleDeployEvent` then
  disarming inside `handleDeployDone` nets to "cleared" (one harmless extra
  clock op on the done path); keeps the kick unconditional and simple.
- **No throw out of the dispatcher.** The fire path (`failDeployPhase` →
  `failJob`) already swallows-and-logs WS emit failures; the callback itself
  performs no throwing work beyond that.

## Surfaces touched

- **Backend:** `firmware/flash_orchestrator.ts` (state, config wiring, arm/kick/
  disarm/fire, reason union, default const); `controllers/firmware_flash_controller.ts`
  (reason→HTTP-status map).
- **Frontend (minimal — the operability payoff):** a `deploy_timeout` banner,
  following the existing `post_reboot_timeout` pattern — reason handling in the
  firmware store/types + an i18n copy key. Without it the UI shows a generic/
  blank message when the watchdog fires, undercutting the goal.
- **Tests:** orchestrator unit tests (arm on deploy-phase entry; kick on
  `FW_PROGRESS`; disarm on `FW_DEPLOY_DONE`; disarm on cancel; fire after
  silence → `flashJobFailed{deploy_timeout}` + lock released + controllers
  Failed; POLL_ACK does NOT kick; first-fire-wins vs late event) with a mutation
  check; one integration test (drive progress, go silent, advance the clock →
  `deploy_timeout` → lock released); frontend test for the banner copy.

## Out of scope (follow-ups)

- Serial `close`/`error` → fail active job (fast-path for physical unplug).
- Any change to firmware self-flash behavior (AstrOs.ESP).
