# T-014: Send release times, and refuse config sync to firmware older than 1.3.0

<!-- File: .docs/tasks/T-014-config-sync-gate.md. Branch: feature/T-014-config-sync-gate. PR title: "T-014: Send release times, and refuse config sync to firmware older than 1.3.0". -->

## Context

- **Spec:** `.docs/specs/20261122-0847-per-channel-servo-release-design.md`, § Wire format, § Sync gate, § Compatibility.
- **Project:** PLAN.md § Per-channel servo release time.
- **Needs** T-013 (`releaseMs` on `MaestroChannel`).

**Why the gate.** Firmware 1.2.x drops any Maestro channel entry that doesn't have exactly 7 fields, and the entry string is saved to its SD card unchanged. So the server must never send the 8-field form to it.

**Jeff's decision (2026-11-22):** always send 8 fields, and refuse config sync to any controller below `MINIMUM_FIRMWARE_VERSION`, now 1.3.0.

**Why both land here:** the gate and the 8th field ship in this one task, so develop never sends 8 fields ungated.

**Today's gaps:**
- `MINIMUM_FIRMWARE_VERSION` only colors the Modules page.
- No per-controller config-sync result reaches the browser: the Sync button toasts "Controllers sync queued!" whenever the reply says `success`.

## Contract (pinned — do not change)

**Wire format.** `.docs/protocol.md` § D: each Maestro channel entry is `id:enabled:isServo:minPos:maxPos:home:inverted:releaseMs`.

**Minimum version.** `FirmwareConfig.MINIMUM_FIRMWARE_VERSION = '1.3.0'` (`models/firmware_config.ts`) and the Vue mirror `MINIMUM_FIRMWARE_VERSION = '1.3.0'` (`constants/firmware.ts`). `meetsMinimum` (`utility/semver.ts`) is unchanged; it accepts `1.3.0-dev.N` and RC builds.

**Reply of `GET /api/locations/syncconfig`** (additive):

```ts
{ message: 'success', skipped: SkippedController[] }   // skipped: [] when none

interface SkippedController {
  location: string;          // ControllerLocation.locationName: 'body' | 'core' | 'dome' (the WS convention)
  controllerName: string;    // ControllerLocation.controller.name
  reason: 'firmware_below_minimum' | 'firmware_version_unknown';
  firmwareVersion?: string;  // present for firmware_below_minimum
  minimum: string;           // MINIMUM_FIRMWARE_VERSION
}
```

- **All skipped:** when every controller is skipped, no `DEPLOY_CONFIG` is posted to the serial worker.
- **Error replies:** unchanged.

**Gate.** A new pure `partitionConfigSync(locations: ControllerLocation[], versions: ReadonlyMap<string, string>, minimum: string): { toSync: ControllerLocation[]; skipped: SkippedController[] }` in `src/serial/config_sync_gate.ts`, keyed by `controller.address`.

**Version cache.** `ApiServer` keeps `MAC → firmwareVersion`, set in `handlePollResponse` beside `controllerVariantCache`, skipping empty versions. The master reports the sentinel MAC `00:00:00:00:00:00` on POLL_ACK. Confirm that the body location's `controller.address` is the same value, and pin it with a test.

**Vue `syncModuleSettings`** (`views/ModulesView.vue`):

| Result | Toasts |
|---|---|
| none skipped | the existing success toast |
| some skipped | a success toast saying the rest were sent (`module_view.sync_partial`), plus one warning toast per skipped controller |
| all skipped | one error toast (`module_view.sync_all_skipped`) and no success toast |

The warning keys are `module_view.sync_skipped_below_minimum` (`{controller}`, `{version}`, `{minimum}`) and `module_view.sync_skipped_version_unknown` (`{controller}`). The texts live in `enUS.json`, following the spec's examples.

## Task

- **`serial/message_generator.ts`:** append `:releaseMs` to every Maestro channel entry.
- **Gate and version cache** per the Contract.
- **`syncControllerConfig`:**
  - run the gate over `toSync`
  - post `DEPLOY_CONFIG` only for `toSync`, and only if it isn't empty
  - reply with `skipped`
  - log each skip at `info`, with location, controller, version and reason
- **Minimum:** raise both constants.
- **Vue:** the toasts and i18n keys.
- **QA plan `.docs/qa/firmware-version-gating.md`:**
  - preconditions say minimum 1.3.0, with bench firmware ≥ 1.3.0 that contains ESP T-010
  - new cases:
    - sync with one controller on 1.2.x: a warning toast, the others synced, that controller stays red
    - sync right after an API restart, before the first poll: "try again", and a second sync seconds later goes through
    - every controller below the minimum: an error toast, and no `DEPLOY_CONFIG` in the API log
  - the existing 1.2.0-era cases are updated to the new minimum

## Acceptance criteria

- [ ] `message_generator.test.ts`: every Maestro entry has 8 fields, and a channel with `releaseMs` 15000 ends `…:15000`.
- [ ] `config_sync_gate.test.ts` covers:
  - below the minimum (`1.2.2`): skipped as `firmware_below_minimum`, with the version
  - no cache entry: skipped as `firmware_version_unknown`
  - `1.3.0`, `1.3.0-dev.5` and `1.3.0-RC.1`: synced
  - the master's sentinel-MAC entry gates the body location
- [ ] The API test for `syncControllerConfig`:
  - all skipped → no `postMessage` of `DEPLOY_CONFIG`, and `skipped` in the reply
  - mixed → `DEPLOY_CONFIG` carries only the synced locations
  - Mutation check: drop the gate call and see it fail.
- [ ] The version cache test: a poll sets the entry; an empty version doesn't overwrite a known one.
- [ ] The Vue spec `views/__tests__/ModulesView.sync.spec.ts` covers the three toast outcomes.
- [ ] Both minimum constants read `1.3.0`.
- [ ] The QA plan is updated.

## Out of scope

- Per-controller ACK, NAK and timeout feedback for config sync (Backlog).
- Gating script upload or run.
- The UI field (T-015).
- A firmware capability flag in POLL_ACK (the spec accepts that `1.3.0-dev` builds made before ESP T-010 pass the gate).

## Verification

- `cd astros_api && npx vitest run`; `npm run prettier:write && npm run lint:fix`; `npm run build`.
- `cd astros_vue && npx vitest run`; `npm run format && npm run lint`; `npm run build`.
- **Bench (joint with ESP T-010):** flash every controller with an ESP T-010 build before the first sync (spec § Constraints).
  - A sync sends 8-field entries; the master log's `DEPLOY_CONFIG` shows `…:5000`.
  - A channel with `release_ms` set to 15000 by SQL arrives as `…:15000`.
  - Flash one padawan with 1.2.2 (or fake an old version in the cache): its sync is refused with the warning toast, the others sync, and its SD config is untouched.
- QA walk with Jeff: `firmware-version-gating.md`, the new cases.

## Implementation checklist

<!-- Added when work starts. -->
