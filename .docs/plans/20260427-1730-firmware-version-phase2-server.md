# Firmware-version compatibility gating — Phase 2 (server + Vue)

## Context

AstrOs.Server has no way today to know what firmware version is running on each ESP32 controller. The status page and modules page render only two negative states — "needs sync" (yellow) and "down" (red, pulsing). "Down" conflates two very different problems: (a) the controller isn't talking to the server at all, and (b) the controller is talking but is running out-of-date firmware that may not understand new server features.

This is the server-side phase of a cross-repo feature. Phase 1 (in the AstrOs.ESP repo, branch `feature/firmware-version-report`) extends the `POLL_ACK` wire format with a firmware version field. Phase 2 (this plan) parses that field, hard-codes a minimum required version, and splits the current "down" visual into two distinct visual states:

| State                         | Status page                           | Modules page                  | Cause                                  |
| ----------------------------- | ------------------------------------- | ----------------------------- | -------------------------------------- |
| `UP`                          | (no overlay)                          | green check                   | connected, synced, firmware OK         |
| `NEEDS_SYNCED`                | yellow pulse                          | yellow warning                | connected, firmware OK, config stale   |
| `FIRMWARE_INCOMPATIBLE` *new* | **red pulse** (re-uses existing PNGs) | **red exclamation**           | connected, firmware older than minimum |
| `DOWN`                        | **grayed-out image** *(new asset)*    | **dark-grey question circle** | not communicating                      |

The intended outcome: an operator looking at the status or modules page can tell at a glance whether a controller is offline (likely a power/cable problem) or online but out-of-date (needs a firmware flash).

## Decisions (confirmed with user)

- **Persistence**: in-memory only. No DB migration. Firmware version lives on the in-memory controller state alongside connection status, recomputed on each POLL_ACK.
- **Initial values**: server `MINIMUM_FIRMWARE_VERSION = '1.2.0'` (matching the Phase 1 firmware bump). Older firmware that doesn't report a version will be treated as `FIRMWARE_INCOMPATIBLE`, which is the correct semantic.
- **UI**: tooltip on the modules-page icon shows the firmware version in all states (`Firmware X.Y.Z`, or `Firmware unknown`, or `Firmware X.Y.Z (minimum A.B.C required)` for incompatible).

## Wire-format expectation (set by Phase 1)

`POLL_ACK` payload: `mac<US>name<US>fingerprint<US>version`
`<US>` = `0x1F`.

The parser should still tolerate the legacy 3-field format (no version) so the server isn't strictly coupled to the firmware rollout order; legacy firmware will be classified as `FIRMWARE_INCOMPATIBLE`, which is accurate.

## Backend tasks

### B1. Hard-coded constants and semver compare

- [x] Create `astros_api/src/models/firmware_config.ts` with `MINIMUM_FIRMWARE_VERSION = '1.2.0'`.
- [x] Add a small semver compare util at `astros_api/src/semver.ts` exporting `compareVersions(a, b)` and `meetsMinimum(actual, minimum)`. Treat undefined / empty / malformed as below minimum. Plain `x.y.z` parsing — no dependency. **Strips prerelease suffix (`-dev.N`, `-RC.N`) so local dev builds count as meeting the minimum.** (Path is `src/semver.ts` at root, not `src/utilities/`, matching the existing flat layout.)
- [x] Unit test the util in `astros_api/src/semver.test.ts` — covers `1.1.9 < 1.2.0`, `1.2.0 == 1.2.0`, `1.10.0 > 1.2.0`, dev/RC suffixes accepted, undefined → false, empty → false, malformed → false.

### B2. Serial message parsing

- [x] Update `astros_api/src/serial/message_handler.ts:56–72` (`handlePollAck`) to accept either 3 or 4 `<US>`-delimited fields; set `module.firmwareVersion = parts[3]` when present.
- [x] Extend `astros_api/src/models/control_module/control_module.ts` with optional `firmwareVersion?: string`.
- [x] Add a unit test for `handlePollAck` covering both forms (and a 5-field-rejection negative test).

### B3. Status emission

- [x] Extend `astros_api/src/models/networking/status_response.ts` with `firmwareVersion?: string` and `firmwareCompatible: boolean`.
- [x] Update `astros_api/src/api_server.ts:569–604` (`handlePollResponse`) to compute `firmwareCompatible = meetsMinimum(...)` and emit both new fields. No DB writes.

## Frontend tasks

### F1. Enum and websocket reducer

- [ ] Add `FIRMWARE_INCOMPATIBLE = 'firmwareIncompatible'` to `astros_vue/src/enums/controllerStatus.ts`.
- [ ] Extend `astros_vue/src/models/websocket/locationStatus.ts` with the two new fields.
- [ ] Update `astros_vue/src/composables/useWebsocket.ts:124–150` to a 4-state collapse:
  ```ts
  let status = ControllerStatus.DOWN;
  if (data.up) {
    if (!data.firmwareCompatible) status = ControllerStatus.FIRMWARE_INCOMPATIBLE;
    else if (data.synced) status = ControllerStatus.UP;
    else status = ControllerStatus.NEEDS_SYNCED;
  }
  ```
  Order matters: firmware check beats sync check (a stale config on incompatible firmware should still show as incompatible).

### F2. Controller store

- [ ] Add `bodyFirmware`, `domeFirmware`, `coreFirmware` refs (`string | undefined`) to `astros_vue/src/stores/controller.ts` and write `data.firmwareVersion` into them in `handleStatusMessage`.
- [ ] Hard-code `MINIMUM_FIRMWARE_VERSION` in `astros_vue/src/constants/firmware.ts` with a comment pointing at `astros_api/src/models/firmware_config.ts` as the source of truth.

### F3. Status page visuals (`astros_vue/src/components/status/AstrosStatus.vue`)

- [ ] DOWN → `body_gray.png` / `dome_gray.png` / `core_gray.png` (new assets, see F6), **static, no `animate-pulse`**.
- [ ] FIRMWARE_INCOMPATIBLE → existing red overlays (`body.png`, `dome.png`, `core.png`), `animate-pulse`.
- [ ] NEEDS_SYNCED → existing yellow overlays, `animate-pulse`.
- [ ] State-specific i18n alt text on each `<img>`.

### F4. Modules page visuals (`astros_vue/src/views/ModulesView.vue`)

Body / core / dome header blocks (~lines 188+, 244+, dome equivalent). Replace the 3-state ternary with a per-state map:

| Status                  | Icon                  | Color             |
| ----------------------- | --------------------- | ----------------- |
| `UP`                    | `io-checkmark-circle` | `text-green-500`  |
| `NEEDS_SYNCED`          | `io-warning`          | `text-yellow-500` |
| `FIRMWARE_INCOMPATIBLE` | `io-warning`          | `text-red-500`    |
| `DOWN`                  | `io-help-circle`      | `text-gray-600`   |

- [ ] Verify the OhVueIcon name for the question-circle (fallback: `bi-question-circle`); register the icon if not already imported.
- [ ] Wrap with the DaisyUI tooltip pattern used in `system-status` (per recent `AstrosWriteButton` work, commits `f87ad06` / `61fa2f8`). Tooltip text per state (`modules.firmware.tooltip.ok`, `.incompatible`, `.disconnected`).
- [ ] Mirror tooltip text into `aria-label` on the icon for screen-reader accessibility.

### F5. i18n (`astros_vue/src/locales/enUS.json`)

- [ ] Add keys:
  ```json
  "modules.firmware.unknown": "unknown",
  "modules.firmware.tooltip.ok": "Firmware {version}",
  "modules.firmware.tooltip.incompatible": "Firmware {version} (minimum {minimum} required)",
  "modules.firmware.tooltip.disconnected": "Module not connected",
  "status.alt.up": "{location} module connected",
  "status.alt.needsSynced": "{location} module needs sync",
  "status.alt.firmwareIncompatible": "{location} module firmware out of date",
  "status.alt.down": "{location} module disconnected"
  ```
- [ ] No hardcoded user-facing strings in templates (per CLAUDE.md).

### F6. New image assets

- [ ] User to provide `body_gray.png`, `dome_gray.png`, `core_gray.png` in `astros_vue/src/assets/images/status/`.
- [ ] Sizing should match existing red overlays (~24KB / 15KB / 15KB).

## Verification

### Backend

- [ ] `npm run test` in `astros_api/` (covers semver util + handlePollAck both forms).
- [ ] `npm run build` in `astros_api/` (type-check passes).

### Frontend

- [ ] `npm run test:unit` in `astros_vue/`.
- [ ] `npm run build` in `astros_vue/`.
- [ ] `npm run lint` and `npm run prettier:write` in both packages before commit.

### End-to-end QA (manual; aligns with TDD-exception rule for UI / serial code)

- [ ] Add `astros_vue/.docs/qa/firmware-version-gating.md` covering:
  - **Preconditions**: ESP firmware 1.2.0 flashed, server running, controllers powered.
  - **Case 1 — happy path**: green check + tooltip `Firmware 1.2.0`.
  - **Case 2 — sync needed**: yellow pulse + yellow warning.
  - **Case 3 — firmware incompatible**: bump server min to `1.3.0` (or flash older firmware) → red pulse + red exclamation + tooltip `Firmware 1.2.0 (minimum 1.3.0 required)`.
  - **Case 4 — disconnected**: power off controller → gray static image + dark-grey `?` icon + tooltip `Module not connected`.
  - **Case 5 — recovery**: restore power → returns to UP after next poll.
  - **Case 6 — a11y**: keyboard focus on icon → aria-label announced; image alt text descriptive.

## Critical files reference

| Concern                         | File                                                     |
| ------------------------------- | -------------------------------------------------------- |
| Server POLL_ACK parser          | `astros_api/src/serial/message_handler.ts:56–72`         |
| Server poll-response handler    | `astros_api/src/api_server.ts:569–604`                   |
| Server controller model         | `astros_api/src/models/control_module/control_module.ts` |
| Server status websocket payload | `astros_api/src/models/networking/status_response.ts`    |
| Vue status enum                 | `astros_vue/src/enums/controllerStatus.ts`               |
| Vue websocket reducer           | `astros_vue/src/composables/useWebsocket.ts:124–150`     |
| Vue controller store            | `astros_vue/src/stores/controller.ts`                    |
| Status page component           | `astros_vue/src/components/status/AstrosStatus.vue`      |
| Modules page                    | `astros_vue/src/views/ModulesView.vue`                   |
| Status assets dir               | `astros_vue/src/assets/images/status/`                   |
| i18n source of truth            | `astros_vue/src/locales/enUS.json`                       |

## Out of scope

- Persisting firmware version in SQLite (decided in-memory only).
- A "firmware unknown" intermediate visual state (pre-1.2.0 firmware is genuinely incompatible; treating it as such is correct).
- An OTA flash flow from the server UI.
- Exposing `MINIMUM_FIRMWARE_VERSION` via an API endpoint (hard-coded mirror on Vue side acceptable).
- Phase 1 firmware changes — see `feature/firmware-version-report` branch in the AstrOs.ESP repo.
