# QA — Firmware OTA Phase C (server-side)

Manual bench plan for the Finalizing state, 90 s `finalizeTimer`, and "Finalizing…" UI pill introduced by Phase C server-side work. Mirrors the firmware-side C.1–C.3 test scenarios from the server viewpoint and adds server-specific cases (cancel during Finalizing, late-join mid-Finalizing, test-override observable in < 1 s). Run end-to-end against the bench rig before opening the Phase C server PR against `develop`.

## Preconditions

- **Spare master ESP32 required.** Use a lolin_d32_pro or metro_s3 reconfigured via `main.cpp` role-config as a spare master. NEVER test on the production master — Phase C exercises the master's self-flash path, which involves rebooting the master into new firmware.
- USB serial tether between the spare master and the server host.
- Server built from `feature/firmware-ota-phase-c-server` and running: `cd astros_api && npm run start:tsx`. Ports 3000 (API), 5000 (WebSocket).
- Vue app running: `cd astros_vue && npm run dev`. Browser at `http://localhost:5173`. Navigate to `/firmware`.
- At least one padawan (Body or Core) online and connected for multi-controller deploys (S1, S4, S5).
- Firmware binary available — either a GitHub release in the configured `FIRMWARE_REPO` or a pre-uploaded binary via `POST /api/firmware/upload`.
- Auth session active. Export a token once:
  ```bash
  TOKEN=$(curl -s -X POST http://localhost:3000/api/login \
    -H 'Content-Type: application/json' \
    -d '{"username":"<op>","password":"<pw>"}' | jq -r .token)
  ```
- WebSocket inspector connected to `ws://localhost:5000`. Browser devtools console works (`new WebSocket('ws://localhost:5000')`, attach `onmessage` printing `JSON.parse(e.data)`), or use `wscat`.
- Devtools Network and Console tabs open for HTTP + WS observation.

## Test cases

### S1 — Master self-flash happy path (mirrors firmware C.1)

**Steps:**
1. Open `/firmware` in the browser.
2. Select the spare master plus one padawan (e.g., Body or Core) as deploy targets.
3. Pick a firmware source (GitHub release or uploaded binary).
4. Click "Flash firmware", confirm in the modal.
5. Observe the padawan row: `Queued → UploadingToMaster → Sending → Verifying → Flashing → Rebooting → VersionConfirmed`.
6. When the master emits DEPLOY_DONE (all padawan rows are terminal), observe the master row.
7. After the master's post-reboot POLL_ACK arrives (typically 10–30 s after DEPLOY_DONE), observe both tabs.
8. Confirm the job-wide affordance fires.

**Expected:**
- Step 5: Padawan row pill cycles through stages and lands on green "Done". The master row shows "Queued" throughout the padawan flash.
- Step 6: Master row pill shows **"Finalizing…"** (indigo pill). NO job-complete banner or modal fires yet. The job is held open — `flashJobDone` has NOT been emitted.
- Step 7: Master row pill flips to green "Done". The job-wide "flash complete" affordance fires (banner, result bar, etc.). `lockStateChanged { locked: false }` arrives on WS.
- Step 8: `GET /api/firmware/flash` returns `null`. Subsequent POST flash returns 200 (lock cleanly released).
- Total elapsed: roughly 30 s for padawan flash + 10–30 s for the Finalizing window, depending on master reboot speed.

### S2 — Master self-flash failure (mirrors firmware C.2)

**Steps:**
1. Use a debug firmware build that forces the master flash to fail (e.g., `ESP_FAIL` return from `esp_ota_end()` — per firmware C.2 debug instructions).
2. Deploy spare master + one padawan.
3. Observe the master row after DEPLOY_DONE arrives.

**Expected:**
- Master row pill renders immediately as **red "Failed"** with the reason from the DEPLOY_DONE payload (e.g., "ESP_FAIL").
- NO "Finalizing…" pill — a failed DEPLOY_DONE outcome skips the resolution window entirely.
- The job-wide failure banner shows the reason and marks the job terminal.
- `lockStateChanged { locked: false }` arrives within the existing 15 s rebootTimer window (unchanged behavior from Phase B).
- `GET /api/firmware/flash` returns `null` after lock release.

### S3 — Post-reboot timeout (mirrors firmware C.3 with auto-rollback)

**Steps:**
1. Use a debug firmware build that crashes immediately on boot (e.g., `abort()` at the top of `app_main` — per firmware C.3 debug instructions). The ESP-IDF rollback mechanism will revert to the old image.
2. Deploy spare master only.
3. Observe the master row after DEPLOY_DONE arrives with `master=PENDING`.
4. Watch for POLL_ACK heartbeats from the master as it rolls back and boots into the old image.
5. Wait out the full 90 s finalizeTimer window without taking any action.

**Expected:**
- Step 3: Master row pill shows "Finalizing…" (indigo).
- Step 4: Old-version POLL_ACKs arrive. `decidePostDeployHeartbeat` returns `version_mismatch` (silent server-side log); the Finalizing row remains unchanged — version-mismatch heartbeats do not resolve the window.
- Step 5: At ~90 s after DEPLOY_DONE arrival, the finalizeTimer fires. Master row pill flips to **red "Failed"** with error `post_reboot_timeout`. Operator banner reads: "Master controller did not report a matching firmware version within 90 seconds. The flash may have failed; verify the controller and retry."
- `lockStateChanged { locked: false }` arrives. Master is still functional on the old image.
- `GET /api/firmware/flash` returns `null`.

### S4 — Cancel during Finalizing

**Steps:**
1. Deploy spare master + one padawan as in S1.
2. Once the master row enters Finalizing (pill shows "Finalizing…"), click "Cancel" before the master's post-reboot heartbeat arrives.

   > **Timing note:** The Finalizing window is normally 10–30 s (master reboot speed). To reliably hit it, either (a) hold the spare master in reset after DEPLOY_DONE by pulling the reset line / grounding EN for the duration of the test, or (b) use a server dev build that sets `finalizeTimeoutMs` to a longer value (e.g., 120 000 ms) so there is more time to click Cancel.

3. After cancelling, wait past the original 90 s timeout window and observe the UI and server logs.

**Expected:**
- Cancel fires. Master row pill flips to red "Failed" with the abort reason shown.
- `flashJobFailed { abortReason }` arrives on WS. Lock released.
- The finalizeTimer is disposed and does **not** fire later — after waiting past the timeout window, confirm no further `flashControllerResult`, `flashJobFailed`, or `lockStateChanged` events appear in the WS inspector or server logs.
- `GET /api/firmware/flash` returns `null` immediately after cancel.

### S5 — Late-join WebSocket connect mid-Finalizing

**Steps:**
1. Deploy spare master + one padawan as in S1.
2. Once the master row enters Finalizing (pill shows "Finalizing…"), open a **second browser tab** (or incognito window) and navigate to the same `/firmware` URL, logging in if prompted.
3. Observe the second tab's initial render.
4. Wait for the master's post-reboot heartbeat to arrive.

**Expected:**
- Step 3: The second tab immediately renders the FlashJobState snapshot with the master row showing "Finalizing…" — proving `decideLateJoinSnapshot` returns the in-flight snapshot correctly. The padawan row shows its terminal state (green "Done").
- Step 4: When the master's heartbeat arrives, **both tabs** update the master row to green "Done" simultaneously. The `flashControllerResult` WS event broadcasts to all connected clients.
- No stale-snapshot artifacts (second tab must not show all controllers as "Queued").

### S6 — Test override observable in < 1 s

**Steps:**
1. In the vitest unit-test harness, configure `FlashJobOrchestratorOpts.config.finalizeTimeoutMs = 500`.
2. Trigger the orchestrator's Finalizing path via the test fixture (inject a DEPLOY_DONE with `master=PENDING`; do not send a matching POLL_ACK).
3. Observe the timeout-resolution flow.

**Expected:**
- Within ~500 ms of the DEPLOY_DONE injection, the `post_reboot_timeout` outcome fires (the `flashControllerResult` event and the timer-fired assertion pass).
- The `finalizeTimer` observable value is `null` after resolution (timer is cleared).
- This confirms the test-override path works — the `finalizeTimeoutMs` option is honored at construction time and is not hard-coded at 90 000 ms.

> **Note:** This case validates the test infrastructure, not a user-visible UI behavior. The `finalizeTimeoutMs` override is not exposed to operators in production.

## Negative coverage notes

- **Server restart mid-Finalizing:** The `JobLock` and finalizeTimer are in-memory. On restart, all in-flight state is dropped. The master's post-restart POLL_ACK with the new version returns `no_active_job` from `decidePostDeployHeartbeat` (silent server log). Operator must verify the master version manually and retry if the flash actually failed. Acceptable for this PR; restart-recovery is out of scope.

- **Two heartbeats race during Finalizing:** First heartbeat fires, mutates rows, clears the finalizeTimer, and releases the lock. Second heartbeat hits `finalizeTimer === null && rebootTimer === null` and is a no-op. Covered by the orchestrator unit test "first-fire-wins" assertion. No manual bench action needed.

- **finalizeTimer fires while a heartbeat is in flight:** The JavaScript event loop is single-threaded, so the heartbeat handler and the timer callback can never truly interleave — whichever runs first resolves the job to completion. If the heartbeat runs first, it calls `clearTimeout(finalizeTimer)`, so the scheduled timer callback is cancelled and never executes. If the timer runs first, it resolves the job and releases the lock (`currentJob = null`); the later heartbeat then finds `finalizeTimer === null && rebootTimer === null` and returns a no-op, with `completePendingResolution`'s `currentJob === null` early-return as the backstop. Either way no double-resolution is possible. Covered by unit tests; no manual bench action needed.

- **DELETE /api/firmware/flash with no active job during Finalizing teardown:** If an operator cancels after the finalizeTimer has already fired and resolved the job, the lock is already released. Cancel returns 404 `no_active_job` — not 200 — and no further events are emitted. This is correct behavior; the job is already terminal.
