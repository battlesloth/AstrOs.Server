# Firmware OTA deploy-phase watchdog — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bound the `FW_DEPLOY_BEGIN → FW_DEPLOY_DONE` wait with an inactivity watchdog so a master that goes silent mid-deploy fails the job cleanly (`flashJobFailed{reason:'deploy_timeout'}` + lock released) instead of hanging forever.

**Architecture:** A single `deployStallTimer` on `FlashJobOrchestrator`, armed when the deploy subscriber attaches, reset on every `FW_PROGRESS` (via `handleDeployEvent`), disarmed on `FW_DEPLOY_DONE` (hand-off to the existing `finalizeTimer`/`rebootTimer`) and on `releaseLock` (every teardown). On fire it routes through the existing `failDeployPhase`/`failJob` path. All timer ops go through the injected `Clock` so they're fake-timer testable.

**Tech Stack:** TypeScript, Node, vitest (fake timers + the existing `flash_orchestrator.test.ts` fixtures), the integration harness (`bootIntegrationHarness`), Vue 3 + vue-i18n (frontend banner).

**Spec:** `.docs/plans/specs/2026-05-29-firmware-deploy-watchdog-design.md`

---

## Failure-Mode Inventory (timer-lifecycle / concurrency / crash-recovery)

The watchdog is a timer touching shared orchestrator state across async boundaries — no filesystem, but concurrency + crash-recovery apply.

### Timer lifecycle — arm / reset / disarm / fire coverage

| Event / condition | Required response |
|---|---|
| Deploy subscriber attaches (`phase='deploy'`) | Arm `deployStallTimer` (via `kickDeployStallTimer`, which is guarded on `phase==='deploy'`). |
| `FW_PROGRESS` arrives | Reset (clear + re-arm) — master is alive. |
| `FW_DEPLOY_DONE` arrives | Disarm (`clearDeployStallTimer` at top of `handleDeployDone`); hand off to `finalizeTimer`/`rebootTimer`. |
| `POLL_ACK` heartbeat (any version) | **MUST NOT reset** — heartbeats flow through `decidePostDeployHeartbeat`/`notifyMasterHeartbeat`, never `handleDeployEvent`, so structurally they can't kick. (The stuck-bench state was exactly a rebooted master polling forever.) |
| Timer fires | Null the field FIRST, guard on `currentJob!==null && phase==='deploy'`, then `failDeployPhase('deploy_timeout', …)`. |
| `cancel()` during deploy | `cancel → releaseLock → clearDeployStallTimer` (idempotent). |
| `subscriber_attach_failed` (arm never happened) | `releaseLock` clears `null` — no-op. |
| Validation-failed `FW_DEPLOY_DONE` (empty results / bad outcome) | Those branches run BEFORE the disarm at top of `handleDeployDone`? **No** — disarm is the first statement after the `currentJob` guard, so it runs before validation; then `failDeployPhase`→`releaseLock` clears again (idempotent). |

### Concurrency / race conditions

- **First-fire-wins (timer vs teardown):** JS is single-threaded; `clock.clearTimeout` before the callback's turn cancels it. The `currentJob!==null && phase==='deploy'` guard + null-field-first in `onDeployStall` make a callback that races a teardown a no-op, mirroring the existing `rebootTimer`/`finalizeTimer` first-fire-wins pattern.
- **Kick after DONE:** kick is called ONLY in the `progress` branch of `handleDeployEvent`; the `done` branch flows to `handleDeployDone` which disarms. So a done event can't leave a re-armed timer. A late/duplicate event after the subscriber is disposed hits the `currentJob===null` guard (released) or, if `currentJob` still set but `phase!=='deploy'`, `kickDeployStallTimer`'s `phase` guard prevents re-arming.
- **Throw isolation:** all `clock.clearTimeout` calls are wrapped in try/catch + log (matching `releaseLock`'s existing timer clears) so a misbehaving clock can't propagate out of the serial-event dispatcher into the worker.

### Crash-recovery / operability

- The watchdog itself is the crash-recovery mechanism for "master died mid-deploy." Its failure mode is mis-tuning: `deployStallTimeoutMs` too short → false-fail a healthy slow master self-flash. Mitigation: conservative 90s default, configurable; `onDeployStall` logs at `error` with jobId + the elapsed budget for diagnosis.
- **Test-timing gotcha (regression risk):** any EXISTING test that enters the deploy phase and advances the fake clock past `deployStallTimeoutMs` (default 90s) WITHOUT delivering a deploy event will now trip `deploy_timeout`. Every task ends by running the FULL `flash_orchestrator.test.ts` suite; fix any tripped test by delivering an event or overriding `config.deployStallTimeoutMs`.

---

## File Structure

- `astros_api/src/firmware/flash_orchestrator.ts` — new const, config field, state field, `kickDeployStallTimer`/`clearDeployStallTimer`/`onDeployStall`, arm/kick/disarm call sites, reason union member. (The orchestrator is already the single owner of deploy-phase lifecycle; this fits its existing responsibility — no new file.)
- `astros_api/src/controllers/firmware_flash_controller.ts` — one entry in the exhaustive `REASON_HTTP_STATUS` map.
- `astros_api/src/firmware/flash_orchestrator.test.ts` — unit tests (add to the existing `deploy-phase observer` describe block).
- `astros_api/src/firmware/integration/flash_deploy_stall.integration.test.ts` — new integration test (mirrors `flash_reboot_timer_fallback.integration.test.ts`).
- `astros_vue/src/types/firmware.ts` — add `'deploy_timeout'` to the `FLASH_ERROR_REASONS` tuple (auto-derives the union + `KNOWN_FLASH_ERROR_REASONS`).
- `astros_vue/src/locales/enUS.json` — `firmware_view.flash_errors.deploy_timeout` copy.

---

### Task 1: Reason + config plumbing (no behavior yet)

**Files:**
- Modify: `astros_api/src/firmware/flash_orchestrator.ts` (reason union ~408; DEFAULT consts ~332-337; config type ~453; state fields ~543; constructor ~594)
- Modify: `astros_api/src/controllers/firmware_flash_controller.ts` (`REASON_HTTP_STATUS` ~24)

- [ ] **Step 1: Add the error reason.** In `flash_orchestrator.ts`, add `'deploy_timeout'` to the `FlashOrchestratorErrorReason` union (after `'protocol_violation'`):

```ts
  | 'protocol_violation'
  | 'deploy_timeout'
  | 'streamer_unknown_error'
```

- [ ] **Step 2: Verify the build FAILS (exhaustive map gap).**

Run: `cd astros_api && npx tsc --noEmit`
Expected: FAIL — `REASON_HTTP_STATUS` in `firmware_flash_controller.ts` is missing the `deploy_timeout` key (the `Record<FlashOrchestratorErrorReason, HttpStatus>` is exhaustive). This proves the map is the consumer that must stay in sync.

- [ ] **Step 3: Add the HTTP mapping.** In `firmware_flash_controller.ts`, add to `REASON_HTTP_STATUS` (after `protocol_violation: 500,`):

```ts
  protocol_violation: 500,
  // Background watchdog timeout — never returned from the synchronous start()
  // HTTP call (it fires later, surfaced via the flashJobFailed WS event); this
  // entry exists for Record exhaustiveness. 504 = upstream (master) timed out.
  deploy_timeout: 504,
```

- [ ] **Step 4: Add the const, config field, and state field.** In `flash_orchestrator.ts`, after `const DEFAULT_FINALIZE_TIMEOUT_MS = 90_000;`:

```ts
// Deploy-phase inactivity watchdog: max silence (no FW_PROGRESS/FW_DEPLOY_DONE)
// between FW_DEPLOY_BEGIN and FW_DEPLOY_DONE before the job is failed with
// 'deploy_timeout'. Must exceed the longest quiet gap in a healthy deploy —
// chiefly the master's own self-flash write (no FW_PROGRESS emitted during it).
// Matches the finalizeTimer magnitude; configurable per-job.
const DEFAULT_DEPLOY_STALL_TIMEOUT_MS = 90_000;
```

Extend the `config` type (currently `{ rebootTimeoutMs?: number; throttleWindowMs?: number; finalizeTimeoutMs?: number }`):

```ts
  config?: {
    rebootTimeoutMs?: number;
    throttleWindowMs?: number;
    finalizeTimeoutMs?: number;
    deployStallTimeoutMs?: number;
  };
```

Add the readonly field (next to `finalizeTimeoutMs`):

```ts
  private readonly deployStallTimeoutMs: number;
```

Add the timer state field (after `finalizeTimer`):

```ts
  // Deploy-phase inactivity watchdog timer. Armed when the deploy subscriber
  // attaches; reset on each FW_PROGRESS; disarmed on FW_DEPLOY_DONE (hand-off
  // to finalize/reboot timers) and in releaseLock. null outside the
  // FW_DEPLOY_BEGIN→FW_DEPLOY_DONE window. First-fire-wins via the field's
  // null-ness in onDeployStall.
  private deployStallTimer: NodeJS.Timeout | null = null;
```

Wire the constructor (after the `finalizeTimeoutMs` assignment ~594):

```ts
    this.deployStallTimeoutMs =
      opts.config?.deployStallTimeoutMs ?? DEFAULT_DEPLOY_STALL_TIMEOUT_MS;
```

- [ ] **Step 5: Verify build passes.**

Run: `cd astros_api && npx tsc --noEmit`
Expected: PASS (exit 0).

- [ ] **Step 6: Commit.**

```bash
git add astros_api/src/firmware/flash_orchestrator.ts astros_api/src/controllers/firmware_flash_controller.ts
git commit -m "feat(firmware-ota): add deploy_timeout reason + deployStallTimeoutMs config

Plumbing for the deploy-phase watchdog: new FlashOrchestratorErrorReason
'deploy_timeout' (→504 in the exhaustive HTTP map), DEFAULT_DEPLOY_STALL_TIMEOUT_MS
(90s), config.deployStallTimeoutMs, and the deployStallTimer state field. No
behavior yet.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Watchdog arm + fire (no kick/disarm wiring yet)

**Files:**
- Modify: `astros_api/src/firmware/flash_orchestrator.ts` (helpers; arm at subscriber-attach ~852; clear in `releaseLock` ~1153)
- Test: `astros_api/src/firmware/flash_orchestrator.test.ts` (in the `deploy-phase observer` describe block)

- [ ] **Step 1: Write the failing test.** Add inside the `deploy-phase observer` describe (uses the existing `setupHappyPath`/`startAndArmDeploy`/`fakeClock`/`advance`/`emittedFrames`/`controllerResults` fixtures):

```ts
    it('deploy stall: no deploy events for deployStallTimeoutMs → deploy_timeout, controllers Failed, lock released, subscriber disposed', async () => {
      // Short timeout so the fake-clock advance is unambiguous.
      const fx = setupHappyPath({ clock: fakeClock, config: { deployStallTimeoutMs: 5_000 } });
      const armed = await startAndArmDeploy(fx);

      // Subscriber armed, no deploy events delivered. Advance past the stall window.
      expect(fx.bus.deploySubscribers.has(armed.transferId)).toBe(true);
      advance(5_001);

      const failed = emittedFrames(fx.emitWs, TransmissionType.flashJobFailed);
      expect(failed).toHaveLength(1);
      expect(failed[0].data).toMatchObject({ jobId: armed.jobId, reason: 'deploy_timeout' });

      // Non-terminal controllers driven to Failed; lock released; subscriber disposed.
      const results = controllerResults(fx.emitWs);
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.every((r) => r.controller.stage === FwStage.Failed)).toBe(true);
      expect(fx.jobLock.isLocked()).toBe(false);
      expect(fx.orchestrator.getCurrentJob()).toBeNull();
      expect(fx.bus.deploySubscribers.has(armed.transferId)).toBe(false);
    });
```

- [ ] **Step 2: Run it — verify it FAILS.**

Run: `cd astros_api && npx vitest run src/firmware/flash_orchestrator.test.ts -t "deploy stall: no deploy events"`
Expected: FAIL — no `flashJobFailed` emitted (the watchdog doesn't exist yet); `failed` has length 0.

- [ ] **Step 3: Add the three helper methods.** In `flash_orchestrator.ts`, add (place them right after `handleDeployProgress`/`emitTerminalProgressPreview`, before `handleDeployDone`):

```ts
  // Arm or reset the deploy-phase inactivity watchdog. Called at subscriber
  // attach (initial arm) and on each FW_PROGRESS (reset). Guarded on
  // phase==='deploy' so a stray late event can't re-arm it after hand-off.
  private kickDeployStallTimer(): void {
    this.clearDeployStallTimer();
    if (this.phase !== 'deploy') return;
    this.deployStallTimer = this.clock.setTimeout(
      () => this.onDeployStall(),
      this.deployStallTimeoutMs,
    );
  }

  // Disarm the watchdog. Idempotent. Wrapped like releaseLock's other timer
  // clears: a throw from a custom clock must not propagate out of the
  // serial-event dispatcher into the worker.
  private clearDeployStallTimer(): void {
    if (this.deployStallTimer === null) return;
    try {
      this.clock.clearTimeout(this.deployStallTimer);
    } catch (err) {
      logger.error(err, `flash orchestrator: clock.clearTimeout threw clearing deployStallTimer`);
    }
    this.deployStallTimer = null;
  }

  // Watchdog fired: the master sent no FW_PROGRESS/FW_DEPLOY_DONE for
  // deployStallTimeoutMs. Null the field first (so releaseLock's clear is a
  // no-op), then guard first-fire-wins before failing the deploy phase.
  private onDeployStall(): void {
    this.deployStallTimer = null;
    if (this.currentJob === null || this.phase !== 'deploy') return;
    const jobId = this.currentJob.jobId;
    logger.error(
      `flash orchestrator: deploy stalled — no FW_PROGRESS/FW_DEPLOY_DONE for ${this.deployStallTimeoutMs}ms on job=${jobId}; failing (deploy_timeout)`,
    );
    this.failDeployPhase('deploy_timeout', `no deploy progress for ${this.deployStallTimeoutMs}ms`);
  }
```

- [ ] **Step 4: Arm at subscriber attach.** In the deploy-phase block, right after the `this.deployUnsubscriber = this.bus.subscribeDeployEvents(...)` assignment succeeds (inside the try, after the assignment ~line 852):

```ts
            this.deployUnsubscriber = this.bus.subscribeDeployEvents(transferId, (event) =>
              this.handleDeployEvent(event),
            );
            // Arm the inactivity watchdog now that we're waiting on the master.
            this.kickDeployStallTimer();
```

- [ ] **Step 5: Clear in `releaseLock`.** In `releaseLock`, after the `finalizeTimer` clear block (after `this.finalizeTimer = null;` ~line 1153) and before the `deployUnsubscriber` disposal:

```ts
    this.clearDeployStallTimer();
```

- [ ] **Step 6: Run the test — verify it PASSES, and the full file is green.**

Run: `cd astros_api && npx vitest run src/firmware/flash_orchestrator.test.ts`
Expected: PASS — the new test passes AND all existing tests still pass. If any existing test now fails with an unexpected `deploy_timeout`, it idled in the deploy phase past the default 90s; fix it by delivering a deploy event or setting `config.deployStallTimeoutMs` high in that test's `setupHappyPath`.

- [ ] **Step 7: Mutation check.** Temporarily comment out the `this.kickDeployStallTimer();` arm call (Step 4); rerun the new test; confirm it FAILS (no `flashJobFailed`). Restore the line.

- [ ] **Step 8: Commit.**

```bash
git add astros_api/src/firmware/flash_orchestrator.ts astros_api/src/firmware/flash_orchestrator.test.ts
git commit -m "feat(firmware-ota): deploy-phase watchdog arm + fire

Arm a deployStallTimer when the deploy subscriber attaches; on timeout fire
failDeployPhase('deploy_timeout'). Cleared in releaseLock (idempotent,
first-fire-wins via null-field guard). Kick-on-progress + disarm-on-DONE
follow in the next tasks.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Reset the watchdog on FW_PROGRESS

**Files:**
- Modify: `astros_api/src/firmware/flash_orchestrator.ts` (`handleDeployEvent` ~1201)
- Test: `astros_api/src/firmware/flash_orchestrator.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
    it('deploy stall: FW_PROGRESS resets the watchdog (no false timeout while the master keeps reporting)', async () => {
      const fx = setupHappyPath({ clock: fakeClock, config: { deployStallTimeoutMs: 5_000 } });
      const armed = await startAndArmDeploy(fx);

      // Two progress frames, each within the window, total elapsed > window.
      advance(4_000);
      fx.bus.deliverDeployEvent(armed.transferId, {
        kind: 'progress',
        payload: { transferId: armed.transferId, controllerId: 'controller-a', stage: FwStage.Verifying, bytesSent: 0, totalBytes: 0, detail: '' },
      });
      advance(4_000); // 8s total elapsed, but only 4s since the last event
      fx.bus.deliverDeployEvent(armed.transferId, {
        kind: 'progress',
        payload: { transferId: armed.transferId, controllerId: 'controller-a', stage: FwStage.Flashing, bytesSent: 0, totalBytes: 0, detail: '' },
      });

      // No timeout yet — the master has been reporting.
      expect(emittedFrames(fx.emitWs, TransmissionType.flashJobFailed)).toHaveLength(0);
      expect(fx.bus.deploySubscribers.has(armed.transferId)).toBe(true);

      // Now go silent past the window → fires.
      advance(5_001);
      const failed = emittedFrames(fx.emitWs, TransmissionType.flashJobFailed);
      expect(failed).toHaveLength(1);
      expect(failed[0].data).toMatchObject({ reason: 'deploy_timeout' });
    });
```

- [ ] **Step 2: Run it — verify it FAILS.**

Run: `cd astros_api && npx vitest run src/firmware/flash_orchestrator.test.ts -t "FW_PROGRESS resets"`
Expected: FAIL — without the kick, the first `advance(4_000)+advance(4_000)=8s` exceeds the 5s window mid-test, so `flashJobFailed` fires early → the `toHaveLength(0)` assertion fails.

- [ ] **Step 3: Add the kick to the progress branch.** In `handleDeployEvent`:

```ts
  private handleDeployEvent(event: FwDeployEvent): void {
    if (this.currentJob === null) return;
    if (event.kind === 'progress') {
      // Master is alive — reset the inactivity watchdog before processing.
      this.kickDeployStallTimer();
      this.handleDeployProgress(event.payload);
      return;
    }
    this.handleDeployDone(event.payload.results);
  }
```

- [ ] **Step 4: Run the test — verify it PASSES and the file is green.**

Run: `cd astros_api && npx vitest run src/firmware/flash_orchestrator.test.ts`
Expected: PASS, all green.

- [ ] **Step 5: Commit.**

```bash
git add astros_api/src/firmware/flash_orchestrator.ts astros_api/src/firmware/flash_orchestrator.test.ts
git commit -m "feat(firmware-ota): reset deploy watchdog on each FW_PROGRESS

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Disarm the watchdog on FW_DEPLOY_DONE

**Files:**
- Modify: `astros_api/src/firmware/flash_orchestrator.ts` (`handleDeployDone` top ~1279)
- Test: `astros_api/src/firmware/flash_orchestrator.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
    it('deploy stall: FW_DEPLOY_DONE disarms the watchdog (post-DONE finalize/reboot timers govern, no deploy_timeout)', async () => {
      const fx = setupHappyPath({ clock: fakeClock, config: { deployStallTimeoutMs: 5_000 } });
      const armed = await startAndArmDeploy(fx);

      // Drive both controllers to Rebooting, then DONE all-OK (terminal).
      for (const controllerId of armed.targets) {
        for (const stage of [FwStage.Verifying, FwStage.Flashing, FwStage.Rebooting]) {
          fx.bus.deliverDeployEvent(armed.transferId, {
            kind: 'progress',
            payload: { transferId: armed.transferId, controllerId, stage, bytesSent: 0, totalBytes: 0, detail: '' },
          });
        }
      }
      fx.bus.deliverDeployEvent(armed.transferId, {
        kind: 'done',
        payload: {
          transferId: armed.transferId,
          results: armed.targets.map((id) => ({ controllerId: id, outcome: 'OK' as const, finalVersion: '1.4.0', error: '' })),
        },
      });

      // Past the stall window AFTER done — the watchdog must be disarmed.
      advance(5_001);
      expect(emittedFrames(fx.emitWs, TransmissionType.flashJobFailed)).toHaveLength(0);
    });
```

- [ ] **Step 2: Run it — verify it FAILS.**

Run: `cd astros_api && npx vitest run src/firmware/flash_orchestrator.test.ts -t "FW_DEPLOY_DONE disarms"`
Expected: FAIL — without the disarm, the timer (re-armed by the last FW_PROGRESS kick) is still live; `advance(5_001)` fires `deploy_timeout` → `flashJobFailed` length 1, not 0.

- [ ] **Step 3: Disarm at the top of `handleDeployDone`.** Add as the first statement after the `currentJob` guard:

```ts
  private handleDeployDone(results: FwDeployDoneResult[]): void {
    if (this.currentJob === null) return;
    // FW_DEPLOY_DONE ends the deploy-phase wait — disarm the inactivity
    // watchdog. The post-reboot finalizeTimer/rebootTimer (armed below) govern
    // from here. (Runs before validation: a malformed DONE still ends the wait,
    // and failDeployPhase→releaseLock would clear it again, idempotently.)
    this.clearDeployStallTimer();
```

- [ ] **Step 4: Run the test — verify it PASSES and the file is green.**

Run: `cd astros_api && npx vitest run src/firmware/flash_orchestrator.test.ts`
Expected: PASS, all green.

- [ ] **Step 5: Commit.**

```bash
git add astros_api/src/firmware/flash_orchestrator.ts astros_api/src/firmware/flash_orchestrator.test.ts
git commit -m "feat(firmware-ota): disarm deploy watchdog on FW_DEPLOY_DONE

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Edge cases — cancel disarms, and a late event after timeout is a no-op

**Files:**
- Test only: `astros_api/src/firmware/flash_orchestrator.test.ts`

- [ ] **Step 1: Write the tests** (both behaviors already hold from Tasks 2–4; these pin them against regression).

```ts
    it('deploy stall: cancel() during the deploy phase disarms the watchdog (no later deploy_timeout)', async () => {
      const fx = setupHappyPath({ clock: fakeClock, config: { deployStallTimeoutMs: 5_000 } });
      const armed = await startAndArmDeploy(fx);

      await fx.orchestrator.cancel('user');
      const failedAfterCancel = emittedFrames(fx.emitWs, TransmissionType.flashJobFailed).length;

      advance(5_001);
      // No ADDITIONAL flashJobFailed from a stray watchdog fire after cancel.
      expect(emittedFrames(fx.emitWs, TransmissionType.flashJobFailed)).toHaveLength(failedAfterCancel);
      expect(fx.orchestrator.getCurrentJob()).toBeNull();
    });

    it('deploy stall: a stray deploy event after the watchdog fired is a no-op (no second failure / no throw)', async () => {
      const fx = setupHappyPath({ clock: fakeClock, config: { deployStallTimeoutMs: 5_000 } });
      const armed = await startAndArmDeploy(fx);

      advance(5_001); // fire deploy_timeout → job released
      expect(emittedFrames(fx.emitWs, TransmissionType.flashJobFailed)).toHaveLength(1);

      // The FakeSerialBus disposed the subscriber on release; deliver directly to
      // handleDeployEvent's guard path by re-driving through the bus only if still
      // subscribed. After release it is not, so assert disposal instead.
      expect(fx.bus.deploySubscribers.has(armed.transferId)).toBe(false);
      // A second clock advance must not produce another failure.
      advance(5_001);
      expect(emittedFrames(fx.emitWs, TransmissionType.flashJobFailed)).toHaveLength(1);
    });
```

- [ ] **Step 2: Run them — verify PASS (no impl change).**

Run: `cd astros_api && npx vitest run src/firmware/flash_orchestrator.test.ts -t "deploy stall"`
Expected: PASS. (If cancel does NOT disarm, the first test fails — confirming `releaseLock`'s clear covers cancel.)

- [ ] **Step 3: Commit.**

```bash
git add astros_api/src/firmware/flash_orchestrator.test.ts
git commit -m "test(firmware-ota): pin deploy-watchdog cancel-disarm + post-fire no-op

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Integration test — master goes silent end-to-end

**Files:**
- Create: `astros_api/src/firmware/integration/flash_deploy_stall.integration.test.ts`

Mirror `flash_reboot_timer_fallback.integration.test.ts`: boot the harness with `flashOrchestratorConfig: { deployStallTimeoutMs: <short> }`, run a flash through the real worker/orchestrator, deliver upload acks + a couple of `FW_PROGRESS` frames via the stub, then **stop emitting** (no `FW_DEPLOY_DONE`), and assert a `flashJobFailed{reason:'deploy_timeout'}` arrives and the lock is released.

- [ ] **Step 1: Write the test.** Open `flash_reboot_timer_fallback.integration.test.ts` first and copy its harness-boot + auth + `waitForWsMessage` scaffolding verbatim, changing only: the config key to `deployStallTimeoutMs`, the stub to emit a few `FW_PROGRESS` frames then go silent (NO `writeFwDeployDone`), and the assertion to:

```ts
      const failed = await harness.waitForWsMessage<{ type: number; data: { reason: string } }>(
        (m) => (m as { type?: unknown }).type === TransmissionType.flashJobFailed &&
               (m as { data?: { reason?: string } }).data?.reason === 'deploy_timeout',
        SHORT_DEPLOY_STALL_TIMEOUT_MS + 5_000,
      );
      expect(failed.data.reason).toBe('deploy_timeout');

      // Lock released after the watchdog fires.
      const lockReleased = await harness.waitForWsMessage<{ type: number; locked: boolean }>(
        (m) => { const msg = m as { type?: unknown; locked?: unknown };
                 return msg.type === TransmissionType.lockStateChanged && msg.locked === false; },
        5_000, snapshot,
      );
      expect(lockReleased.locked).toBe(false);
      expect(harness.workerErrors).toEqual([]);
```

Use a real-time short timeout that comfortably exceeds the stub's progress cadence — `const SHORT_DEPLOY_STALL_TIMEOUT_MS = 3_000;` — and emit ~2 progress frames in the first ~1s, then stop. (Confirm the stub exposes a way to send progress without DONE — `writeFwProgress` exists and is public; call it directly, then never call `writeFwDeployDone`.)

- [ ] **Step 2: Run it — verify PASS.**

Run: `cd astros_api && npx vitest run src/firmware/integration/flash_deploy_stall.integration.test.ts`
Expected: PASS (the watchdog fires ~3s after the last progress; `flashJobFailed{deploy_timeout}` + lock release observed through the real worker→orchestrator path).

- [ ] **Step 3: Commit.**

```bash
git add astros_api/src/firmware/integration/flash_deploy_stall.integration.test.ts
git commit -m "test(firmware-ota): integration — silent master mid-deploy → deploy_timeout

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Frontend — deploy_timeout banner

**Files:**
- Modify: `astros_vue/src/types/firmware.ts` (`FLASH_ERROR_REASONS` tuple ~line 187)
- Modify: `astros_vue/src/locales/enUS.json` (`firmware_view.flash_errors` ~line 197)

- [ ] **Step 1: Write the failing test.** In the firmware store/types test (find the existing test that asserts `KNOWN_FLASH_ERROR_REASONS` membership or banner reason mapping — search `KNOWN_FLASH_ERROR_REASONS` / `post_reboot_timeout` under `astros_vue/src/**/*.spec.ts`/`*.test.ts`). Add:

```ts
  it("recognizes 'deploy_timeout' as a known flash error reason", () => {
    expect(KNOWN_FLASH_ERROR_REASONS.has('deploy_timeout')).toBe(true);
  });
```

- [ ] **Step 2: Run it — verify FAILS.**

Run: `cd astros_vue && npx vitest run -t "deploy_timeout"`
Expected: FAIL — `'deploy_timeout'` not in the tuple, so `.has(...)` is `false` (and TS may flag the literal — if so, that IS the red).

- [ ] **Step 3: Add to the tuple.** In `astros_vue/src/types/firmware.ts`, add `'deploy_timeout'` to `FLASH_ERROR_REASONS` immediately after `'post_reboot_timeout'`:

```ts
  // post_reboot_timeout copy.
  'post_reboot_timeout',
  // deploy_timeout copy (server deploy-phase inactivity watchdog).
  'deploy_timeout',
```

- [ ] **Step 4: Add the i18n copy.** In `astros_vue/src/locales/enUS.json`, add to `firmware_view.flash_errors` after the `post_reboot_timeout` entry (add the trailing comma to the prior line):

```json
      "post_reboot_timeout": "Master controller did not report a matching firmware version within 90 seconds. The flash may have failed; verify the controller and retry.",
      "deploy_timeout": "The master controller stopped responding during the update (no progress for 90 seconds). The flash was aborted; check the master's power and USB connection, then try again."
```

- [ ] **Step 5: Run the test + i18n consistency.**

Run: `cd astros_vue && npx vitest run -t "deploy_timeout"` → PASS.
If the repo has an i18n-key-completeness test (search for a test importing `enUS.json` keys), run the full `npm run test:unit` to confirm no missing-key failure.

- [ ] **Step 6: Commit.**

```bash
git add astros_vue/src/types/firmware.ts astros_vue/src/locales/enUS.json astros_vue/src/<the-test-file>
git commit -m "feat(firmware-ui): deploy_timeout flash-error banner copy

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Full verification + pre-push review

- [ ] **Step 1: API gate.** `cd astros_api && npm run prettier:write && npm run lint:fix && npm run build && npx vitest run` — all green, 0 lint errors.
- [ ] **Step 2: Vue gate.** `cd astros_vue && npm run lint && npm run test:unit` — green.
- [ ] **Step 3: Pre-push review.** Run `/pr-review-toolkit:review-pr` on the full branch diff vs `develop`, framed around the timer-lifecycle hazards in the FMI above (arm/kick/disarm/fire across every exit, first-fire-wins, kick-after-DONE, POLL_ACK-doesn't-kick, the test-timing regression risk). Address Critical/Important.
- [ ] **Step 4: Update the spec/plan status** and hand off for push (user pushes via VS Code → PR into `develop`).

---

## Self-Review

**Spec coverage:** inactivity model (Tasks 2–3) ✓; timer-only, no serial-close (out of scope, not in any task) ✓; 90s default + configurable (Task 1) ✓; arm/kick/disarm/fire lifecycle (Tasks 2–4) ✓; POLL_ACK-doesn't-kick (structural — kick only in `handleDeployEvent`; FMI + integration Task 6 exercise the real path) ✓; `deploy_timeout` reason + HTTP map (Task 1) ✓; frontend banner (Task 7) ✓; races/first-fire-wins (Task 5 + FMI) ✓; tests incl. mutation check (Task 2 Step 7) + integration (Task 6) ✓.

**Placeholder scan:** the only deferred specifics are "find the existing frontend test file" (Task 7 Step 1) and "copy the reboot-timer harness scaffolding" (Task 6 Step 1) — both point at concrete existing files to read, not invented content. No TBD/TODO in code steps.

**Type/name consistency:** `deployStallTimer`, `deployStallTimeoutMs`, `DEFAULT_DEPLOY_STALL_TIMEOUT_MS`, `kickDeployStallTimer`/`clearDeployStallTimer`/`onDeployStall`, reason `'deploy_timeout'` — used consistently across all tasks and match the spec.
