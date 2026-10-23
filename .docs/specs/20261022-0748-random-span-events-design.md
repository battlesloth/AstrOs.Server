# Random span events — design

Status: draft for Jeff's review (2026-10-22). Covers AstrOs.Server (API + scripter) and AstrOs.ESP (firmware).
Decisions marked **(Jeff)** came from Jeff in the brainstorming session; decisions marked **(my call)** were made by the agent and are open to correction.

## Intent

A user asked for scripted random behavior. The goal is idle "life" for the droid:

- dome panels flapping open and shut
- holo projectors twitching
- a light blinking irregularly, like a short circuit

Today this means hand-placing dozens of point events, and they play the same way every run. Instead, the user places **one random event** on a channel, covering a start → end time, and the ESP improvises inside that span. **The randomness happens on the ESP at run time (Jeff)**, so no two runs match. The server only sends the parameters.

## Goals

1. A random span event on **GPIO** channels and **servo** channels, with these parameters:
   - start time and end time
   - min time and max time between changes, **both required (Jeff)**
   - for servos only: min and max position, a required min move % and an optional max move % **(Jeff)**, plus speed and acceleration
2. The scripter draws the event as a **bar across its whole span (Jeff)**, using the "labelled bar" look (mockup option A).
3. **No other event on that channel can be placed inside the span (Jeff).**
4. Dragging the bar's body moves the span without resizing it. Dragging an edge lengthens or shortens the span in that direction **(Jeff)**.
5. Script duration, multi-controller timing and playlists all respect the span's end time.

## Non-goals

- **PCA9685 servos.** They are not scriptable on either side today (no converter case, no firmware path). "Servo" here means a Maestro channel configured as a servo.
- **Other channel types.** I2C, generic serial, Kangaroo and HCR/audio do not get random events.
- **A "run until stopped" mode.** Idle loops come from a script containing spans, played by a repeating playlist.
- **Random speed or acceleration.** These are fixed per span (my call).
- **Separate on and off timing for GPIO.** One gap range covers both states (my call; Jeff accepted).
- **An automatic end-of-span state.** The channel is left where the random left it. To land in a known state, place a normal event at the span's end time (my call; Jeff accepted).
- **Random events from the channel Test button.** The Test dialog stays Single-only (my call).
- **Previewing the real pattern in the UI.** It can't be previewed, because the ESP picks it at run time.
- **Interrupting a running script.** That behavior is unchanged. See the PLAN.md Backlog item "Preemptive interrupt".

## Anti-goals (would be a failure even if it technically works)

- Randomness baked in by the server at deploy time, so the "random" pattern repeats every run.
- A random span sharing time with another event on the same channel, by any path.
- A servo that sits stuck at a limit, or that makes moves smaller than the min move.
- A script whose other events shift in time because of a random span. This includes deployment to older firmware.

## Behavior

### Common to every random span

- **Start and end times** use the same 0.1 s resolution as other event times.
- **The first change happens at the span's start (my call).**
- **Gap between changes:** each gap is a random value between min time and max time. Both are required, and max ≥ min.
  - Gaps are entered in seconds with 0.01 s steps, because the ESP's timing step is 10 ms (my call).
  - Floors: **0.02 s for GPIO** (fast enough for a convincing flicker) and **0.1 s for servos** (my call).
- **Minimum span length:** at least the span's min time between changes (my call). Shortening the span by drag stops there.
- **Span end:** no change is issued at or after the end time. The channel stays in its last state.
- **Panic** immediately stops every active span on every controller.
  - Existing panic behavior is otherwise unchanged. Servo channels are turned off. ESP GPIO and Maestro digital channels are left as they are.
- **Manual commands mid-span** don't end the span (my call). This covers the scripter's channel Test (`RUN_COMMAND`) and the Modules-view servo slider (`SERVO_TEST`). The span keeps running, so its next change overrides the manual move. Panic is the way to stop spans. Both tools are setup aids, and wiring a span-table cancel into them isn't worth the extra firmware paths.
- **Span end vs. an event at the end time:** the end-time event must win. The random task must not issue a change that lands after the dispatch loop has run the end-time event, even with 10 ms dispatch granularity. Passing the dispatch tick in the hand-off message is the suggested way.
- **Randomness source:** each controller draws its own numbers from the ESP hardware RNG (`esp_random()`; ESP-NOW keeps Wi-Fi up, so it is truly random). There is no shared seed and no coordination between channels or controllers.

### GPIO random span

- Each change **flips** the output.
- Applies to:
  - ESP GPIO channels (`GpioChannel`, wire type 5 today)
  - Maestro channels configured as digital outputs (`isServo = false`), which toggle between the existing 500 µs and 2500 µs low/high values

  The existing GPIO dialog already handles both kinds of channel.

### Servo random span (Maestro servo channel)

**Parameters**

- **Min position and max position:** 0–100 %, as a percent of the channel's configured µs range. The firmware applies inversion, the same way as for a normal servo event.
- **Min move % (required):** the smallest allowed move.
- **Max move % (optional):** the largest allowed move.
- **Speed and acceleration:** 0–255 in Maestro units, fixed for the whole span. These are the same fields as the servo event.

**Each move**, where `p` is the current position, `lo`/`hi` are the span's min/max position, and `m`/`M` are the min/max move:

1. **Direction.**
   - If `p ≤ lo + m`, the move goes **up** **(Jeff)**.
   - If `p ≥ hi − m`, the move goes **down** **(Jeff)**.
   - Otherwise the direction is random.
2. **Size.**
   - The size is a random value between `m` and `M`. If max move is blank, the upper bound is the room left in the chosen direction (my call).
   - Sizes are drawn evenly over that range. Small draws are not rounded up to `m`, so moves don't pile up at exactly the min. The result is the same as Jeff's "push it out to the min" description (my call).
3. **Clamp.** If `p ± size` passes `lo` or `hi`, the move stops at that limit **(Jeff)**.

   The validation rule below guarantees that the chosen direction always has at least `m` of room. Clamping therefore only trims the part of a move above the min, and every move is at least `m`.
4. **Gap.** The wait before the next move is the **larger of** two values **(Jeff: option A)**:
   - the random gap draw (between min time and max time)
   - the estimated travel time for this move

   This way the servo arrives before it is redirected, so the physical move matches the commanded one. Without it, a slow speed plus short gaps would cut moves short of `m`.
   - The travel estimate runs the firmware's Maestro speed/acceleration model, the one behind `WorstCaseTravelMs(speed, acceleration)` in `AstrOsServoUtils.hpp`, at this move's distance in µs (`MoveTravelMs`). It is not a linear share of the full-range time: with acceleration, a short move that never reaches the speed cap takes time that grows with √distance. (Amended 2026-10-22, from AstrOs.ESP T-008's review; the linear share underestimated a 200 µs move at accel 5 by about 4×.)
   - Speed `0` (unlimited) is already modelled there as the fastest cap, so it still gets a small travel floor.
   - GPIO gaps are never stretched.

**Where the current position comes from**

- `p` is the last position the ESP commanded for that channel. It is converted from the Maestro module's stored µs back to an un-inverted percent of the channel range.
- If the channel has not moved since boot, `p` is its home position (my call).
- **If `p` is outside `[lo, hi]` when the span starts** (for example, at home 0 % with a 20–100 % span), the first move goes to a uniformly random position inside `[lo, hi]` and ignores the min move. The rule above applies from the second move on (my call).

### Validation (scripter dialog)

These rules keep the random behavior well defined. They are enforced in the dialog, with inline errors and Save disabled.

- `0 ≤ start < end ≤ 600` s. `end − start ≥ min time`.
- `min time ≥ floor` (0.02 s GPIO / 0.1 s servo). `max time ≥ min time`.
- **Servo only:**
  - `0 ≤ min position < max position ≤ 100`.
  - `1 ≤ min move ≤ (max position − min position) / 2`. This is what lets the direction rule always find room **(Jeff: "sane validations")**.
  - `min move ≤ max move ≤ max position − min position` when max move is set.
  - Speed and acceleration are each `0–255`.
- The span must not contain another event on the channel (see Overlap rule).

**Defensive checks outside the dialog (my call):**

- **Firmware:** rejects a malformed or out-of-range random command, logs it and skips it. The rest of the script keeps its timing.
- **Server:** adds no new save-time validator, consistent with today's trust model.
- **Converter:** **skips just the invalid span**. It does not throw. It logs a warning that names the script, channel and event id. The skipped span's end time still counts toward duration and the end buffer, so the rest of the script keeps its timing. This matches the firmware's skip-and-continue (my call).
  - The converter's existing throw paths are out of scope. `convertScript` turns a throw into an empty map, and the upload then sends `''` to every controller and returns 200. See Backlog notes.

## Scripter (Vue + PixiJS timeline)

### The bar (mockup option A — Jeff picked it)

- **Size and position:**
  - The bar's left edge is the span start (no centering).
  - Width is `(end − start) / 600 × TIMELINE_WIDTH`. It is recomputed on every zoom, alongside the existing `updateEventBoxPositions` pass.
  - The bar uses the same light box and dark border as other events.
- **Contents:**
  - A left icon zone with a "random" glyph and the channel-type icon (servo, or up/down arrows for GPIO).
  - Summary text. Servo example: "Random · every 0.4–2.0 s / pos 20–100% · move 15–60%". GPIO example: "Random · toggle every 0.05–0.40 s". The text truncates when the bar is narrow.
  - **For servos, a shaded horizontal band** inside the bar, showing the min–max position range.
- A new icon asset is needed for the random glyph.
- Pixi object refs follow the existing `shallowRef` rule, and the class follows the idempotent `destroy()` / `isDestroyed` pattern used by `PixiChannelEvent`.

### Interaction

**Dragging**

- **Body drag** moves the whole span and keeps its length **(Jeff)**.
- **Edge drag** moves only that edge **(Jeff)**:
  - Edge hit zones are about 8 px, with an `ew-resize` cursor.
  - When a bar is drawn narrower than about 24 px (far zoom-out), it is body-drag only, and you resize it in the dialog (my call).

**Overlap rule.** A span blocks the half-open interval `[start, end)` on its channel.

- An event may sit **exactly on a span's end time**. This is how you set the state after a random stretch.
- An event may not sit inside the span or on its start time.
- Two spans may touch: one's end can equal the next one's start.

**Every path stops at the boundary instead of snapping back (my call).** This matches the existing drag, which writes time into the store on every pointer move.

- **Point event dragged toward a span:**
  - Coming from the right, it stops at the span's end time.
  - Coming from the left, it stops one step (0.1 s) before the span's start.
- **Span moved or resized toward an event:** the leading edge stops at that event. A right edge may land exactly on the event's time. A left edge stops 0.1 s after the event's time.
- **Timeline bounds:** both drags also stop at 0 and 600 s.
- **Clicking inside a span** opens that span's edit dialog. The bar consumes the tap, the same way event boxes do, so it never adds an event.
- **Typed times in the dialog** that would overlap show an inline error, and Save stays disabled. In edit mode, the check ignores the span's own id.
- **One shared pure helper** carries the overlap and clamp logic, and every creation or move path calls it. It returns the blocking interval or the clamped time. The paths are click-to-add, both drags, the dialog, and channel swap. The helper is unit-tested first (TDD).

### Dialog

- The existing servo and GPIO event dialogs gain a **Single / Random switch** at the top. Single is today's form. Opening the dialog is unchanged: click an empty spot on the lane (my call).
- **Random defaults:**
  - start = the clicked time
  - end = start + 5 s, cut short to stop at the next event on the channel and at 600 s
  - If there's no room for even the minimum span, the switch shows an inline error.
- **Switching an existing event's mode** keeps the start time. Random → Single drops the end time and the random parameters (my call).
- **Fields:**
  - Start, End
  - Min/Max time between changes
  - Servo only: Min/Max position, Min move, Max move (labelled optional), Speed, Acceleration
- **Hint line:** "About N–M moves/changes over T s". It is computed from the span length and the gap range: `floor(T / max) + 1` to `floor(T / min) + 1`, counting the first change at the start (my call).
  - For servos, travel time can stretch gaps, so the hint adds "fewer if the servo is slow" whenever speed or acceleration is non-zero. The dialog does not model travel itself (my call).
- **i18n and a11y:**
  - All strings come from `enUS.json` under the existing `modals.servo_event.*` / `modals.gpio_event.*` groups. New copy does not repeat the existing hardcoded "Event time cannot be larger than…" error.
  - Every input has a `<label>`.
  - Errors use `role="alert"`.

### Channel swap

- Swapping between ESP GPIO and Maestro digital channels already converts events (`useEventConverter`). GPIO random spans convert too, keeping the same times and gaps.
- Other swaps already throw for unsupported pairs, and that is unchanged.

## Server (astros_api)

### Data model (my call — pinned here so the tasks have a fixed contract)

**`ScriptEvent`** (API and Vue mirror) gains `endTime: number | null`:

- In seconds, the same unit as `time`.
- `null` for every existing point event.
- A non-null `endTime` marks the event as a random span.

**Persistence:**

- `script_events.end_time` is a new nullable INTEGER column in deciseconds, scaled like `time`. It is added in **`migration_9`**.
- Following the existing migration checklist:
  - register it in `dal/database.ts`
  - export it from `migrations/index.ts`
  - add it to `dal/types.ts`
  - mirror it in `database.integration.test.ts` `buildProvider`
  - add `migration_9.test.ts`
- Existing rows read back as `null`.

**Random parameters** ride in the existing `data` JSON blob, as two new payload types. `moduleSubTypeToScriptEventTypes` selects between them using the sub-type plus `endTime !== null`:

- `RandomGpioEvent { minGapMs, maxGapMs }`, for ESP GPIO.
- `RandomMaestroEvent { channel, isServo, minGapMs, maxGapMs, minPos, maxPos, minMove, maxMove: number | null, speed, acceleration }`, for Maestro servo and digital channels. When `isServo` is false, the position-range, move, speed and acceleration fields are unused.
  - The repository's existing rule that overwrites `channel` with the module channel number on save (`script_repository.ts` ~:364) must cover this type as well.

**Older server builds on a newer database** are handled by the pre-task below, not by sentinel fields in the payload **(Jeff)**.

- Without that guard, an older build ignores `end_time` and parses a random Maestro row as a plain `MaestroEvent`. It then emits `position = undefined`. The firmware's unchecked `std::stoi` (`MaestroCommand.cpp`) aborts on that (exceptions are disabled), and the controller reboots.
- Builds older than the guard stay unprotected. Jeff will tell the two current deployments not to downgrade.

### Duration

- `calculateLengthDS` becomes `max over events of (endTime ?? time)`.
- The converter's `addBufferEvents` uses the same max, so every controller's script lasts until the last span ends. Playlists already read `durationDS`, and they need no change.
- No recompute migration is needed, because no span events exist yet.

### Conversion

- A span emits **one command at its start time**.
  - It goes into the existing per-location time buckets like any other event.
  - Its `delta` field keeps its meaning: the wait until the next command.
  - The span length travels in its own field.
- The new server `CommandType` values must match the firmware `MODULE_TYPE` values (see Wire format).

### Firmware version gate

- `FirmwareConfig.MINIMUM_FIRMWARE_VERSION` rises to the first AstrOs.ESP release that understands the new commands, so older controllers show as needing an update **(my call; Jeff accepted)**.
- Older firmware that still receives the commands skips them and keeps their delay, so the rest of the script plays on time.

## Pre-task: refuse a database from a newer server (Jeff)

This is a standalone task that **merges to develop before `migration_9` exists anywhere**. A dev DB switched between branches is then protected from the start.

### Detection

- At startup, `initializeDatabase` reads the applied migration names (the Kysely migration table), as it already does through `checkPendingMigrations` and `getLastAppliedMigrationName`.
- If **any applied name is not in this build's migration provider**, the database belongs to a newer server.
- In that case the server does not migrate, back up, prune or write anything. It enters a new SystemStatus state with reason code **`DB_NEWER_THAN_SERVER`**.
- This builds on the existing read-only machinery (`SystemStatus`, `write_guard.ts`, `GET /api/system/status`, the `systemStatus` Pinia store, which `App.vue` already fetches on load).
- It is **stricter than read-only (my call):**
  - Every API route except `GET /api/system/status` returns 503 with the reason code. That includes the GET routes and login.
  - The serial worker and animation queue are not started, so the server never talks to the hardware.
  - Existing read-only mode, for migration failures, keeps its current, looser behavior.

### Page

- When the status reports `DB_NEWER_THAN_SERVER`, the app renders **a single full-page message in place of the router view**: no login, no navigation. For example: "This version of AstrOs Server (x.y.z) can't use this database — it was last used by a newer version. Install the newer version, or restore a database backup."
- The text is i18n, the page has one `<h1>`, and the message uses `role="alert"`.

### Scope

- This only protects builds that include the guard. Older builds still boot on a newer DB **(Jeff: acceptable — two deployments, told directly)**.
- Unknown migration names are the whole test. There's no schema-version number to maintain (my call).

## Wire format (my call — to be pinned in `.docs/protocol.md`)

These are two new command types, mirroring the existing `1` (Maestro) / `5` (GPIO) split.

```
6|<delta>|<maestroIdx>|<channel>|<spanMs>|<minGapMs>|<maxGapMs>|<minPos>|<maxPos>|<minMove>|<maxMove>|<speed>|<accel>
7|<delta>|<gpioChannel>|<spanMs>|<minGapMs>|<maxGapMs>
```

- `6` = **MAESTRO_RANDOM**:
  - `maxMove` = `0` means "no max".
  - On a non-servo Maestro channel, the firmware toggles and ignores the fields after `maxGapMs`. The server sends them as `0`.
- `7` = **GPIO_RANDOM**.
- All fields are integers, so there are no new escaping concerns with `|` or `;`.

## Firmware (AstrOs.ESP)

**Parsing** (pure code in `lib_native`, with native tests):

- The parsers for types 6 and 7 use `strtol` with error checks, not `std::stoi`. A field count or value outside the validation rules rejects the command with a log.
- The move and toggle math (direction zones, size draw, clamp, outside-range first move, gap draw, travel-stretched gap) is a pure function with an injected `rand32()`, so native tests are deterministic.

**Random-effects task:**

- It is a new FreeRTOS task that owns a fixed table of active spans, keyed by (type, module, channel).
  - A new span on a channel that already has one replaces it.
  - The task sleeps until the earliest next change, issues the change, and drops each span at its deadline.
- **Dispatch:** the dispatch loop hands a type 6/7 command to this task through a queue, then sleeps its `delta` as usual. The dispatch loop itself never waits on a span.
- **Issuing changes:**
  - Changes go through the existing Maestro and GPIO queue paths, so the per-module mutex ordering and the servo release timer behave as they do today. Random moves re-arm the release timer, and a servo releases normally after its span ends.
  - Sends are non-blocking. On a full queue, the change is dropped and its payload freed, following the queue ownership convention.
- **Clearing the table:**
  - Panic clears it, before the servo queue drain in `handlePanicStop`.
  - Config reload clears it, because channel ranges may have changed.
  - On padawans this happens through the existing ESP-NOW panic relay.
- **Version:** the firmware gets a minor-version bump. The server's minimum version follows it.
- **Existing bug to avoid:** the current GPIO bounds check (`GpioModule.cpp` ~:78, `>` instead of `>=`) must not be copied. Fixing it is a separate quick fix in that repo.

## Testing and QA

- **Pre-task (TDD):**
  - an unknown applied migration enters `DB_NEWER_THAN_SERVER` and leaves the DB file untouched (no backup, no migration, byte-identical)
  - the guard returns 503 for every route except status, login included
  - the serial worker is not started
  - the Vue app renders the page instead of the router
- **Server (TDD):**
  - converter output for 6/7, including buffers and multi-location timing
  - `calculateLengthDS` with spans
  - `migration_9`
  - repository round-trip of `endTime` and the payloads
- **Vue (TDD):**
  - the overlap/clamp helper
  - the dialog validation rules
  - the hint-line math
- **Vue (manual QA):** Pixi bar rendering, zoom and drag. This is the CLAUDE.md TDD exception.
- **Firmware (native tests):**
  - the 6/7 parsers, including rejects
  - move math: both forced-direction zones, the clamp, a blank max move, outside-range first move, gap bounds, and travel-stretched gaps
- **Bench QA:** a new `.docs/qa/random-span-events.md` covering:
  - a GPIO flicker
  - a servo twitch
  - a panel flap with an end-time event
  - panic mid-span
  - a span on a padawan
  - a repeating-playlist idle loop
  - old-firmware behavior

## Sequencing (my call)

0. Pre-task: refuse a newer database. It merges to develop before any task that adds `migration_9`.
1. Pin the wire format in `.docs/protocol.md` (both repos reference it).
2. Firmware: parser, math, task, panic hook, release. This can run in parallel with step 3.
3. Server:
   - data model and migration
   - duration
   - converter
   - scripter helper
   - dialog
   - Pixi bar
   - drag/resize
4. Raise the server's minimum firmware version once the firmware release exists. Then run bench QA end to end.

`superpowers:writing-plans` turns this into task files: server tasks in `.docs/tasks/`, firmware tasks in AstrOs.ESP's own `.docs/tasks/`, plus a `PLAN.md` project section in each repo.

## Backlog notes (found during design, not in this project's scope)

- **Server:** a converter throw makes `convertScript` return an empty map. `uploadScript` only logs it, `createScriptUpload` sends `''` to every controller, and that overwrites their stored scripts. The route returns 200, so the UI shows success.
- **AstrOs.ESP:** `MaestroCommand.cpp` and the other per-type parsers use unchecked `std::stoi`. With exceptions disabled, a non-numeric field aborts and reboots the controller. Harden them to `strtol`, the same as the new 6/7 parsers.
- **AstrOs.ESP:** the `GpioModule.cpp` bounds check is off by one (see the firmware section).

## Left to the builder

- Pixi drawing details: colors, the band's opacity, the glyph art, text layout at each zoom level.
- Exact handle hit-zone and minimum-width numbers (about 8 px and about 24 px are starting points).
- Firmware table capacity, task priority and stack size, and the queue depth for span hand-off.
- i18n key names inside the existing groups.
