# Design: smoke-test "robot heads" demo routines

> **Note:** This is the design doc, not the implementation plan. The implementation plan will be written separately via `superpowers:writing-plans` and saved alongside this file.

## Context

The bench rig wires four servos into two mini "robot heads" attached to the master ESP32:

- **ch1 = right pan**, **ch4 = left pan** (both heads)
- **ch2 = right tilt**, **ch3 = left tilt** (both heads)

Pan is symmetric (~1000µs each side of home). Tilt is asymmetric — tilt-min has ~1000µs of range ("look up"), tilt-max has only ~150–200µs from home before the head frame collides with the servo's mounting stand. Convention: **tilt-min = up (dramatic), tilt-max = down (subtle accent only)**.

The smoke-test currently exercises servo motion via `servo-test-sweep` (live SERVO_TEST commands on a single channel) and full script-pipeline via `full-happy-path` (one DEPLOY_SCRIPT + RUN_SCRIPT cycle). Neither stresses the deploy-many + sequence-run path that the production AstrOs Playlist feature uses, and neither showcases the rig's expressive potential. We're adding both.

## Goals

1. **Demoable.** Four self-contained "playful" choreographies suitable for showing on the floor at droid con. Each independently triggerable from the cockpit's scenario list.
2. **Full-pipeline test of the script system.** Each routine deploys + runs a real timeline that the firmware scheduler plays back. Multi-controller (master servos + padawan LED).
3. **Mimics the production Playlist feature.** A `heads-demo-reel` scenario plays all four back-to-back by deploying all scripts up front then sequencing RUN_SCRIPT calls client-side — exactly how the API's `AnimationQueue` plays a Sequential `PlaylistType`.
4. **Reusable choreography vocabulary.** A `_heads-primitives` library so future demo routines can be authored by composing named beats rather than hand-rolling event strings.

## Non-goals

- Configurable per-routine parameters (tempo, beat duration). Hard-coded values are fine; if a beat needs tuning, edit the source.
- Generating ad-hoc choreography from prompts or external data. The four routines are static.
- Adding LSP-style timeline preview tooling.
- Using the maestro speed/accel parameters for smoothing. Servo motion uses default hardware speed; choreography is paced via `timeTillMs` between pulses, not per-pulse interpolation.
- Authoring a fifth bundled "panic-stop drill" within the heads namespace — `panic-drill` already covers that path.

## Choreography

Tilt convention: `tilt-min` = look up (large range, dramatic). `tilt-max` = look down (small range, only partial moves used — `TILT_DOWN_SUBTLE = 0.3` of the home→max delta). Pan convention: pan-min = both heads face left; pan-max = both heads face right.

### `heads-curious-duet` (~13s)

| t (ms) | Beat | Detail |
|---|---|---|
| 0 | Settle home | 500ms |
| 500 | Both pan left, slight glance down | R/L-pan→min; R/L-tilt 30% toward max. 1000ms |
| 1500 | Hold "what's that?" | 800ms |
| 2300 | Both pan right, look up | R/L-pan→max; R/L-tilt→min. 1000ms |
| 3300 | Hold "ooh!" | 800ms |
| 4100 | Both face forward, level | 800ms |
| 4900 | Pause | 500ms |
| 5400 | Make eye contact | R-pan→min, L-pan→max. 800ms |
| 6200 | Hold eye contact (LED flash 200ms at t=6500) | 800ms |
| 7000 | Both nod once | Tilts dip 30% + return. 1400ms |
| 8400 | Both face forward in unison | 700ms |
| 9100 | Both look up triumphantly (LED solid 800ms) | Tilts→min. 600ms |
| 9700 | Hold | 800ms |
| 10500 | Return all home | 800ms |
| 11300 | End buffer | 500ms |
| **Total** | | **11800ms** |

### `heads-disagreement` (~13s)

| t (ms) | Beat | Detail |
|---|---|---|
| 0 | Settle home | 500ms |
| 500 | R shakes "no" | R-pan: home→min→max→min→max→home, 4 swings. 2000ms |
| 2500 | Pause | 500ms |
| 3000 | L nods "yes" (subtle) | L-tilt: 4 small dips 30% toward max. 2000ms |
| 5000 | Pause | 500ms |
| 5500 | Both turn left | R/L-pan→min. 800ms |
| 6300 | Hold | 600ms |
| 6900 | Disagree mid-look (LED 4× 100ms flashes) | R-pan→max, L-pan stays at min. 1000ms |
| 7900 | Standoff | 800ms |
| 8700 | R wins, L reluctantly turns | L-pan: min→max slowly. 1500ms |
| 10200 | Both right, satisfied (LED solid 600ms) | 600ms |
| 10800 | Both face forward | 800ms |
| 11600 | Pause | 500ms |
| 12100 | Return home | 600ms |
| 12700 | End | 500ms |
| **Total** | | **13200ms** |

### `heads-hide-and-seek` (~14s)

| t (ms) | Beat | Detail |
|---|---|---|
| 0 | Settle home | 500ms |
| 500 | R "hides" | R-pan→max, R-tilt 30% toward max. 1200ms |
| 1700 | Hidden — hold | 800ms |
| 2500 | L searches — pans left | L-pan→min. 800ms |
| 3300 | "where'd they go?" | 600ms |
| 3900 | L pans right | L-pan→max. 1000ms |
| 4900 | "checking under things" (LED 200ms flash) | 600ms hold |
| 5500 | L looks up at sky | L-tilt→min. 600ms |
| 6100 | Scanning above | 600ms |
| 6700 | R pops up! (LED flash 200ms — "found!") | R-tilt→home, R-pan→home. 600ms |
| 7300 | L reacts — startled up | L-tilt jumps further toward min. 200ms |
| 7500 | "surprise!" | 800ms |
| 8300 | Both face each other | R-pan→min, L-pan→max. 800ms |
| 9100 | Both nod laughing (LED twinkles 4× 200ms) | Both tilts dip 30% + return × 2. 1500ms |
| 10600 | Both face forward (LED solid 400ms) | 800ms |
| 11400 | Both look up triumphant | Both tilts→min. 800ms |
| 12200 | Hold | 600ms |
| 12800 | Return home | 800ms |
| **Total** | | **13600ms** |

### `heads-sync-swim` (~13s)

The most "smoke-test-like" of the four — every channel exercised in both directions, both synchronized and opposing.

| t (ms) | Beat | Detail |
|---|---|---|
| 0 | Settle home | 500ms |
| 500 | Sync pan left | R/L-pan→min. 1500ms |
| 2000 | Hold | 500ms |
| 2500 | Sync pan right | R/L-pan→max. 1500ms |
| 4000 | Hold | 500ms |
| 4500 | Both forward | 800ms |
| 5300 | Pause | 300ms |
| 5600 | Counter-sweep outward | R-pan→max, L-pan→min. 1000ms |
| 6600 | Hold | 500ms |
| 7100 | Counter-sweep inward (LED 200ms flash on convergence at t=8200) | R-pan→min, L-pan→max. 1500ms |
| 8600 | Hold | 800ms |
| 9400 | Both face forward | 800ms |
| 10200 | Both look up in unison (LED solid 800ms) | Both tilts→min. 1000ms |
| 11200 | Hold | 800ms |
| 12000 | Return all home | 1000ms |
| **Total** | | **13000ms** |

### `heads-demo-reel`

Plays all four routines in order: curious-duet → disagreement → hide-and-seek → sync-swim. Total runtime ~52s. Sequenced via deploy-all-then-run-each (see "Reel mechanics" below).

## Architecture

### Primitives library

`astros_smoke_test/src/core/fixtures/scripts/_heads-primitives.ts` exports composable `Beat` building blocks. Core type:

```ts
interface Beat {
  master: string[];   // event strings for master controller
  padawan: string[];  // event strings for padawan controller
  durMs: number;      // beat duration; both timelines must sum to this
}
```

**Layer 1 — `pose(durMs, opts)`:** the foundation. Emits servo pulses for any subset of the four channels (`rPan`, `lPan`, `rTilt`, `lTilt`), then a closing buffer of `durMs`. Padawan timeline is `[makeBuffer(durMs)]`. Channels not specified retain their prior position.

**Layer 2 — named single-pose primitives** (each calls `pose()`):

- `settleHome(durMs)` — all four to home
- `bothPanLeft(durMs)` / `bothPanRight(durMs)` / `bothPanForward(durMs)`
- `bothLookUp(durMs)` / `bothLookLevel(durMs)`
- `meetEyes(durMs)` (R-pan→min, L-pan→max)
- `lookOutward(durMs)` (R-pan→max, L-pan→min)
- `hold(durMs)` — no servo motion, just a buffer

**Layer 3 — multi-phase primitives** (build their own pulse sequences):

- `bothNodSubtle(durMs, count)` — both tilts dip toward max + return; `count` repetitions; uses `TILT_DOWN_SUBTLE = 0.3` for safe-down position
- `rightShakeNo(durMs, count)` — R-pan oscillates min/max
- `leftNodYes(durMs, count)` — L-tilt subtle dips
- `withLedFlash(beat, schedule[])` — wraps a beat with GPIO toggles at specified offsets; replaces the padawan timeline with the flash sequence
- `withLedSolid(beat, atMs, durMs)` — single LED-on segment within a beat

**Tilt-down helper:**
```ts
const TILT_DOWN_SUBTLE = 0.3;
function tiltDownPos(servo: ServoConfig): number {
  return Math.round(servo.homePos + (servo.maxPos - servo.homePos) * TILT_DOWN_SUBTLE);
}
```

**Script builder:**
```ts
interface BuiltScript {
  upload: ScriptUpload;
  run: ScriptRun;
  scriptId: string;
  durationMs: number;
}

function buildScript(sync: ConfigSync, beats: Beat[], scriptId?: string): BuiltScript;
```

`buildScript` validates that each beat's master and padawan event durations match `beat.durMs` and throws if they don't — catches authoring errors at construction time.

### File layout

```
astros_smoke_test/src/core/
  fixtures/scripts/
    _heads-primitives.ts          ← NEW (Layer 1-3 + buildScript)
    _heads-primitives.test.ts     ← NEW
    heads-curious-duet.ts         ← NEW (beats + buildScript wrapper)
    heads-disagreement.ts         ← NEW
    heads-hide-and-seek.ts        ← NEW
    heads-sync-swim.ts            ← NEW
    multi-channel.ts              ← unchanged
    long-runner.ts                ← unchanged
  scenarios/
    heads-curious-duet.ts         ← NEW (single-script scenario)
    heads-disagreement.ts         ← NEW
    heads-hide-and-seek.ts        ← NEW
    heads-sync-swim.ts            ← NEW
    heads-demo-reel.ts            ← NEW (multi-script reel)
    index.ts                      ← MODIFIED (register five new scenarios)
    scenarios.test.ts             ← MODIFIED (assertions for new scenarios)
```

### Individual scenario shape

Each of the four single-routine scenarios:

```ts
export const headsCuriousDuet: ScenarioFactory = (session: SessionContext): Scenario => {
  const built = buildScript(session.configSync, curiousDuetBeats());
  return {
    id: 'heads-curious-duet',
    description: '...',
    requiresConfirmation: false,
    arrange: [
      registrationSync(),
      deployConfig(session.configSync),
      deployScript(built.upload),
    ],
    act: [
      runScript(built.run),
      waitStep(built.durationMs + 200, 'let-script-play'),
    ],
  };
};
```

The 200ms padding absorbs scheduler/wall-clock skew between the smoke-test side and firmware playback.

### Reel mechanics

`heads-demo-reel` mirrors the API's Sequential `PlaylistType`. Per the firmware's SD-backed script storage (capacity is hundreds of scripts), all four scripts deploy upfront in `arrange`; `act` then sequences RUN_SCRIPT calls with waits sized from each script's known duration.

```ts
export const headsDemoReel: ScenarioFactory = (session: SessionContext): Scenario => {
  const a = buildScript(session.configSync, curiousDuetBeats());
  const b = buildScript(session.configSync, disagreementBeats());
  const c = buildScript(session.configSync, hideAndSeekBeats());
  const d = buildScript(session.configSync, syncSwimBeats());
  return {
    id: 'heads-demo-reel',
    description: 'Plays all four head routines back-to-back, sequenced like a Sequential Playlist.',
    requiresConfirmation: false,
    arrange: [
      registrationSync(),
      deployConfig(session.configSync),
      deployScript(a.upload),
      deployScript(b.upload),
      deployScript(c.upload),
      deployScript(d.upload),
    ],
    act: [
      runScript(a.run), waitStep(a.durationMs + 200, 'curious-duet'),
      runScript(b.run), waitStep(b.durationMs + 200, 'disagreement'),
      runScript(c.run), waitStep(c.durationMs + 200, 'hide-and-seek'),
      runScript(d.run), waitStep(d.durationMs + 200, 'sync-swim'),
    ],
  };
};
```

`requiresConfirmation` is `false` for all five scenarios — they're additive servo demos, none destructive.

### Registry wiring

`scenarios/index.ts` registers all five new scenarios alongside the existing seven. The `scenarios` object grows from 7 entries to 12; `listScenarioIds()` reflects that automatically.

## Tests

### Unit tests (vitest)

`fixtures/scripts/_heads-primitives.test.ts`:

- `pose(1000, { rPan: 500 })` emits one R-pan pulse + buffer(1000); padawan = buffer(1000)
- `pose(1000, { rPan, lPan, rTilt, lTilt })` emits four pulses (timeTillMs=0 each) + buffer(1000)
- `bothPanLeft(800)` produces R-pan and L-pan pulses at `getServoConfig(1).minPos` and `getServoConfig(4).minPos` respectively
- `meetEyes(800)` produces R-pan at minPos AND L-pan at maxPos (verifies asymmetric direction)
- `bothLookUp(600)` produces tilts at `getServoConfig(2).minPos` and `getServoConfig(3).minPos` (the dramatic up direction, per bench geometry)
- `bothNodSubtle(1200, 2)` produces 8 servo pulses (down × 2 channels × 2 nods, up × 2 channels × 2 nods); buffers between sum to 1200ms
- `withLedFlash(pose(1000, {}), [{ atMs: 200, durMs: 100 }])` produces padawan timeline: buffer(200) + GPIO toggle(100ms) + buffer(700)
- `buildScript(sync, beats)` returns `durationMs` equal to `sum(beats.map(b => b.durMs))`
- `buildScript(sync, [malformedBeat])` throws when a beat's master/padawan event durations don't match `durMs`
- `tiltDownPos` is well-formed: returns home + 30% of (max - home), rounded

`scenarios/scenarios.test.ts` additions:

- `listScenarioIds()` includes all five new scenarios
- Each of `heads-curious-duet`, `heads-disagreement`, `heads-hide-and-seek`, `heads-sync-swim` has 3 arrange steps + 2 act steps with names `runScript` and `let-script-play` (or scenario-specific wait names)
- `heads-demo-reel` has 6 arrange steps (sync + config + 4 deployScript) + 8 act steps (4 runScript + 4 waitStep)
- `requiresConfirmation` is `false` for all five
- The four single-routine scripts use distinct `scriptId` values from the reel's deploys (no collision)

### Manual QA

`.docs/qa/heads-routines.md` checklist. Preconditions: bench rig connected (master + padawan), AstrOs.Server stopped, smoke-test cockpit running on `localhost:5174` with port held open; `SMOKE_LOG=transport,server` if anything misbehaves.

1. **Each individual routine** — for each of the four routines, click run from the cockpit. Verify timing matches the design table, all channels move as choreographed, LED accents fire at expected beats, no servo collisions with frame.
2. **`heads-demo-reel`** — verify all four play back-to-back with negligible inter-track gaps; cockpit transcript shows clean RUN_SCRIPT_ACK + scenario-finished events for each track; total runtime ≈ 52s.
3. **Determinism** — run a routine twice in a row; motion should be identical, no drift.
4. **Panic mid-routine** — start `heads-demo-reel`, click cockpit PANIC during track 2. All servos hold position immediately; remaining tracks are not dispatched.
5. **Re-run after `format-and-sync`** — run `format-and-sync`, then run `heads-curious-duet`. Confirm the redeploy step succeeds (firmware's prior deploy was wiped by FORMAT_SD; the scenario's own deployScript step replenishes).
6. **Disconnect mid-arrange** — disconnect the master USB cable mid-deploy. Confirm cockpit surfaces a transport error and the run is marked failed without process crash.

## Risks

- **Beat timing drift between author and firmware playback.** If the firmware scheduler runs slow under load, the smoke-test waits could end before the script finishes, leading to early next-track dispatch. Mitigation: 200ms padding per track in the reel. If observed drift exceeds 200ms, bump padding or compute padding as a percentage of script duration.
- **`buildScript` duration validation false positives.** If a primitive's master/padawan durations are misaligned by 1ms due to rounding (`Math.round` on `timeTillMs`), the validator could throw. Mitigation: validator uses an integer-millisecond tolerance of ±1 per beat.
- **Choreography looks janky on physical servos.** Default hardware speed varies between SG90/MG90/etc. If servos are visibly slow and overshoot beat boundaries, the sub-second beats (200–800ms) may need to be lengthened. Tuning is bench-only; no design changes needed if observed.

## Out of scope (future work)

- A "panic recovery" routine (return to home cleanly after a panic-stop drill).
- Speed/accel parameters on per-pulse for smoothing — the maestro supports them and `makeServoPulse` accepts them, but the choreography here doesn't need them.
- A web-side authoring UI for non-developer demo customization.
- Looped reel ("ShuffleWithRepeat" semantic) — Sequential is enough for droid con.
