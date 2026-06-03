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

- [x] Add `FIRMWARE_INCOMPATIBLE = 'firmwareIncompatible'` to `astros_vue/src/enums/controllerStatus.ts`.
- [x] Extend `astros_vue/src/models/websocket/locationStatus.ts` with the two new fields.
- [x] Update `astros_vue/src/composables/useWebsocket.ts:124–150` to a 4-state collapse. Order: firmware check beats sync check.

### F2. Controller store

- [x] Add `bodyFirmware`, `domeFirmware`, `coreFirmware` refs (`string | undefined`) to `astros_vue/src/stores/controller.ts` and write `data.firmwareVersion` into them in `handleStatusMessage`.
- [x] Hard-code `MINIMUM_FIRMWARE_VERSION` in `astros_vue/src/constants/firmware.ts` with a comment pointing at `astros_api/src/models/firmware_config.ts` as the source of truth.

### F3. Status page visuals (`astros_vue/src/components/status/AstrosStatus.vue`)

- [x] DOWN → `body_grey.png` / `dome_grey.png` / `core_grey.png`, **static, no `animate-pulse`**. (Asset filenames use British "grey" spelling, matching what the user provided.)
- [x] FIRMWARE_INCOMPATIBLE → existing red overlays (renamed to `body_red.png` / `dome_red.png` / `core_red.png` for clarity), `animate-pulse`.
- [x] NEEDS_SYNCED → existing yellow overlays, `animate-pulse`.
- [x] State-specific i18n alt text on each `<img>` via `statusPage.alt.*` keys (had to use `statusPage` namespace rather than `status` because `status` is already a top-level string).

### F4. Modules page visuals (`astros_vue/src/views/ModulesView.vue`)

Body / core / dome header blocks (~lines 188+, 244+, 308+). Replaced the 3-state ternary with a `statusIcon(status, firmware)` helper returning `{ name, colorClass, tooltip }`:

| Status                  | Icon                     | Color             |
| ----------------------- | ------------------------ | ----------------- |
| `UP`                    | `io-checkmark-circle`    | `text-green-500`  |
| `NEEDS_SYNCED`          | `io-warning`             | `text-yellow-500` |
| `FIRMWARE_INCOMPATIBLE` | `io-warning`             | `text-red-500`    |
| `DOWN`                  | `io-help-circle-outline` | `text-gray-600`   |

- [x] `IoHelpCircleOutline` was already registered in `main.ts` (used in `AstrosPlaylistEditor.vue`); no new icon registration needed.
- [x] Wrapped with DaisyUI `tooltip tooltip-left` + `data-tip`, matching the `AstrosWriteButton` pattern.
- [x] Mirrored tooltip text into `aria-label` on the icon for screen-reader accessibility.

### F5. i18n (`astros_vue/src/locales/enUS.json`)

- [x] Added `modules.firmware.*` (tooltip + unknown) and `statusPage.*` (alt text + base_alt). The status-page alt namespace had to be `statusPage` rather than `status` because `status` is already a top-level string used as a column header in `ScriptsView.vue`. Alt strings drop "module" since the location key (e.g., `module_view.body` = "Body Module") already includes the word.
- [x] No hardcoded user-facing strings in templates (per CLAUDE.md).

### F6. New image assets

- [x] User provided `body_grey.png`, `dome_grey.png`, `core_grey.png` (note: British "grey" spelling).
- [x] Existing red overlays renamed `body.png` → `body_red.png` (and similar for dome / core) for clarity.

## Verification

### Backend

- [x] `npm run test` in `astros_api/` (covers semver util + handlePollAck both forms). 258/258 passed.
- [x] `npm run build` in `astros_api/` (type-check passes).

### Frontend

- [x] `npm run test:unit` in `astros_vue/`. 24/24 passed.
- [x] `npm run build` in `astros_vue/`.
- [x] `npm run lint` and `npm run prettier:write` in both packages before commit.

### End-to-end QA (manual; aligns with TDD-exception rule for UI / serial code)

- [x] Added `.docs/qa/firmware-version-gating.md` (8 cases: happy path, needs-sync, firmware-incompatible, disconnected, recovery, mixed states, a11y, dev-build acceptance). Lives at the repo root `.docs/qa/`, matching the convention from `system-readonly-mode.md`, not under `astros_vue/`.

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
