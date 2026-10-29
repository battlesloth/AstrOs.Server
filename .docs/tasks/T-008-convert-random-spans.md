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
  - For a digital Maestro span (`isServo: false`), the six fields after `maxGapMs` are each `0`. (Amended 2026-10-27, Jeff: `isServo` here is the Maestro channel's current setting, not the payload's; see the Converter amendments.)
- **`CommandType` gains `maestroRandom = 6` and `gpioRandom = 7`, appended.** Existing values are unchanged.
- **Point-event output is byte-identical to today.** No existing expected string in `script_converter.test.ts` changes. (Amended 2026-10-29, Jeff: GPIO point events are the one exception. A script built in the Vue scripter produces no output for them today; see the GPIO lookup amendment. After this task they convert. Every point event that converts today is unchanged.) (Clarified 2026-10-29, pre-push review, wording only: the 2026-10-27 amendment's skipped Maestro point without a numeric `position` is a second exception; "no output" means the whole script converts to an empty map; and for malformed rows, a non-finite start no longer reaches other locations' end buffers, per the `addBufferEvents` amendment.)
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
- **`addBufferEvents`:** `maxDuration` becomes the max over every bucketed event of `endTime ?? time` (ms), not the max bucket key. (Amended 2026-10-29, pre-push review: for malformed rows, a non-finite start is ignored, and a non-finite end or one before the start counts as the start, so one bad row can't poison or shorten every location's end buffer.) The rest is unchanged. A location whose span ends last gets its end buffer at the span's end.
- **`convertScriptEvents`:** an event with `endTime !== null` goes to `convertRandomSpanEvent(evt, timeToSend): string` before the `moduleType` switch. (Note 2026-10-27, T-007 type review: `getScript` always returns `null` or a number, but API test fixtures are not type-checked, so one that omits `endTime` would take the span path with `undefined`; prefer `!= null` here and in `mapEventsByControllerAndTime`.)
- **`convertRandomSpanEvent`:**
  - It computes `spanMs = Math.round(evt.endTime - evt.time)` (both already ms), and builds a copy of the payload with `minGapMs` and `maxGapMs` `Math.round`ed (Contract: integer milliseconds).
  - It looks up the GPIO channel (for `genericGpio`) or the UART values (for `maestro`).
  - It calls `randomSpanProblems` with the rounded `spanMs` and the rounded payload copy. The serializer receives the same values.
  - On a valid span it returns:
    - `randomGpioAsString(evt: RandomGpioEvent, gpioChannel: number, spanMs: number, next: number): string`, or
    - `randomMaestroAsString(evt: RandomMaestroEvent, uart: IUartValues, spanMs: number, next: number): string`
  - **On a missing lookup or any problem**, it `logger.warn`s `ScriptConverter: skipping random span <evt.id> on channel <evt.scriptChannel> in script <scriptId>: <problems joined>`. (Amended 2026-10-29, pre-push review: `in script <scriptId>` added, as the spec's § Validation requires the warning to name the script.) It then returns `noneAsString(next)`, i.e. `0|<next>|0;`, so the delay chain is unchanged.
  - A span on any other sub-type takes the same skip path. (Amended 2026-10-27, Jeff, during T-007: the repository refuses to save such a span and drops one it finds on load with a warning, so `getScript` never hands one to the converter. This skip stays as defense in depth; a converter test can only reach it with a hand-built `ScriptEvent`.)
  - It never throws.
- **Delta format:** `toMsStr` is used for every delta and span value.
- **Amendments (Jeff, 2026-10-27, from the T-007 type review):**
  - **Servo vs digital comes from the channel.** For a Maestro span, the `isServo` that `randomSpanProblems` receives and that picks the wire fields is the script channel's `moduleChannel` (`MaestroChannel.isServo`, which `getScript` loads from the module tables), not the payload's copy. A span whose payload says servo on a channel now configured as digital converts as digital, and the reverse is validated as servo (missing servo fields fail validation and take the skip path). `IUartValues` has no servo flag, so this needs a lookup by script channel alongside `getUartValues`. T-009 also overwrites the payload's copy on save.
  - **A Maestro point without a numeric `position` is skipped, not sent.** In `convertMaestroEvent`, a point whose `position` is not a finite number (for example a point that carries a `RandomMaestroEvent` payload) is not serialized: `logger.warn` names the event id and channel, and its slot becomes the same `0|<next>|0;` no-op a skipped span uses, so the delay chain is unchanged. Today it is sent as `…|undefined|…`, which aborts the firmware's `std::stoi` and reboots the controller. A valid point's output is byte-identical (Contract). The existing throws in `convertMaestroEvent` (invalid channel, missing UART) are unchanged (Out of scope).
- **Amendment (Jeff, 2026-10-29, at T-008 start): GPIO lookup by the channel's `moduleChannelId`.**
  - **What's broken:** `getGpioChannelMap()` maps a GPIO channel's own id (`gpio_channels.id`, the script channel's `moduleChannelId`) to its channel number. `convertGpioEvent` looks it up by `evt.scriptChannel`, the script channel's id. The Vue scripter has given script channels a fresh `uuid()` since 2025-12-30 (`a00e0c4f`), so the lookup always misses. `convertGpioEvent` then throws, and the whole script converts to an empty map. A probe with a real in-memory DB, `ScriptRepository` and `ScriptConverter` confirmed it: one GPIO point event at 2.0 s gave `[]`.
  - **The fix:** `mapEventsByControllerAndTime` records each script channel by its id, next to `scriptChannelModuleMap`. The Maestro servo/digital amendment needs this lookup too. GPIO spans and GPIO points both look up the existing enabled-only `getGpioChannelMap()` by that channel's `moduleChannelId`. A missing entry still throws on the point path (unchanged, Out of scope). On the span path it still takes the skip.
  - **Test fixtures:** every GPIO script channel in `script_converter.test.ts` has an id different from its GPIO channel's id, and the mocked `getGpioChannelMap` is keyed by the GPIO channel id, as the repository keys it. A mock keyed by the script channel id would pass against the broken lookup.

### Tests

Write these first. (Renamed in the pre-push review, same assertions plus the missing halves: `maxMove below minMove is rejected; null maxMove is valid` became `maxMove equal to minMove is valid; below it is rejected` and `a null or missing maxMove is valid`; `speed 256 is rejected` became `speed outside 0–255 is rejected`; `a non-integer gap is rejected for gpio spans too` became `a non-integer gap or span length is rejected for gpio spans too`.)

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
- **Review focus:** `a maestro span follows the channel's servo/digital setting, not the payload's` (amended 2026-10-27): a servo payload (`isServo: true`, position fields set) on a Maestro channel configured digital sends the digital form, with the six fields after `maxGapMs` each `0`.
- **Review focus:** `a maestro point without a numeric position is skipped` (amended 2026-10-27): a core Maestro point whose payload is a `RandomMaestroEvent` (no `position`) and a GPIO point after it. The Maestro slot becomes `0|<delta>|0`, `logger.warn` names the event id, and the GPIO point keeps its delta.
- **Review focus:** `a maestro span whose channel is still -1 is skipped`. Its slot becomes `0|<delta>|0`, `logger.warn` names the event id, and point events on the same location keep their deltas. The existing point-event path throws for `channel < 0`; the span path must skip, not throw.
- **Review focus:** `a gpio point event converts by its channel's moduleChannelId` (amended 2026-10-29): a core GPIO point at 2.0 s with `setHigh: true`, on a script channel whose id differs from its GPIO channel's id.
  - Core → `0|2000|0;5|0|<gpioCh>|1`. Today this conversion throws and the result is an empty map.

## Acceptance criteria

- [ ] All tests above are green. Every pre-existing `script_converter.test.ts` expectation is unchanged.
- [ ] `randomSpanProblems` encodes exactly the § C ranges, each with a boundary test.
- [ ] No code path in `convertRandomSpanEvent` throws.
- [ ] A Maestro span is converted by its channel's current servo/digital setting, and a Maestro point without a numeric `position` is skipped with a warning (amendments 2026-10-27).
- [ ] GPIO points and GPIO spans look up their channel number by the script channel's `moduleChannelId` (amendment 2026-10-29).
- [ ] `.docs/qa/random-span-events.md` gains a "Server conversion" section. It covers deploying a script whose span row was inserted by hand (SQL in the plan), and reading the exact command strings with the QA plan's converter printer. (Amended 2026-10-29: no debug line reaches the log, PLAN.md Backlog; the API log is checked for the skip warning.)

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
  4. The debug log of the `DEPLOY_SCRIPT` payload shows the `7|…` command, and the end buffer is at the span's end. (Amended 2026-10-29: no debug line reaches the log, since pino's targets default to `info` (PLAN.md Backlog). Read the strings with the QA plan's converter printer, and check the API log for no skip warning.)

## Implementation checklist

- [x] RED/GREEN: `randomSpanProblems` in `random_span_validation.ts`, with one boundary pair per § C rule (`random_span_validation.test.ts`; 19 tests at first, 27 after the reviews). Beyond the task's list, every bound has a pair: `minPos` −1/0, `maxPos` 100/101, `minMove` 0/1, `acceleration` 255/256, `speed` −1, a non-integer `maxMove`, and a non-integer `spanMs`. RED ran against a no-op stub: 17 failed; the 2 passes were the all-valid cases
- [x] RED/GREEN: GPIO point lookup by `moduleChannelId` (amendment 2026-10-29). `mapEventsByControllerAndTime` records `scriptChannelMap`; `getGpioChannelNumber` resolves through it; the map field is renamed `gpioChannelNumberMap`, since the old name `scriptChannerlGpioChannelMap` encoded the wrong key. RED: the core entry was `undefined` (the conversion threw)
- [x] RED/GREEN: `CommandType.maestroRandom` / `gpioRandom`, the end time scaled to ms (`!= null`), the end buffer at the latest event start or finite span end, and `convertRandomSpanEvent` → `randomSpanCommand` with `randomGpioAsString` / `randomMaestroAsString` / `noneAsString`. Maestro `isServo` comes from `getMaestroIsServo` (the script channel's `MaestroChannel`). The converter adds the integer `≥ 0` problems for the UART `idx` and the GPIO channel number. The Maestro copy names every wire field, so a payload missing `channel` fails validation instead of sending `undefined`. RED: 19 failed; spans went down the point path (`5|0|5|0`, `1|0|3|4|undefined|0|0`)
- [x] RED/GREEN: skip a Maestro point that has no numeric `position` (amendment 2026-10-27), placed after the existing throws so they are unchanged
- [x] Tests beyond the task's list (all mutation-backed): speed/acceleration on the wire, a GPIO max gap and both Maestro gaps rounded, a negative GPIO channel number, a negative UART idx, no UART module, no `MaestroChannel` on the script channel, a span on a serial channel, a digital payload on a servo channel, a payload without `channel`, and an event without an `endTime` key converting as a point
- [x] Mutation checks: the validator had 17 mutants, all killed (one needed a type-valid form: the global setup runs `tsc`, so a mutant that breaks narrowing errors out instead of running). The converter had 23, all killed: end-time scaling, max-duration source, span routing, `!==` vs `!=` in both places, the explicit Maestro copy, `isServo` from the payload (validator and copy), each rounding site (spanMs, GPIO min/max, Maestro min/max), both `≥ 0` index checks, the position check, digital zeroing, `maxMove ?? 0`, speed/acceleration order, the skip delta, the GPIO lookup key, the non-Maestro guard, and a throw on the skip path. The first run left 3 rounding sites alive (GPIO max gap, Maestro gaps); the two rounding tests above were added for them
- [x] Test files type-check under a scratch tsconfig (the API tsconfig excludes `*.test.ts`)
- [x] QA plan: `.docs/qa/random-span-events.md` § Server conversion (cases 8–10, with a converter printer, since no debug line reaches the log) plus the edge-case list
- [x] Code review, round 1 (2026-10-29). No Critical findings. One Important: a span whose payload is `null` threw TypeError, emptying every controller's upload, and a raw `PUT` with `"event": null` reaches it. Fixed with a payload guard at the top of `randomSpanCommand`; the new test covers `null` and a string payload. Minors fixed:
  - the end buffer uses `max(time, finite endTime)`, so a NaN, Infinity or backwards end can't poison or shorten the buffers (tests: end before start, NaN, Infinity);
  - the index checks also require integers (tests: GPIO channel 2.5, UART idx 1.5);
  - the validator fails closed when `isServo` comes with a payload lacking the Maestro fields;
  - a test pins the payload's `channel` on the wire (it differs from the module channel's number);
  - `oneProblemNaming` anchors to the start of the message;
  - `MAX_SPEED` → `MAX_MOTION`;
  - the stale `RandomMaestroEvent` comment, fixed in both the API and Vue copies;
  - the QA intro and PLAN.md ("a GPIO span sets the pin low"; before T-008 a GPIO span made the whole conversion throw);
  - the QA placeholders now name the script channel id;
  - new `script_converter.integration.test.ts` runs a real in-memory DB through `upsertScript` → `getScript` → `convertScript`. It pins the GPIO map keying, `getScript`'s `MaestroChannel`, and the save's `-1` → channel number overwrite.
  
  Mutation-checked (9, all killed): the null guard, both end-buffer changes, both integer checks, the validator fail-open, the payload channel, and two integration mutants (the old GPIO key; the Maestro lookup missing). Declined #4: `Math.round` coerces `"50"` gaps to 50, but the wire value is still a valid integer the firmware accepts. (T-009 checks `endTime` and the sub-type, not payload field types, so the converter stays the only gate.) #15 checked: all 164 Maestro rows in the dev DB store integer `position`, `speed` and `acceleration`, so the strict position guard skips nothing that converts today. To the Backlog: the int32 upper bound (#3) and the Maestro point speed/acceleration guard (#14)
- [x] Pre-commit: prettier + lint (both sub-projects; the Vue model comment changed; API at its 11 pre-existing warnings, none in `src/scripting`), the test files type-checked, both builds, full suites (API 80 files / 1152 tests, Vue 54 / 780 + 1 todo)
- [x] Manual check (Verification, 2026-10-29, a scratchpad copy of `.data/database.sqlite3` at `8_`): boot logged the pre-migration backup and migration 9. With core GPIO 0 enabled, `T-008 QA` was saved through `PUT /api/scripts/` (core GPIO point at 1.0 s; body Maestro servo channel `left Pan`, ch 4, UART module idx 1), then the case 8 span rows were inserted by SQL. `GET /api/scripts/upload` answered success with no skip warning. The upload's converter, run against the copy, printed `core: 0|1000|0;5|1000|0|1;7|14000|0|14000|50|400;0|0|0`, `body: 6|16000|1|4|14000|400|2000|20|100|15|60|0|0;0|0|0`, `dome: 0|16000|0;0|0|0`. The case 9 bad span logged `ScriptConverter: skipping random span qa-t008-bad-span on channel t008-gpio-ch: minGapMs 10 is below 20` through the upload route, became `0|1000|0`, and moved every end to 19000. Case 10 (channel set digital) printed the six zeros. (The warning above predates the pre-push `in script` change; re-running the case 9 printer on the same copy afterwards logged `ScriptConverter: skipping random span qa-t008-bad-span on channel t008-gpio-ch in script sT008QAcheck: minGapMs 10 is below 20` with the same three strings.) Deviation from Verification step 4: no debug line reaches the log (pino targets default to `info`; PLAN.md Backlog), so the `DEPLOY_SCRIPT` payload can't be read there; the strings came from the converter printer instead
- [x] Pre-push: `/pr-review-toolkit:review-pr` (5 agents, 2026-10-29, full diff vs `origin/develop`); findings addressed. No Critical. Findings:
  - **Tests (2 rated critical by the analyzer, Important by the code reviewer).** 15 of the analyzer's 20 mutants survived. Every type-7 test had `delta == spanMs`, so swapping them survived, and no span shared a start time with another event, so `continue` → `break` and the group delta on every command survived. Also: a digital span was never checked against the servo-only rules, and several validator boundary halves were missing. The round-1 fail-closed validator change had also made this checklist's "explicit Maestro copy" kill vacuous: the only no-channel test used a servo channel, so a spread copy survived on digital channels. Added tests: span followed by point, two spans at one time, a span (valid and skipped) sharing a point's start, a digital span with only gaps and a 20 ms floor, a digital span with no `channel`, `maxMove == minMove`, a missing `maxMove`, an odd range, `acceleration −1`, non-integer `maxPos` / `minMove` / `speed` / `acceleration` / `channel`, and the full warning format. Integration: a disabled GPIO channel, a digital channel stored in the DB, and a board with its own id. Re-run and killed, 21 in all: 14 of the analyzer's 15 survivors (not the position-guard ordering one, which would pin out-of-scope throw behavior), its integration-only M3 at unit level, the type reviewer's spread copy, and 5 new-code mutants (the `try/catch` one in a type-valid form)
  - **"Never throws" was input-by-input.** A JSON field like `{"toString":1,"valueOf":1}` threw in `Math.round` and interpolation, emptying the upload. `convertRandomSpanEvent` now catches anything from `randomSpanCommand` and takes the skip path (test: an unprintable gap and an unprintable `minPos`)
  - **Regression:** a `NaN` start time on any event made `Math.max` return `NaN` for every end buffer (the old `>` comparison ignored it). Non-finite starts are now skipped in the end-buffer max (test)
  - The skip warnings name the script (spec § Validation). A span on a disabled GPIO channel says `GPIO channel <n> (<id>) is disabled`, not "no GPIO channel found". The unit and integration tests mock `logger.warn`, so fixtures no longer write warnings into the real API log (16 had)
  - Type design: `CommandType` has explicit values (they match the Contract and `AstrOsEnums.h`); `scriptChannelMap` is `private readonly`; the validator docstring states its `channel`-key rule and that § C sets no upper bound on the time fields or indices
  - Doc drift fixed: comments in the converter, validator and tests (including the misaligned type-6 layout labels); both `RandomMaestroEvent` comments; a clarification note after the Contract amendment (the Maestro point exception; Jeff's text left as written); the QA acceptance criterion and Verification step 4 (the printer replaces the debug log); the end-buffer and warn-format amendments; the QA plan (restart note, UART idx wording, case 9 `duration_ds` and log line, edge cases); the spec (`isServo` is a copy; the end-buffer difference on malformed rows); PLAN.md (status, the T-008 line, a removed Phase B note)
  - Jeff's calls (2026-10-29): a skipped span being invisible to the user becomes T-010, before Phase B; protocol § C's "first command in a same-time group carries the delta" is fixed to "last" in both repos now (Server: this branch; AstrOs.ESP: branch `docs/protocol-delta-carrier`, commit `246b4f7`; § C diffed identical). To the Backlog: non-finite event times on the point path; `uploadScript`'s log line has no id; the int32 item now covers deltas and end buffers; the Maestro point guard should bound position to int32 too; Phase B type-design notes
  - Not taken: making the rest of the converter's new methods private (the class's existing members are public; only the new map changed); a discriminated result type for `randomSpanCommand` (private, one caller; the type reviewer rated the current shape sound)
- [x] QA walk with Jeff (2026-10-29, `.docs/qa/random-span-events.md` on `/tmp/astros-span-upgrade`, a fresh copy of `.data/database.sqlite3` at `8_`). Case 1 (log side): the backup, then migration 9, then 0 spans. Case 2: both diffs empty. Case 8: Jeff built `T-008 QA` in the scripter (core `QA gpio` point at 1.0 s; body servo `Right Tilt`, ch 2, UART idx 1); the printer gave the plan's three strings exactly (`core: 0|1000|0;5|1000|0|1;7|14000|0|14000|50|400;0|0|0`, `body: 6|16000|1|2|…`, `dome: 0|16000|0;0|0|0`), and the upload reported success with no skip or exception line. Case 9: the upload reported success and logged `ScriptConverter: skipping random span qa-t008-bad-span on channel 5053043d-… in script s1793310QqE: minGapMs 10 is below 20`; the printer gave `…;7|16000|0|14000|50|400;0|1000|0;0|0|0` and every end at 19000. Case 10: the digital channel printed the six zeros. Bench cases wait for AstrOs.ESP T-009
