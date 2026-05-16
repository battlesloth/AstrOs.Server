# Firmware downgrade opt-in QA

Tests for the "Allow downgrades" feature: a contextual toggle in the controllers panel that lets an operator deliberately flash older firmware on a controller, with an explicit ack in the confirm modal. The toggle is per-session (resets on page reload). See `.docs/plans/20260515-2253-firmware-allow-downgrade.md` for context.

## Preconditions

- AstrOs.Server running (`cd astros_api && npm run start:tsx`) with at least one GitHub release available (the firmware page already shows past releases).
- Vue app running (`cd astros_vue && npm run dev`); browser at `http://localhost:5173`.
- Bench rig powered up with at least two controllers reporting their running firmware version — ideally one controller running a newer firmware than at least one available release tag, so a downgrade scenario is reachable. If your fleet is all on the latest, temporarily flash one controller to a newer dev build (or pick an older release as the target in step 2 of test 2).
- Operator logged in and on `/firmware`.

## Test cases

### 1. Pure-upgrade flow — toggle is hidden, modal unchanged

1. From the controllers panel, confirm all visible controllers are running firmware ≤ the latest release tag.
2. Pick the **latest release** from the source strip.
3. **Pass:** the controllers panel header shows only `Select all` / `Clear` buttons — no "Allow downgrades" toggle.
4. Tick at least one controller and click `Flash firmware`.
5. **Pass:** the confirm modal renders without the "I understand…" ack region. The Push-firmware button is enabled immediately.
6. **Fail:** toggle visible, or ack region rendered, in a pure-upgrade scenario.

### 2. Mixed scenario — toggle appears, but checkboxes still disabled until opted in

1. Set up a fleet where at least one controller runs newer firmware than the target you're about to pick (e.g., Core on `1.4.2`, available release `1.3.5`).
2. Pick the **older** release (`1.3.5`) from the source strip.
3. **Pass:** the controllers panel header now shows the "Allow downgrades" toggle (unchecked by default).
4. **Pass:** the controllers panel's downgrade row(s) show the red `DOWNGRADE` pill on the version delta, and their checkboxes are **disabled**.
5. Hover the toggle.
6. **Pass:** the toggle has accessible help text describing the per-session behavior (visible via screen reader / dev-tools accessible-name inspector — the text is `sr-only`, not a native tooltip).
7. **Fail:** toggle missing, checkboxes selectable on downgrade rows without ticking the toggle, or pill missing.

### 3. Toggle ON — downgrade rows become selectable, action bar updates

1. From test 2, click the "Allow downgrades" toggle.
2. **Pass:** the toggle is now checked. The downgrade row checkbox becomes enabled.
3. **Pass:** the red DOWNGRADE pill still renders on the row (visual warning preserved).
4. **Pass:** the `⛔ Downgrade blocked` warning copy in the action bar is gone.
5. Tick the downgrade controller's checkbox.
6. **Pass:** `Flash firmware` is enabled.
7. **Fail:** checkbox still disabled, pill missing, action-bar warning still showing, or Flash button stays disabled.

### 4. Confirm modal — ack required for downgrades

1. From test 3, click `Flash firmware`.
2. **Pass:** confirm modal opens. The list of targets shows the controllers; downgrade controllers display a red DOWNGRADE pill on their version delta.
3. **Pass:** between the power-warning and the action buttons, a soft-red region appears with a checkbox and the text "I understand this will install OLDER firmware on N controller(s)." (N matches the number of selected downgrade controllers — not the total selection).
4. **Pass:** `Push firmware` is **disabled** until the checkbox is ticked.
5. Tick the checkbox.
6. **Pass:** `Push firmware` is now enabled. Cancel out of the modal (or proceed if you want to flash for real — the rest of the flash flow is unchanged).
7. **Fail:** ack region absent, count wrong, Push button enabled before tick, or no soft-red coloring.

### 5. Ack resets on reopen

1. From test 4 (modal open with ack ticked), click `Cancel`.
2. From the controllers panel, click `Flash firmware` again with the same selection.
3. **Pass:** the modal reopens with the ack checkbox **unchecked**, and `Push firmware` is disabled again.
4. **Fail:** ack stays ticked across modal cycles (would let the operator proceed without re-confirming).

### 6. Hard-blocked (offline) controllers are NOT overridden by the toggle

1. Power off one controller so it transitions to status `down` (grey pill, no green dot). Wait one poll cycle.
2. With the toggle ON, look at the offline controller's row.
3. **Pass:** the checkbox is **still disabled**. The toggle relaxes the downgrade policy, not the reachability constraint.
4. **Fail:** offline controller becomes selectable with the toggle on.

### 7. Toggle resets on page reload (per-session contract)

1. Enable the toggle (and optionally tick a downgrade selection).
2. Reload the page (F5 / Cmd-R).
3. **Pass:** the toggle is back to its hidden / unchecked default. If you still have a downgrade scenario, the toggle reappears unchecked. The downgrade checkboxes are disabled again.
4. **Fail:** toggle stays on across reloads (would defeat the deliberate-intent design).

### 8. Upload-source target ignores the gate

1. Pick `Upload` in the source strip and select a local `.bin` build (target becomes `local-build`).
2. **Pass:** no "Allow downgrades" toggle in the panel (uploaded firmware is never classified as a downgrade — the version string isn't comparable).
3. Tick any controller(s) and proceed to the confirm modal.
4. **Pass:** the modal does **not** render the ack region.
5. **Fail:** toggle appears for upload flows, or ack region fires spuriously.

### 9. Quick smoke — pure-upgrade flow is regression-clean

1. Reset: pick a target that's an upgrade for all controllers.
2. Tick all controllers.
3. **Pass:** Flash button enabled; modal opens without ack region; full flow works as it did before this feature. Cancel out (or proceed).
4. **Fail:** any behavior in a pure-upgrade flow differs from the pre-feature baseline.

## Notes

- The toggle is intentionally session-only; persisting it across reloads would defeat the "deliberate intent" framing. The toggle DOES survive `resetToSelect()` (cross-flash retention) — the modal ack remains the last-chance gate on each individual flash, and the toggle's checked state stays visible to the operator so the armed state is observable.
- The ack region is intentionally rendered as `role="alert"` so screen-reader users hear it announced when it appears. The toggle is `role="checkbox"` (native input) with `aria-describedby` pointing to a `sr-only` help span.
- No firmware or backend changes are required for this feature; the policy lives entirely in the Vue store and UI.

## Known limitation — pre-existing, not introduced by this feature

If a controller is reachable (status='up' or 'needsSynced') but its firmware version is unknown / unparseable, `compareTags` returns NaN and the downgrade gate fails open: the row is selectable, the toggle doesn't appear (no fleet downgrade detected), and the modal ack region doesn't render. The operator may flash without realizing they are downgrading. This is a long-standing latent issue (predates this feature) — surfaced during the pre-push review. Mitigations being considered for a follow-up: treat unparseable-current as hard-block (`isHardBlocked`), or surface a distinct "unknown firmware" ack in the modal. The em-dash sentinel for `current` (line 129 of `stores/firmware.ts`) is the canonical reproduction.
