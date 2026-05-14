# Firmware OTA d.7 Follow-ups — Manual QA Test Plan

Covers the three fixes from `.docs/plans/20260514-1520-firmware-ota-d-7-followups.md`:

1. `jobLock` HTTP hydrate on `App.vue` mount.
2. `AstrosConfirmModal` consumer wiring in `ModulesView` and `ScripterView`.
3. `AstrosServoTestModal` slider readonly check.

Run all three sections before approving the PR to `develop`.

---

## Preconditions (all sections)

- Local dev server running: `cd astros_api && npm run start:tsx` (port 3000) + `cd astros_vue && npm run dev` (port 5173).
- Logged in as a configured user; at least one Location with one UART module and one I2C module configured (run `B_01_modules-page.spec.ts` once if the DB is fresh — the e2e leaves a populated state).
- A test script exists with at least one channel (create via Scripts → New if needed).

---

## Section 1 — `jobLock` HTTP hydrate

**Goal:** confirm that deep-linking to `/firmware` (or any view) during a foreign flash shows the locked banner from first paint — no interactive window before the WS handshake completes.

### Setup

A second client session needs to hold the lock. The easiest reproduction without a real flash:

1. Open two browser windows (Session A + Session B), both logged in.
2. In Session A, navigate to `/firmware`, pick a GitHub release, click **Push Firmware**, dismiss the confirm modal (so the request goes through and the orchestrator acquires the lock). Leave Session A in the "flashing" state with the in-page progress visible.

### Test cases

| # | Action | Expected |
|---|--------|----------|
| 1.1 | In Session B (window 2), navigate to `/scripts`. | Lock banner appears at top of layout. "View progress" CTA visible. No flash of unlocked UI. |
| 1.2 | In Session B, do a **hard refresh** (Cmd+Shift+R / Ctrl+F5) on `/scripts`. | Lock banner present from first paint. No window where banner is missing then appears. |
| 1.3 | In Session B, deep-link directly to `/firmware` (paste URL in address bar). | Source strip is in the lock-suppressed state from first paint (GitHub picker disabled, file input disabled). NOT interactive even for ~1 second. |
| 1.4 | DevTools → Network tab → reload Session B. Observe the request to `/api/firmware/lock-state`. | Returns 200 with body `{ locked: true, owner: "flashJob:...", since: "2026-..." }`. Fires on the same `onMounted` tick as `/api/system/status`. |
| 1.5 | In Session A, wait for the flash to finish (or DELETE `/api/firmware/flash` to abort). In Session B, refresh. | Lock banner gone, source strip interactive. `/api/firmware/lock-state` returns `{ locked: false, owner: null, since: null }`. |

### Edge case

| # | Action | Expected |
|---|--------|----------|
| 1.E1 | Stop the API server (Ctrl+C in the `astros_api` terminal). In Session B, refresh `/scripts`. | UI renders without crashing. `console.warn('jobLock.fetchLockState failed', ...)` in browser console. Banner stays in last-known state (unlocked is the default). |

---

## Section 2 — `AstrosConfirmModal` consumer wiring

**Goal:** confirm the Confirm button actually invokes the handler in both view consumers (was a no-op on `develop`).

### 2.A — `ModulesView` (remove a UART/I2C module)

| # | Action | Expected |
|---|--------|----------|
| 2.A.1 | Navigate to `/modules`. Expand a location, expand the Serial section, expand a UART module. | Module body visible with a "remove" button (trash icon). |
| 2.A.2 | Click the remove button on the module. | Confirm modal opens with the `module_view.confirm_remove` message ("Are you sure you want to remove this module?"). |
| 2.A.3 | Click **Confirm**. | Modal closes. Module is removed from the location's UART list. Pinia state reflects the removal (the module no longer appears in the UI after the modal closes). |
| 2.A.4 | Open the modal again on another module. Click **Close** (the secondary button). | Modal closes. Module stays in the list. |
| 2.A.5 | Open the modal again. Click outside the modal (backdrop click). | Modal closes via backdrop. Module stays in the list. |
| 2.A.6 | Repeat 2.A.1–2.A.3 for an I2C module. | Same as 2.A.3 — Confirm actually removes. |

### 2.B — `ScripterView` (remove a channel)

The channel-row delete control is **rendered inside the PixiJS canvas** (`pixiChannelData.ts:66` — `deleteButton`), not as a DOM element. The icon is a small trash glyph on the left-hand channel-list strip of the timeline. Standard Playwright DOM selectors will not find it; this is why the regression test for this flow is manual rather than e2e.

| # | Action | Expected |
|---|--------|----------|
| 2.B.1 | Navigate to a script in `/scripter/<id>`. | Pixi timeline visible with at least one channel row in the left strip. |
| 2.B.2 | In the left channel-list strip of the canvas, click the trash icon on a channel row. | Confirm modal opens with the configured message ("Are you sure you want to remove this channel?" or similar). |
| 2.B.3 | Click **Confirm**. | Modal closes. Channel row is removed from the left strip. The associated event tracks disappear from the timeline. Pinia `scripterStore` reflects the change (verify via Vue DevTools → Pinia → scripter → `script.channels` no longer contains the removed channel). |
| 2.B.4 | Trigger the trash icon on another channel. Click **Close**. | Modal closes. Channel stays. |

### Regression context

On `develop` before this fix, **Confirm did nothing** in both flows. The bug was silent because Vue's fallthrough event listeners attached to the inner `<dialog>` element instead of triggering the handler — and `<dialog>` doesn't emit a `confirm` event. So the modal would close on backdrop / close button (because `<dialog>` does emit `close`) but Confirm was a dead click.

---

## Section 3 — `AstrosServoTestModal` slider readonly check

**Goal:** confirm the slider and handlers respect `systemStatus.readOnly` (in addition to `jobLock.locked`).

### Setup

To force `systemStatus.readOnly = true` locally, the easiest path is to corrupt the migration sequence or use the integration test harness. For a quick manual flip:

```bash
# Patch the systemStatus state via the API server's internal call (requires running tsx with debugging)
# Or — simpler — temporarily edit astros_api/src/system_status.ts to default to readOnly=true and restart the server.
```

If neither is convenient, this section can be **skipped with explicit note** because the slider's `:disabled` binding is straightforward TypeScript and the unit test in `AstrosServoTestModal.spec.ts` (added in T6) covers the readonly path. The full e2e regression doesn't need manual rerun.

### Test cases (if readonly can be triggered)

| # | Action | Expected |
|---|--------|----------|
| 3.1 | With `systemStatus.readOnly = false` and `jobLock.locked = false`: open the Servo Test modal on any servo channel. Click **Enable Test**, drag the slider, also type a value into the adjacent number input. | WS `SERVO_TEST` messages fire on each slider input AND on each number-input change. |
| 3.2 | With test active, flip `systemStatus.readOnly = true`. | Slider and number input both auto-disable (visually greyed). **Enable Test** button is disabled with the readonly tooltip. The "lock-active-notice" region (firmware-lock-specific copy) is **NOT** shown — readonly is explained by the button tooltip alone. |
| 3.3 | With `jobLock.locked = true` (start a flash in another session): open the Servo Test modal. Try to **Enable Test**. | Button disabled with the firmware-lock tooltip. Slider and number input both visually disabled. Lock-active-notice region IS shown below the slider with copy `firmware_view.lock_active`. |
| 3.4 | While modal is open with test active, transition jobLock from unlocked → locked (start a foreign flash). | Slider and number input both auto-disable. Label reverts to "Enable Test". Notice region appears. |

---

## QA sign-off

- [ ] Section 1 (jobLock HTTP hydrate) passes all cases.
- [ ] Section 2.A (ModulesView confirm) passes all cases.
- [ ] Section 2.B (ScripterView confirm) passes all cases.
- [ ] Section 3 (ServoTestModal readonly) passes — or explicitly skipped with rationale.

Tester: _______________  Date: _______________
