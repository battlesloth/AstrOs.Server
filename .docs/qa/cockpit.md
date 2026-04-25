# Cockpit manual QA

Tests for the smoke-test cockpit's UI behavior. Run before merging cockpit changes.

## Preconditions

- Smoke-test cockpit running: `cd astros_smoke_test && npm run web:dev`
- Browser at `http://localhost:5174`
- AstrOs.Server stopped (so the serial port is free if connection is exercised)
- Optional: `SMOKE_LOG=server` for server-side debug output

## Scenario severity rendering

1. **Badge colors and presence**
   - `format-and-sync`, `full-happy-path` → red `destructive` badge, name in orange
   - `panic-drill`, `servo-test-sweep` → yellow `caution` badge, name in amber
   - `config-only`, `sync-only`, `direct-command-sweep` → no badge, name in the same color as other unbadged controls

2. **Caution name color sanity check**
   - The destructive rule intentionally uses different shades for name and badge (warmer name vs. red badge) for contrast.
   - The caution rule uses the same amber for both name and badge.
   - **Pass:** the caution row's name reads clearly against the dark background and the matching name+badge does not look washed out.
   - **If fail:** file a follow-up to give caution its own slightly different name shade, matching the destructive asymmetry. Current values live in `astros_smoke_test/src/web/ui/components/ScenarioList.vue` (search for `.badge-caution` and `.scenario.caution`).

3. **Click behavior — safe scenarios**
   - Click `config-only`. The scenario fires immediately. No modal appears.
   - (If not connected, a 409 "Not connected" appears in the run-error banner — that's expected and not part of the badge test.)

4. **Click behavior — caution scenarios**
   - Click `servo-test-sweep`. The scenario fires immediately. No modal appears.
   - Same for `panic-drill`.
   - The yellow badge is the visual signal; no extra confirmation step.

5. **Click behavior — destructive scenarios**
   - Click `format-and-sync`. The destructive-confirmation modal appears with the scenario id and description.
   - Click Cancel. The modal dismisses; no run is attempted.
   - Click `format-and-sync` again, then Confirm. The run is attempted (will 409 if not connected).

6. **Direct API check**
   - With cockpit running, in a terminal:
     ```bash
     curl -X POST http://localhost:5174/api/run/format-and-sync -H 'Content-Type: application/json' -d '{}'
     ```
     Expected: HTTP 409 with body containing `"is destructive"`.
   - Same endpoint with `-d '{"confirm":true}'`: expected to either succeed (returning a `runId`) if connected, or 409 "Not connected" if not. Either way, the destructive guard does not refuse.
   - `curl -X POST http://localhost:5174/api/run/servo-test-sweep -d '{}'`: expected to either succeed or return "Not connected" — never the destructive 409.

## CLI severity behavior

The smoke-test CLI (`npm run smoke list`, `npm run smoke scenario <id>`) was updated in the same Phase A migration. The behavior changes mirror the cockpit:

1. **`npm run smoke list` output** — the plain-text listing now shows `[caution]` for caution scenarios and `[destructive]` for destructive ones (previously only `[destructive]`). Safe scenarios still have no tag.
2. **`--confirm` flag** — only required for `destructive` scenarios. `panic-drill` and `servo-test-sweep` no longer require `--confirm` to run from the CLI; they run directly. The `[caution]` tag in the list output is the only signal that a scenario will move hardware.
3. **JSON listing** — `npm run smoke list --json` returns `severity: 'safe' | 'caution' | 'destructive'` instead of the previous `requiresConfirmation: boolean`.

## Edge cases

- **Connection state changes mid-list-load.** Connect after the page loads. The scenarios remain visible and become clickable when `connected` flips true.
- **Active run blocks clicks.** While a run is in progress (`activeRunId` set in state), clicking any scenario is no-op (button disabled). Verify by starting `panic-drill` and immediately clicking `config-only` — the second click is ignored.
- **Browser refresh.** Refresh the page during a run. The scenario list re-loads from `/api/scenarios`; badges render correctly.
- **Unexpected serial-port close.** Connect to the bench, then physically unplug the USB cable (or otherwise force the OS to close the FD). The cockpit should: (a) surface a "Serial port closed unexpectedly" error in the run-error banner, (b) flip the connection pill back to disconnected, (c) re-enable the port picker and Connect button. Re-plugging the cable and clicking Connect should succeed without restarting the cockpit. **Server-side log check** (with `SMOKE_LOG=state`): you should see one `serial port closed unexpectedly` warn line, not a duplicate of the user-disconnect path.
