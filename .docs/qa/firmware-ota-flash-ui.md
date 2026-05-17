# Firmware OTA — Vue UI QA

Manual operator-flow QA for the `/firmware` view shipped across phase D (PRs d.1–d.6). Run end-to-end after d.6 merges. Unit-level coverage of the WS dispatcher, store handlers, type mapping, and lock-aware components lives in vitest (see latest `cd astros_vue && npx vitest run` for current count).

## Preconditions

- AstrOs.Server running with a working `~/.config/astrosserver/database.sqlite3` and at least one connected ESP fleet (Body master, Core padawan, Dome padawan). The bench rig (see `project_bench_servo_geometry`) is sufficient for visual flow tests; real flash tests need an actual fleet.
- Vue app running: `cd astros_vue && npm run dev`. Browser at `http://localhost:5173`.
- Devtools open with the Network and Console tabs visible.
- Login credentials handy.
- For tests that simulate a second operator: a second browser (or incognito window) ready.

## Test cases

### 1. Cold-load with no flash in flight

**Steps:**
1. Stop and restart the server (clean state).
2. Log in and navigate to `/firmware`.

**Expected:**
- Page chrome renders: "Firmware" header, "Push firmware..." subtitle.
- SourceStrip visible with GitHub/Upload toggle.
- Topology card and Controllers panel render below.
- Controllers panel lists Body / Core / Dome with their current firmware versions and online status dots.
- Flash button is disabled (no source picked + no controllers selected).
- DevTools console shows no warnings.

### 2. Happy-path flash (select → confirm → flashing → done)

**Steps:**
1. From `/firmware`, pick a GitHub release that's a valid upgrade from current.
2. Tick Body and Core.
3. Click "Flash firmware".
4. Confirm modal opens; click "Push firmware".

**Expected:**
- Modal lists source tag + target controllers with version deltas + power warning.
- After confirm: phase transitions to `flashing`. Topology shows animated dashed lines on connected segments; StagesList appears below with `download` (or whichever stage the server first emits) as current.
- ControllerRow on the right switches from checkbox mode to status pill ("Updating" for active, "Queued" otherwise).
- WebSocket events `flashControllerUpdate` flow in as stages progress: `UPLOADING_TO_MASTER → SENDING → VERIFYING → REBOOTING → VERSION_CONFIRMED`.
- On completion: phase → `done`. Result bar shows "✓ All N controller(s) updated" on green background. Done button.
- Click Done → returns to `select` phase, panel resets, controllerStates cleared.

### 3. Failure path — server returns 4xx synchronously

**Steps:**
1. Make the GitHub fetch fail (e.g., disconnect network temporarily, or pick a release tag that doesn't exist on disk).
2. Pick a release, tick controllers, click Flash, confirm.

**Expected:**
- POST `/api/firmware/flash` returns 4xx (e.g., 400 `release_not_found` or 502 `release_lookup_failed`).
- Phase rolls back to `select`.
- Inline error banner appears above the action bar with the localized error copy.
- Banner has "Try again" and "Dismiss" buttons. Try again is disabled until the underlying issue is fixed (e.g., source still missing); Dismiss clears the banner.

### 4. Failure path — mid-flash WS `flashJobFailed`

**Steps:**
1. Pick a release with a real download.
2. Start the flash.
3. During the SENDING stage, kill one of the padawan ESPs (power cycle Core, for instance).

**Expected:**
- WS emits `flashControllerUpdate` with stage `FAILED` for the affected controller.
- Eventually `flashJobFailed` arrives.
- Phase → `failed`. Result bar shows "⚠ Core failed during transfer" (or matching stage) on red background.
- The failed controller's row shows the red `!` glyph on the topology, red status pill on the panel.
- Click Done → resetToSelect clears terminal state.

### 5. Late-join — open page during another operator's flash

**Steps:**
1. Operator A: start a flash from one browser. Wait for it to be mid-flight (stage SENDING or VERIFYING).
2. Operator B: open a second browser, log in, navigate to `/firmware`.

**Expected:**
- Operator B sees a lock-conflict alert above the SourceStrip ("Firmware update in progress / Another operator started a firmware update at {since}").
- SourceStrip + Topology + Controllers panel are NOT rendered for Operator B (lock conflict suppresses the working UI).
- The global `AstrosLockStateBanner` also appears at the top of Operator B's page.
- When Operator A's flash completes, Operator B's lock-conflict alert clears automatically (WS `flashJobDone` triggers store update, lock releases).

### 6. Cold-load while own flash is in flight

**Steps:**
1. Start a flash.
2. While flashing, refresh the page (F5).

**Expected:**
- `firmwareStore.fetchCurrentJob()` runs on mount; HTTP GET `/api/firmware/flash` returns the active job.
- WS late-join also delivers `flashJobStarted`; both paths converge on the same state via the store's idempotency.
- The page shows the in-flight UI (flashing phase). `isOwnJob` is `true` since `ownJobId` was captured from the earlier POST response — **but** this state is lost across a page refresh, so the user effectively sees the in-flight state without "ownership." **Known limitation:** post-refresh, the lock-conflict alert WILL appear because `ownJobId` is no longer set. The flash continues server-side regardless. The QA expectation: page shows flashing UI either way; the conflict alert vs. flashing UI distinction is acceptable in either direction post-refresh.

### 7. Lock-aware write button — global enforcement

**Steps:**
1. Start a flash from `/firmware`.
2. While flashing, navigate to other write surfaces: `/modules`, `/scripts`, `/playlists`, `/utility`.

**Expected:**
- Every `AstrosWriteButton` instance (Save module, Save script, etc.) is disabled.
- Hovering the disabled button shows the lock-active tooltip ("A firmware update is in progress — write actions are disabled until it completes.").
- When the flash completes, write buttons re-enable automatically.

### 8. Tab-close mid-flash

**Steps:**
1. Start a flash.
2. While flashing, close the tab without clicking Cancel or Done.

**Expected:**
- The flash continues server-side (verify via server logs or by reopening `/firmware` and confirming the lock-conflict alert).
- No `beforeunload` cancel signal is sent.
- After re-opening `/firmware`: the in-flight UI (or lock-conflict alert per #6) renders.

### 9. Network failure during flash POST

**Steps:**
1. Pick a release, tick controllers.
2. Disconnect network or stop the server.
3. Click Flash → Confirm.

**Expected:**
- POST hangs up to the 30s timeout.
- Phase rolls back to `select`.
- Error banner shows `network_error` copy ("Couldn't reach the server...").
- DevTools console shows the underlying axios error (the `console.error` breadcrumb in `startFlash`'s catch).

### 10. WS reconnect during flash

**Steps:**
1. Start a flash.
2. During flashing, kill the WS connection (e.g., briefly disconnect network).
3. Wait 3s+ for `useWebsocket`'s reconnect.

**Expected:**
- Vue reconnects; server emits a fresh `flashJobStarted` snapshot.
- The store's `applyJobStarted` replaces (not merges) controllerStates from the snapshot.
- UI remains coherent — no stale per-controller stages from before the disconnect.

### 11. `prefers-reduced-motion`

**Steps:**
1. DevTools → Rendering → Emulate CSS media → `prefers-reduced-motion: reduce`.
2. Start a flash (or view the d.3 Storybook `Flashing` story).

**Expected:**
- Topology dashed-line animation halts (lines still dashed but not flowing).
- All other UI behavior unchanged.

### 12. Dev-mode invariant warnings

**Steps:**
1. With `npm run dev`, navigate to `/firmware`.
2. Open the DevTools console.
3. Force fleet states to trigger each dev warning:
   - Set all three controllers to non-master via a manual controllerStore mutation in the console (or a temporary code edit): expect `[FirmwareView] no controller is flagged isMaster — topology will not render.` warn.
   - With `phase=flashing` but no controllerStates yet (visible briefly between POST and WS): expect `[AstrosFirmwareControllersPanel] progressByControllerId is undefined during phase="flashing"` warn (if the panel renders before the WS event lands).

**Expected:**
- Warns fire only in dev. Production build (`npm run build`) strips them via `import.meta.env.DEV`.

## Regression check

- All d.3 / d.4 / d.5 storybook stories still render correctly.
- All vitest tests still pass: `cd astros_vue && npx vitest run`.
- The smoke e2e spec passes locally: `npx playwright test e2e/C_01_firmware-page.spec.ts` (requires a running server).

## 6.5 Refresh during the 15s reboot-wait window (round-7 CR-1 regression check)

**Preconditions:** A flash has just completed; the result bar shows "✓ all updated"; the server is in the reboot-wait window (lock still held — typically the ~15s after a successful flash).

**Steps:**
1. Refresh the browser tab during this window.

**Expected (post-round-7):**
- Page shows phase='idle' / Select panel.
- Lock-conflict banner may briefly appear if the lock hasn't released yet; it disappears within ~15s as the server releases the lock.
- No UI wedge at phase='flashing'.

**Regression signal (pre-fix):** Page rendered phase='flashing' indefinitely until a second refresh after the lock released. Round-7 CR-1a (fetchCurrentJob endedAt filter) + CR-1b (handleLockStateChanged defense) close this.

## Known limitations (documented, not blockers)

- **`ownJobId` not persisted across refresh.** Post-refresh, a flash that was "ours" appears as another operator's job until it completes. The flash itself is unaffected. d.7 (if ever) could persist `ownJobId` in `sessionStorage`.
- **No in-UI cancel during flash.** The design handoff doesn't include a Cancel button mid-flash. Operators must let the flash complete (or kill the server) to abort.
- **`network_error` and `timeout_error` collapse to one envelope.** A 30s+ hung POST and a never-reached server both surface the same banner copy. The `console.error` breadcrumb in `startFlash`'s catch carries the underlying axios `code` (`ECONNABORTED` vs network failure) for debugging.
