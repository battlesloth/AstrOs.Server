# Per-channel servo release time — design

Status: approved by Jeff (2026-11-22); planned as AstrOs.Server T-012–T-015 and AstrOs.ESP T-010. Covers AstrOs.Server (API + Vue) and AstrOs.ESP (firmware).
Decisions marked **(Jeff)** came from Jeff in the brainstorming session. Decisions marked **(my call)** were made by the agent and are open to correction.

## Intent

**The problem: linear actuators are cut mid-stroke.** The firmware powers a Maestro servo channel off once it has been on for **max(5 s, modeled travel + 10 %)** after its last move (ESP T-005).
- The travel model only knows the Maestro's speed and acceleration settings.
- A linear actuator driven at speed 0 models as near-instant, so it always gets the 5 s floor, however long its real stroke takes.
- So a long stroke is cut after 5 s.

**The promise.** The v1.2.1 release notes said so and promised that "1.3 firmware will allow for channel independent timeout settings".

**The hold.** Jeff held the AstrOs.ESP v1.3.0 release (random spans, bench-passed 2026-11-22) until this lands, so 1.3.0 keeps that promise **(Jeff)**.

## Goals

- **Each Maestro servo channel has its own release time:** the minimum time the channel stays powered after a move.
  - The release comes at **max(release time, modeled travel + 10 %)**, so the travel model still wins for slow, speed-limited moves **(Jeff: option A)**.
  - The default is 5 s, today's behavior, so nothing changes until someone edits a channel.
- **The setting is edited on the Modules page**, in the Maestro channel's servo settings, and reaches the controller with the normal config sync.
- **No mix of server and firmware versions can wipe a controller's Maestro channels** (except the rollback case under Constraints, which is accepted and documented).
- **Ships in AstrOs.ESP v1.3.0** with random spans.

## Non-goals

- **A "never release" or hold-forever setting.** Jeff confirmed longer on-time is all the actuators need (option A over B).
- **Release times shorter than the travel model.** The setting is a floor, never a cap.
- **PCA9685 (I²C) servos.** The firmware's PCA9685 servo module is retired (`ServoModule.cpp.dep`); the server's `pwm_channel` model is untouched.
- **Gating anything but config sync.** Script upload and run to old firmware stay as they are: old firmware skips span commands and keeps their delay.
- **Changing panic.** Panic still powers servos off immediately.

## Anti-goals (would be a failure even if it technically works)

- **A sync that silently drops a controller's Maestro channels.** Sending an 8-field entry to 1.2.x firmware would do that (see Constraints).
- **A setting that silently doesn't apply on a 1.3.0 controller.** If the operator sets 15 s, a 1.3.0 board that synced gets 15 s; a board that can't take it is told so, not skipped quietly.
- **An existing droid behaving differently after the upgrade** before anyone edits a channel. Every channel defaults to 5 s, which is exactly T-005's behavior.

## Constraints (found while designing)

- **Firmware 1.2.x drops any Maestro channel entry that doesn't have exactly 7 fields.**
  - A channel entry is `id:enabled:isServo:minPos:maxPos:home:inverted`. `AstrOsFileUtils::parseServoConfig` requires `parts.size() == 7` and skips the entry otherwise.
  - The entry string is saved unchanged to the SD card (`/sdcard/maestro/<idx>.cfg`) and re-parsed at every boot and config reload.
- **Old firmware skips a config section with an unknown module type.** `saveModuleConfigs` falls to `default: break`, verified back to v1.2.0. This made approach 1 below possible.
- **The config fingerprint is a GUID the controller makes at each config set.** It is not a hash of the config string, so the format change doesn't force a resync by itself.
- **ESP-NOW config relay already splits and reassembles messages** (`generatePackets` / `PacketTracker`). The extra ~6 bytes per channel need no transport change.
- **The server keeps no per-controller firmware version today.** POLL_ACK carries it (`val.controller.firmwareVersion`), and it is used only for the status message's `firmwareCompatible` flag. `controllerVariantCache` (MAC → board variant) is the only POLL_ACK cache.
- **`MINIMUM_FIRMWARE_VERSION` is advisory today.** It turns a controller red on the Modules page (`FIRMWARE_INCOMPATIBLE`), but sync still sends it config.
- **Rollback hazard (accepted, my call; Jeff approved the approach that carries it).**
  - Once a 1.3.0 controller has synced, its SD card holds 8-field entries. Rolled back to 1.2.x by OTA, it drops every Maestro channel at boot.
  - The server then refuses to sync it, because it is below the minimum, until it is reflashed to 1.3.0.
  - The v1.3.0 release notes must say so.
- **`1.3.0-dev` builds made before the parser change pass the gate (accepted, my call, from the builder check).**
  - `AstrOs.ESP/VERSION` is already 1.3.0, and `meetsMinimum` counts `1.3.0-dev.N` as 1.3.0.
  - A board running a develop build from before ESP step 2 (the bench master and padawan run 71e556a today) would take 8-field entries and drop its Maestro channels. Reflashing a parser build recovers it, because the SD file holds the 8-field string.
  - Exposure is dev builds only: no 1.3.0 RC or release exists, and the first RC is cut after the parser lands.
  - Handled as a bench precondition: flash a build with the parser change before syncing against a gated server.

## Approaches

1. **A separate config section per Maestro module.**
   - Format: `<new type>@<maestroIdx>@<ch>:<releaseMs>|…`. Old firmware skips it, and new firmware stores it in its own file.
   - Safe in every version mix with no version checks.
   - Cost: a channel's settings live in two strings and two files, and it adds a config-only section number.
2. **An 8th field, sent only to controllers whose reported firmware understands it.**
   - Cleanest format.
   - Cost: version-aware config generation, and a controller whose version isn't known yet silently gets 7 fields.
3. **An 8th field, always sent, with config sync refused below 1.3.0 — picked (Jeff).**
   - Jeff's refinement of the option first ruled out, "always send 8 fields and raise the minimum": the gate removes its flaw, which was that the server only flagged old firmware and still synced it.
   - One format, no version-aware generation. A board that can't take the field gets no config at all, with a reason shown.
   - Cost: the rollback hazard above. Also, a 1.2.x padawan can't receive *any* config change until it is flashed, which is the gate's purpose.

## Behavior

### Release rule (firmware)

- **Deadline:** `deadline = max(releaseMs, travel + ceil(travel × 10 %))`, where `travel = WorstCaseTravelMs(speed, accel)` as today. Only the floor term changes: from the constant `MAESTRO_RELEASE_FLOOR_MS = 5000` to the channel's `releaseMs`.
- **Every move path gets it**, because they all end in `CheckServos`: scripted moves, the servo-test slider, homing at boot and reload, and random-span moves.
- **Digital (`isServo = false`) channels are never released**, as today, and ignore the field.
- **Panic is unchanged.**

### The setting (server and UI)

- **Units and range (my call):**
  - Seconds, with one decimal, 1.0–120.0.
  - Stored and sent as whole milliseconds (`Math.round(s × 1000)`, 1000–120000).
  - Default 5.0 s.
- **Shown only for servo channels.** It's hidden when the channel is set to digital, and the stored value is kept.
- **Help text (my call, wording to the builder):** the minimum time the servo stays powered after each move, where slower moves stay on for their travel time.

## Wire format (to be pinned in `.docs/protocol.md`, both repos)

`protocol.md` doesn't document the config sync string today. Pin it as a new section, § D "Module config (`DEPLOY_CONFIG`)" **(my call)**.

- **The string:** `GPIO@…;MAESTRO@<idx>:<uartChannel>:<baud>@<entry>|<entry>|…` (one `MAESTRO` section per Maestro module).
- **The entry:** `id:enabled:isServo:minPos:maxPos:home:inverted:releaseMs`.
  - `releaseMs` is a whole number of ms.
  - The server sends 1000–120000.
- **Firmware ≥ 1.3.0 accepts 7 or more fields.**
  - 7 fields: `releaseMs = 5000`.
  - An 8th field that isn't a whole number in 1000–120000: the channel is **kept** with `releaseMs = 5000`, and the board logs a warning. A bad optional field must not delete a channel **(my call)**.
  - Fields after the 8th are ignored, and the channel is kept **(my call, from the builder check)**. This is so a future per-channel field can't wipe channels on a 1.3.0 board, the way an 8th field would on 1.2.x. A future field still needs the server to gate on firmware version, so the new setting isn't silently ignored.
- **Firmware < 1.3.0 accepts only 7 fields.** The server never sends it config (the sync gate below).

## Server (astros_api + astros_vue)

### Data model

- **Migration naming comes first (Jeff: new prefix, no renames).** Kysely sorts migration names as plain text, in both 0.27.6 and the latest 0.29.9 (`#resolveMigrations` ignores `nameComparator`), so a `10_…` name would sort before `1_…`. That was the PLAN.md Backlog item "Decide before migration 10".
  - Migrations from 10 on take a prefix that sorts after `9_…` as plain text: `m010_<name>`, `m011_<name>`, and so on. Lowercase letters sort after digits and `_`.
  - Existing names and `kysely_migration` rows are untouched.
  - A prerequisite server task teaches the scheme to:
    - `compareMigrationNames` (`dal/backup.ts`), which orders pending migrations and names backups
    - the T-006 newer-database guard
    - `database.integration.test.ts` (its `ORDER BY name DESC` and the injected `9_…` test migrations)
  - It proves, on a database migrated to 9 and on a fresh one, that a test-range `m9NN_` sample runs last.
  - Ruled out:
    - a Kysely upgrade (it sorts the same way)
    - `allowUnorderedMigrations`: on a fresh install the new migration would run before migration 6, which copies `maestro_channels` with `SELECT *` into a rebuilt table, so the extra column would break migration 6
    - renaming every migration (a one-time data rewrite on every install)
- **Migration `m010_add_maestro_release_ms`:** `maestro_channels.release_ms integer not null default 5000`.
  - Existing rows get 5000.
  - It lands behind the T-006 newer-database guard like any migration.
- **Threaded through the API:**
  - `dal/types.ts`
  - the API `MaestroChannel` model (`models/control_module/uart/sub_modules/maestro/maestro_channel.ts`)
  - the `uart_repository.ts` insert, upsert (`excluded.release_ms`) and select
- **Threaded through the Vue side:** `models/controllers/modules/uart/subModules/maestro/maestroChannel.ts` gains `releaseMs`. New channels default to 5000.
- **Save validation:** a `releaseMs` that isn't a whole number in 1000–120000 is refused with a 400 and the reason. The builder picks the layer, as the scripts save does for spans.

### Config generation

- **`serial/message_generator.ts`** appends `:releaseMs` to every Maestro channel entry.
- **No per-controller branching.** The gate decides who receives config at all.

### Sync gate

- **A firmware version cache.** `ApiServer` keeps `MAC → firmwareVersion`, filled on every POLL_ACK next to `controllerVariantCache`. Skip empty versions, as the variant cache does.
  - The master reports the sentinel MAC `00:00:00:00:00:00` on POLL_ACK.
  - The builder confirms the cache key matches the address `syncControllerConfig` sees for the master's location.
- **`syncControllerConfig` filters `toSync`.** A controller is synced only if its cached version is known and `meetsMinimum(version, MINIMUM_FIRMWARE_VERSION)`.
  - `meetsMinimum` already accepts `1.3.0-dev.N` and RC builds, so bench boards on develop firmware pass.
- **Skipped controllers come back in the Sync request's HTTP reply (Jeff).** The skip is decided while handling the request, before anything reaches the serial worker.
  - Today no per-controller config-sync result reaches the browser. The Modules page shows "sync successful" whenever the reply's `message` is `success`.
  - The "Controller sync failed:" toast in `stores/controller.ts` belongs to *registration* sync, not this.
- **Contract (additive):** `GET /api/locations/syncconfig` (`api_server.ts` routes it to `syncControllerConfig`; Vue calls it as `SYNC_CONFIG`) keeps `200` and `message: 'success'` when it was accepted.
  - It adds `skipped: [{ location, controllerName, reason, firmwareVersion?, minimum }]`, where `location` is the location's name (`'body'`, `'core'`, `'dome'`), as the WebSocket messages use it.
  - `reason` is a code: `firmware_below_minimum` or `firmware_version_unknown`. The server sends codes, not English (CLAUDE.md i18n rule).
- **Vue (`ModulesView.vue` `syncModuleSettings`):**
  - If some controllers were skipped, the success toast says the others were sent, and each skipped controller gets a warning toast, e.g. "Dome: firmware 1.2.2 is older than 1.3.0, update its firmware first", or "Dome isn't reporting a firmware version yet, try again in a few seconds".
  - If every controller was skipped, there's one error toast instead.
  - Texts come from i18n keys per reason code.
- **If every controller is skipped, no `DEPLOY_CONFIG` is sent.**
- **Out of scope:** per-controller ACK, NAK and timeout feedback for config sync, which is missing today (Backlog).
- **`MINIMUM_FIRMWARE_VERSION` rises to `1.3.0`** in `models/firmware_config.ts` and the Vue mirror `constants/firmware.ts`.
  - This absorbs the random-span design's planned bump (its "Firmware version gate" and Phase C step 4), which moves into this project.
  - 1.2.x boards then show red `FIRMWARE_INCOMPATIBLE` on the Modules page, with the existing tooltip naming the minimum.

### UI

- **A field in the Maestro channel's servo settings** (`AstrosMaestroChannel.vue` / `components/modules/shared/AstrosServoSettings.vue`).
  - Label "Release after (s)", or the builder's wording.
  - A number input, 1.0–120.0, step 0.1, with the help text.
  - Servo channels only.
- **If `AstrosServoSettings` is shared with the PCA9685 channel UI**, the field must not appear there. A prop or a Maestro-only placement are both fine.
- **i18n keys in `enUS.json`; the input has a `<label>`;** the out-of-range message uses the form's existing error pattern.

## Firmware (AstrOs.ESP)

- **`servo_channel`** (`lib_native/AstrOsUtility/src/AstrOsStructs.h`) gains `int releaseMs`. It defaults to 5000 wherever a channel is default-constructed.
- **`AstrOsFileUtils::parseServoConfig`:** accept 7 or 8 fields with the rules in Wire format. The max-id pass and the parse pass must agree on what counts as a valid entry.
- **`ServoReleaseDeadlineMs(speed, accel)` → `ServoReleaseDeadlineMs(speed, accel, floorMs)`** in the pure `AstrOsServoUtils`.
  - `MAESTRO_RELEASE_FLOOR_MS` becomes the default (`MAESTRO_RELEASE_DEFAULT_MS = 5000`, naming to the builder). Add constants for the accepted range.
  - `CheckServos` passes `channels[i].releaseMs`.
- **`LoadConfig` already copies parsed channels as whole structs**, so a reload applies a new value. A channel mid-release keeps accumulating against the new deadline, which is fine (my call).
- **No `VERSION` change:** develop is already at 1.3.0.
- **Native tests:**
  - 7 fields, 8 fields, and a bad 8th field (kept, 5000)
  - an entry with 9 fields (kept, the 9th ignored)
  - an entry with 6 fields (still dropped, as today)
  - the deadline with the floor above and below the travel model
  - the default constant

## Compatibility

| Server | Firmware | Result |
|---|---|---|
| old (no setting) | 1.2.x | unchanged |
| old | 1.3.0 | 7 fields → every channel 5 s, today's behavior |
| new | 1.3.0 (or `1.3.0-dev`/RC) | 8 fields → per-channel release |
| new | 1.2.x | sync refused for that controller (a warning toast with the reason, from the Sync reply); it shows red on the Modules page; the rest of the droid syncs |
| new | version not reported yet | sync refused with "try again"; polling fills the cache within seconds of the controller coming up |
| new | `1.3.0-dev` built before the parser change | passes the gate and drops its Maestro channels (accepted: dev builds only; flash a parser build first) |
| any | 1.3.0 synced, then rolled back to 1.2.x | Maestro channels gone at boot, sync refused, reflash 1.3.0 (accepted; release notes) |

**Upgrade path, for the release notes:** update the server → flash 1.3.0 over OTA (that needs no config sync) → sync config.

## Testing and QA

- **ESP native:** the tests under Firmware.
- **ESP bench** (`.docs/qa/maestro-servo-release.md`, new cases):
  - a channel set to 15 s releases ~15 s after its last move
  - a default channel still releases at 5 s
  - a speed-limited move whose travel exceeds the setting releases at the travel deadline
  - a board flashed from 1.2.x with 7-field SD files boots and keeps its channels before its first sync
  - the same on a padawan
  - a hand-made bad 8th field keeps the channel at 5 s with the warning
- **Server unit tests:**
  - the migration default
  - the repository round-trip
  - the generator emits 8 fields
  - the version cache (empty versions skipped)
  - the gate: below minimum skipped with its reason code in the reply's `skipped`, unknown version skipped, a dev build accepted, all skipped → no `DEPLOY_CONFIG`
  - save validation
  - the migration naming task: a test-range `m9NN_` sample runs last on a database migrated to 9 and on a fresh one; the newer-database guard and backup naming order it after `9_`
- **Vue tests:**
  - the field shows only for servo channels, with the seconds ↔ ms conversion and the range error
  - the Sync toasts for some skipped and for all skipped
- **Server QA plans:**
  - `.docs/qa/firmware-version-gating.md` gains the sync-gate cases. Its preconditions name minimum 1.2.0 today; update them.
  - The Modules page plan (or a new `maestro-channel-release.md`) covers the field.

## Sequencing (my call)

1. **Pin § D** in `.docs/protocol.md`, both repos.
2. **ESP: parser + per-channel deadline** (native tests). This is what holds v1.3.0. It runs in parallel with step 3.
3. **Server:**
   1. the migration naming scheme (prerequisite)
   2. the data model and `m010_` migration
   3. the generator (8 fields), version cache, sync gate with the `skipped` reply and Vue toasts, and the minimum raised to 1.3.0

   The gate must merge no later than the generator change, so develop never sends 8 fields ungated.
4. **Joint bench:** the server branch or develop with step 3, plus firmware with step 2 (flash it before the first sync; see Constraints); run the ESP bench cases.
5. **ESP v1.3.0 release** (random spans + per-channel release), with release notes covering the setting, the upgrade order and the rollback hazard.
6. **Server: the UI field.** It can start once step 3's model lands; the bench can set `release_ms` by SQL until then.
7. **Server release** whenever the server's own work is ready. It requires ESP 1.3.0 to be published first, because the gate refuses everything older.

**Random spans continue alongside:** server T-010 and Phase B don't touch this project's files. The random-span Phase C keeps only its end-to-end bench QA.

`superpowers:writing-plans` turns this into task files: server tasks in `.docs/tasks/` (next ID T-012), firmware tasks in AstrOs.ESP `.docs/tasks/` (next ID T-010), plus a `PLAN.md` project section in each repo.

## Backlog notes (found during design, not in scope)

- **The 2026-09 per-channel release Backlog item was never written.** T-001's Log claims it was, and the T-001/T-005 task files still point at it. This project replaces it; the close-out should note that.
- **Config sync has no per-controller result in the UI.** ACK, NAK and timeout never reach the browser, and `DEPLOY_CONFIG_NAK` has no handling. Only this project's gate skips do. A WebSocket result message would close that.
- **The PLAN.md Backlog's "Decide before migration 10" item** is resolved by this project (new prefix). Strike it at the naming task's close-out.

## Left to the builder

- Naming: the constants, the `releaseMs` field, the migration's name after the `m010_` prefix, i18n keys, the label wording.
- Which layer holds the save validation.
- The exact shape of each `skipped` entry, within the fields listed (additive).
- Whether the "Turning off servo" log line includes the deadline.
- Where the UI field sits, within the servo-only and Maestro-only rules.
