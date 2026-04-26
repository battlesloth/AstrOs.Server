# Heads routines manual QA

Bench tests for the four head choreographies and the demo reel. Run after merging Phase B and before any droid-con demo.

## Preconditions

- Bench rig connected: master ESP32 with two-head rig (4 servos on the master maestro), padawan ESP32 reachable via ESP-NOW with the relay LED wired to GPIO ch0.
- AstrOs.Server stopped (so the serial port is free for the smoke-test cockpit).
- Smoke-test cockpit running: `cd astros_smoke_test && npm run web:dev`
- Browser at `http://localhost:5174`, port connected, padawan discovered (status pill shows the address).
- Optional: `SMOKE_LOG=server,state` for server-side debug visibility.

## Per-routine tests

For each of the four routines, click run from the cockpit. Verify:

1. **`heads-curious-duet`** (~12s)
   - Both heads pan left + glance slightly down, hold.
   - Both heads pan right + look fully up, hold.
   - Both heads return forward and level.
   - Heads turn to face each other (R looks left, L looks right). LED briefly flashes during eye contact.
   - Both heads dip and return (subtle nod).
   - Both face forward, then both look up; LED stays on solid for the look-up + hold.
   - All return home.
   - Cockpit transcript shows `runScript` ack, `let-script-play` wait, `scenario OK`.

2. **`heads-disagreement`** (~13s)
   - R-pan oscillates 4 times (no shake), L stays.
   - L-tilt does 4 small downward dips (yes nod), R stays.
   - Both pan left, hold.
   - R-pan whips back to right while L stays at left; LED flashes 4× rapidly.
   - Standoff hold (R-right, L-left).
   - L-pan slowly travels to right (~1.5s travel — visibly slower than other moves).
   - Both at right, LED solid for ~600ms.
   - Both face forward, settle home.

3. **`heads-hide-and-seek`** (~14s)
   - R hides — pans away (right) and dips slightly down.
   - L pans left, holds, pans right, holds (LED briefly flashes during the right pan as if checking under things).
   - L looks up at the sky.
   - R pops back up to forward + level; LED flashes ("found!").
   - L does a small startled jolt (tilts down then back up — fast).
   - Both face each other, then nod-laugh together with 4 LED twinkles.
   - Both face forward (LED solid 400ms), look up, settle home.

4. **`heads-sync-swim`** (~13s)
   - Both pan slowly left, hold, slowly right, hold, return forward.
   - Brief pause, then opposing sweep (R faces right, L faces left).
   - Counter-sweep inward — heads converge to face each other; LED flashes on convergence.
   - Both face forward, both look up under solid LED (~800ms), settle home.

## Reel test

5. **`heads-demo-reel`** (~52s total)
   - Click run; verify deploy phase shows 4 `deployScript` ack lines in transcript without errors.
   - All four routines play back-to-back. The handoff between routines should have a brief pause (~200ms scheduler skew padding) but nothing visibly stuck.
   - Cockpit transcript shows 4 `runScript` invocations interleaved with named waits (`curious-duet`, `disagreement`, `hide-and-seek`, `sync-swim`).
   - `scenario OK` at the end; total runtime should match the sum of routine durations + ~800ms padding.

## Edge cases

- **Determinism.** Run any routine twice in a row. Motion should be identical — no drift from prior state. (Each routine starts with `settleHome` to neutralize prior position.)
- **Panic mid-routine.** Start `heads-demo-reel`, click cockpit PANIC during track 2 (around the 18-20s mark). All four servos hold position immediately; the remaining tracks do not dispatch. Subsequent runs require a re-deploy (PANIC clears active state but doesn't redeploy scripts — they're still on SD).
- **Re-run after `format-and-sync`.** Run `format-and-sync`, then `heads-curious-duet`. The scenario's own `deployScript` step should redeploy the script (FORMAT_SD wiped firmware storage); confirm the deploy step succeeds rather than returning a stale-script error.
- **Disconnect mid-arrange.** Pull the master USB cable during a routine's deploy phase. Cockpit should surface a transport error and mark the run failed without crashing the server.

## Server-side log spot-checks

With `SMOKE_LOG=server`:
- A successful single routine produces one `scenario started` and one `scenario finished` log line.
- A successful reel produces one `scenario started` and one `scenario finished` for the reel itself (the inner `runScript` calls are step events, not scenario events).
- A panic mid-run produces `panic stop fired` plus `scenario threw` (the runner's panic-stop interrupts the awaited wait step).
