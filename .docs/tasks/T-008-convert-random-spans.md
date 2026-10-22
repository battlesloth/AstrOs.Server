# T-008: Convert random spans to ESP commands 6 and 7

<!-- File: .docs/tasks/T-008-convert-random-spans.md. Branch: feature/T-008-convert-random-spans. PR title: "T-008: Convert random spans to ESP commands 6 and 7". -->

## Context

This is Phase A of the random span events project. See `PLAN.md` § Random span events, and the spec `.docs/specs/20261022-0748-random-span-events-design.md` § "Conversion" and § "Validation".

T-007 gave events an `endTime` and added the random payload types. This task makes `ScriptConverter` send a span to its controller as one command at the span's start. It also makes every controller's script last until the last span ends.

**The wire format is pinned in `.docs/protocol.md` § C.** The firmware side is AstrOs.ESP T-007 (parser) and T-009 (runtime).

**Why the converter skips a bad span instead of throwing:** a throw anywhere in `convertScript` returns an empty map, and the upload then overwrites every controller's script with `''`. That existing behavior is a Backlog item, not this task.

## Contract (pinned — do not change)

- **Wire strings, exactly as `.docs/protocol.md` § C:**
  - `6|<delta>|<uart.idx>|<channel>|<spanMs>|<minGapMs>|<maxGapMs>|<minPos>|<maxPos>|<minMove>|<maxMove or 0>|<speed>|<acceleration>`
  - `7|<delta>|<gpioChannel>|<spanMs>|<minGapMs>|<maxGapMs>`
  - For a digital Maestro span (`isServo: false`), the six fields after `maxGapMs` are each `0`.
- **`CommandType` gains `maestroRandom = 6` and `gpioRandom = 7`, appended.** Existing values are unchanged.
- **Point-event output is byte-identical to today.** No existing expected string in `script_converter.test.ts` changes.
- **Integer milliseconds** (amended 2026-10-22, after the AstrOs.ESP T-007 review). Seconds × 1000 is not exact in floating point: a 2.01 s gap becomes `2009.9999999999998`, and a 16.1 → 16.2 s span becomes `99.99999999999818`. The firmware rejects any non-integer field (§ C), so the time-derived values are rounded **once**, before validation and before emission:
  - `spanMs = Math.round(endMs − startMs)`
  - `minGapMs` and `maxGapMs` are `Math.round`ed

  Validation and the wire string both see the rounded values. No other field is rounded: positions, moves, speed and acceleration must already be integers.
- **The validation ranges match `.docs/protocol.md` § C:**
  - all spans:
    - every field that is sent is an integer (after the rounding above)
    - every index that is sent is ≥ 0: the Maestro payload's `channel`, the UART `idx`, and the GPIO channel number (amended 2026-10-22, matching the firmware's T-007 rejects). A Maestro `channel` still at its `-1` UI placeholder, never overwritten on save, would otherwise reach the controller and be silently dropped there.
    - `spanMs ≥ minGapMs`
    - `maxGapMs ≥ minGapMs`
    - `minGapMs ≥ 20`
  - servo only:
    - `minGapMs ≥ 100`
    - `0 ≤ minPos < maxPos ≤ 100`
    - `1 ≤ minMove ≤ (maxPos − minPos) / 2`
    - `maxMove` is null, or `minMove ≤ maxMove ≤ maxPos − minPos`
    - speed and acceleration are each `0–255`

## Task

### Validation

New file `astros_api/src/scripting/random_span_validation.ts`:

```ts
export function randomSpanProblems(
  spanMs: number,
  payload: RandomGpioEvent | RandomMaestroEvent,
  isServo: boolean,
): string[]
```

- It returns one human-readable problem per broken rule, or `[]` if the span is valid.
- Pass `isServo = false` for `RandomGpioEvent` and for digital Maestro spans.

### Converter: `astros_api/src/scripting/script_converter.ts`

- **`mapEventsByControllerAndTime`:** after `evt.time *= 1000`, also scale `evt.endTime` when it's non-null. Bucketing is still by start time.
- **`addBufferEvents`:** `maxDuration` becomes the max over every bucketed event of `endTime ?? time` (ms), not the max bucket key. The rest is unchanged. A location whose span ends last gets its end buffer at the span's end.
- **`convertScriptEvents`:** an event with `endTime !== null` goes to `convertRandomSpanEvent(evt, timeToSend): string` before the `moduleType` switch.
- **`convertRandomSpanEvent`:**
  - It computes `spanMs = Math.round(evt.endTime - evt.time)` (both already ms), and builds a copy of the payload with `minGapMs` and `maxGapMs` `Math.round`ed (Contract: integer milliseconds).
  - It looks up the GPIO channel (for `genericGpio`) or the UART values (for `maestro`).
  - It calls `randomSpanProblems` with the rounded `spanMs` and the rounded payload copy. The serializer receives the same values.
  - On a valid span it returns:
    - `randomGpioAsString(evt: RandomGpioEvent, gpioChannel: number, spanMs: number, next: number): string`, or
    - `randomMaestroAsString(evt: RandomMaestroEvent, uart: IUartValues, spanMs: number, next: number): string`
  - **On a missing lookup or any problem**, it `logger.warn`s `ScriptConverter: skipping random span <evt.id> on channel <evt.scriptChannel>: <problems joined>`. It then returns `noneAsString(next)`, i.e. `0|<next>|0;`, so the delay chain is unchanged.
  - A span on any other sub-type takes the same skip path.
  - It never throws.
- **Delta format:** `toMsStr` is used for every delta and span value.

### Tests

Write these first.

**`astros_api/src/scripting/random_span_validation.test.ts`** has one boundary pair per rule:

- `minMove at exactly half the range is valid; one more is rejected` (20–100, minMove 40 / 41)
- `maxMove equal to the range is valid; one more is rejected`
- `maxMove below minMove is rejected; null maxMove is valid`
- `servo minGapMs 100 valid / 99 rejected`
- `gpio minGapMs 20 valid / 19 rejected`
- `spanMs equal to minGapMs is valid; one less is rejected`
- `maxGapMs below minGapMs is rejected`
- `minPos equal to maxPos is rejected`
- `speed 256 is rejected`
- `a non-integer minPos is rejected`
- `a negative maestro channel is rejected` (`channel: -1`)
- `a non-integer gap is rejected for gpio spans too` (the integer rule covers all spans; the converter rounds before calling, so this is the validator's own guard)
- `digital maestro (isServo false) ignores the servo fields`

**`astros_api/src/scripting/script_converter.test.ts`:**

- `gpio random span`: a core GPIO channel with a span 2.0→16.0 s, gaps 50/400, and no other events.
  - Core → `0|2000|0;7|14000|<gpioCh>|14000|50|400;0|0|0`
  - Dome and body → `0|16000|0;0|0|0`
- `maestro random span`: a core Maestro servo channel with a span 0→14.0 s, `{ minGapMs: 400, maxGapMs: 2000, minPos: 20, maxPos: 100, minMove: 15, maxMove: 60, speed: 0, acceleration: 0 }`.
  - Core → `6|14000|<idx>|<ch>|14000|400|2000|20|100|15|60|0|0;0|0|0`
- `null maxMove is sent as 0`
- **Review focus:** `a 2.01 s gap is sent as 2010`: a core GPIO span 0→10.0 s with `minGapMs: 2.01 * 1000` (that is `2009.9999999999998`) and `maxGapMs: 3000`.
  - Core contains `7|10000|<gpioCh>|10000|2010|3000`, and no `.` appears anywhere in the string.
- **Review focus:** `a 16.1 → 16.2 s span with a 100 ms min gap is valid`: a core GPIO span 16.1→16.2 s with gaps 100/100.
  - Floating point gives `99.99999999999818` for the raw span, which would wrongly fail `spanMs ≥ minGapMs` before rounding.
  - Core → `0|16100|0;7|100|<gpioCh>|100|100|100;0|0|0`, and `logger.warn` is not called.
- `digital maestro span zeroes the servo fields`
- `a span's end extends every location's end buffer`: dome has a point at 5.0 s, and core has a span 0→20.0 s.
  - The dome string ends with a buffer at 20000: `...|15000|...;0|0|0`.
- **Review focus:** `an invalid span becomes a buffer that keeps the delay chain`. One core Maestro channel has an invalid span (minMove 45 on 20–100) alone at 4.0 → 9.0. A second core channel has GPIO points at 1.0 and 6.0.
  - Core is `0|1000|0;5|3000|…;0|2000|0;5|3000|…;0|0|0`. The span's slot becomes `0|2000|0`, and the end buffer is at 9000.
  - `logger.warn` was called once with the event id.
- **Review focus:** `an invalid span still extends the script to its end time`. The same fixture's end buffer is at 9000.
- **Review focus:** `a span whose gpio channel mapping is missing is skipped, not thrown`. The other locations still convert.
- **Review focus:** `a maestro span whose channel is still -1 is skipped`. Its slot becomes `0|<delta>|0`, `logger.warn` names the event id, and point events on the same location keep their deltas. The existing point-event path throws for `channel < 0`; the span path must skip, not throw.

## Acceptance criteria

- [ ] All tests above are green. Every pre-existing `script_converter.test.ts` expectation is unchanged.
- [ ] `randomSpanProblems` encodes exactly the § C ranges, each with a boundary test.
- [ ] No code path in `convertRandomSpanEvent` throws.
- [ ] `.docs/qa/random-span-events.md` gains a "Server conversion" section. It covers deploying a script whose span row was inserted by hand (SQL in the plan), and checking the API log for the exact command string.

## Out of scope

- The converter's existing throw → empty upload behavior for point events (Backlog).
- `MINIMUM_FIRMWARE_VERSION` (Phase C, after the AstrOs.ESP release).
- UI validation and creation (Phase B).
- The firmware parser and runtime (AstrOs.ESP T-007 and T-009).

## Verification

- `cd astros_api && npx vitest run src/scripting` → green. Then `npm run build` and the full `npx vitest run` → green.
- Manual check:
  1. On a dev DB copy, insert one GPIO span row with the SQL in the QA plan.
  2. Start the API with `npm run start:tsx`.
  3. Upload that script from the scripter's Test modal.
  4. The debug log of the `DEPLOY_SCRIPT` payload shows the `7|…` command, and the end buffer is at the span's end.
