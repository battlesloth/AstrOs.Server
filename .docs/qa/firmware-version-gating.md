# Firmware-version compatibility gating QA

Tests for the cross-repo feature that splits the previously combined "down" red-pulse state into two distinct states: `FIRMWARE_INCOMPATIBLE` (red, online but firmware too old) and `DOWN` (grey, not responding). Run after Phase 1 (firmware) and Phase 2 (server + Vue) have both merged.

## Preconditions

- AstrOs.ESP firmware **1.2.0** (or `1.2.0-dev.N`) flashed to the bench rig — both master and at least one peer.
- AstrOs.Server running: `cd astros_api && npm run start:tsx`.
- Vue app running: `cd astros_vue && npm run dev`. Browser at `http://localhost:5173`.
- User logged in and on a page that subscribes to the `LOCATION_STATUS` WebSocket (Status page or Modules page).
- Server `MINIMUM_FIRMWARE_VERSION` is `1.2.0` (default in `astros_api/src/models/firmware_config.ts`).

## Test cases

### 1. Happy path — firmware compatible and synced

1. Bench rig powered up, both controllers booted and registered.
2. Wait for one full poll cycle (~5s).
3. **Status page:** no overlays on body / dome / core. Just the base R2 image.
4. **Modules page:** body and dome (and core, if used) headers each show the green checkmark icon.
5. Hover the green checkmark on the body header.
6. **Pass:** tooltip reads `Firmware 1.2.0` (or `Firmware 1.2.0-dev.N` for a local dev build). The icon's `aria-label` matches.
7. **Fail:** tooltip absent, says `Firmware unknown`, or the icon is the wrong color.

### 2. Sync needed — firmware OK, config stale

1. With both controllers happy, modify the body controller's module config in the UI but do NOT click Sync.
2. **Status page:** body location overlays with the **yellow** `_yellow.png` and pulses.
3. **Modules page:** body header shows the yellow warning icon. Hovering: tooltip still shows `Firmware 1.2.0`.
4. Click Sync. After ~1 poll cycle, body returns to UP visuals (no overlay, green check).

### 3. Firmware incompatible — connected but old version

Two ways to reproduce; pick whichever is easier:

- **a. Bump the minimum.** Edit `astros_api/src/models/firmware_config.ts`, set `MINIMUM_FIRMWARE_VERSION = '1.3.0'`, restart the server.
- **b. Flash older firmware.** Re-flash an ESP from before the Phase 1 merge (3-field POLL_ACK, no version reported).

Then:

1. Wait for one poll cycle.
2. **Status page:** the affected location overlays with the **red** `_red.png` and pulses (same visual as today's "down" used to be — but now it specifically means firmware out of date).
3. **Modules page:** the affected location header shows the **red** warning icon (`io-warning`, `text-red-500`).
4. Hover the red icon.
5. **Pass:** tooltip reads `Firmware 1.2.0 (minimum 1.3.0 required)` for case (a), or `Firmware unknown (minimum 1.2.0 required)` for case (b).
6. **Fail:** tooltip says just `Firmware {version}` (the OK variant), or shows no minimum, or is missing.

Restore: revert the `MINIMUM_FIRMWARE_VERSION` change (case a) or re-flash 1.2.0+ firmware (case b). Server picks up the change on poll.

### 4. Disconnected — controller not responding

1. With the rig running and showing UP, **physically disconnect** one controller (pull power or USB).
2. Wait one poll cycle (the server's poll-NAK / timeout takes a few seconds).
3. **Status page:** the affected location overlays with the new **grey** `_grey.png` and is **static — no pulse**.
4. **Modules page:** the affected location header shows the **dark-grey question circle** (`io-help-circle-outline`, `text-gray-600`).
5. Hover the question icon.
6. **Pass:** tooltip reads `Module not connected`. The other locations are unchanged.
7. **Fail:** the controller flashes red (regression to old behavior), no overlay shown, or wrong icon.

### 5. Recovery from disconnected → up

1. From state 4, plug the controller back in.
2. Wait one poll cycle.
3. **Pass:** the location returns to UP visuals (no overlay on status, green check on modules) and the tooltip again shows `Firmware 1.2.0`.
4. **Fail:** stays in DOWN visual, or transitions through an unexpected intermediate state.

### 6. Mixed states across locations

1. Cause the body to be DOWN (unplug it) and the dome to be NEEDS_SYNCED (modify its config without syncing).
2. **Pass:** Status page shows body grey-static, dome yellow-pulse, core green (no overlay) simultaneously. Modules page shows the matching three icons.

### 7. Accessibility

1. With the modules page open, press `Tab` to focus the body location's status icon (within the header row).
2. **Pass:** focus indicator is visible on the icon, and a screen reader announces the same text shown in the tooltip (because we mirror the tooltip into `aria-label`).
3. Image alt text on the status page (`<img>` `alt` attribute) is descriptive — e.g., `Body Module disconnected` for DOWN, `Dome Module firmware out of date` for FIRMWARE_INCOMPATIBLE — verifiable via devtools or by toggling images off in the browser.

### 8. Dev-build version is accepted

1. Build firmware locally without a release tag — the version comes out as `1.2.0-dev.N`.
2. Flash and let it register + poll.
3. **Pass:** Modules page tooltip shows `Firmware 1.2.0-dev.N` and the icon is green (or yellow if config differs) — **not red**. Confirms `meetsMinimum` strips prerelease suffixes.
4. **Fail:** dev build is treated as incompatible (red exclamation).

## Notes

- The `body_grey.png` / `dome_grey.png` / `core_grey.png` assets are currently byte-identical to the red overlays as a placeholder. Visual differentiation is only correct once actual greyscale artwork replaces them.
- Phase 1 firmware does not include the version in `REGISTRATION_SYNC_ACK`; only `POLL_ACK` carries it. There is therefore a brief window after a controller registers but before its first poll arrives where the version is unknown — during that window the controller will appear DOWN (correct: not yet confirmed responsive).
