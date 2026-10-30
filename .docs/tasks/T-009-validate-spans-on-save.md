# T-009: Validate random spans on save

<!-- File: .docs/tasks/T-009-validate-spans-on-save.md. Branch: feature/T-009-validate-spans-on-save. PR title: "T-009: Validate random spans on save". -->

## Context

This is Phase A of the random span events project. See `PLAN.md` § Random span events and the spec `.docs/specs/20261022-0748-random-span-events-design.md` § "Data model". Server task numbers are separate from AstrOs.ESP's; this is not ESP T-009.

T-007 lets `PUT /api/scripts/` save a span (`endTime` non-null) on GPIO and Maestro channels, and refuses one on any other sub-type. Its reviews found three save-side gaps, and Jeff decided them on 2026-10-27:

- **The refusal answers 500.** `saveScriptEvent` throws a plain `Error`, so the scripts controller answers `500 { message: 'Internal server error' }` and the reason reaches only the log. Decision: **a refused save answers 400 with the reason.**
- **`endTime` itself is never checked.** The controller passes `req.body` through untyped. A non-numeric `endTime` makes `calculateLengthDS` return `NaN`, so the save fails with `NOT NULL constraint failed: scripts.duration_ds` (the wrong field). `""` stores `0`, `true` stores `10`, `1e400` arrives as `Infinity`, and a span that ends before it starts is stored and makes the script's length undercount. Decision: **refuse a span whose `endTime` is not a finite number after its `time`.**
- **`RandomMaestroEvent.isServo` goes stale.** A Maestro span stores a copy of its channel's servo/digital setting. The save already overwrites the payload's `channel` from the channel (`saveScriptChannel`), but not `isServo`. Decision: **overwrite it on save too** (T-008 also reads the channel's setting at conversion).

PR #135's review (Copilot) found a fourth, decided by Jeff on 2026-10-28:

- **A span's sub-type is the client's word, not its channel's.** Both T-007 guards (`saveScriptEvent`, `readScriptEvents`) test the event's own `moduleSubType`, and the converter dispatches on it too. So a raw PUT can tag a span `genericGpio` on a serial channel, and it is saved and read back as a GPIO span. The channel in the request body is the client's too. Points have the same gap (PLAN.md Backlog). Decision: **a span whose sub-type differs from its channel's, read from the database, is refused on save and dropped on read.** Spans only: rows from older data may carry a NULL or stale sub-type, so refusing points could block saving existing scripts.

Nothing in the scripter creates a span until Phase B, so this is the server's backstop. Showing the reason in the editor is Phase B's.

## Contract (pinned — do not change)

- **Refused save:** `PUT /api/scripts/` answers **`400 { message: <reason> }`** when the script fails span validation. Nothing is written: validation runs before `upsertScript`'s transaction. Every other failure keeps today's `500 { message: 'Internal server error' }`.
- **`ScriptValidationError extends Error`**, in `astros_api/src/models/scripts/script_validation_error.ts` and exported from `models/index.ts`. The repository throws it for every refusal below; the controller maps exactly this type to 400.
- **Rules**, for every event with `endTime != null`, checked in this order, first failure wins. The messages are exact:
  1. `supportsRandomSpan(moduleSubType)` (T-007) → `Random span not supported for moduleSubType: ${moduleSubType}` (T-007's text, unchanged).
  2. The span's `moduleSubType` equals its channel's, meaning the channel named by its script channel's `moduleChannelType` and `moduleChannelId`, loaded from the database (not the request body's `moduleChannel`) → `Random span moduleSubType ${moduleSubType} does not match its channel's (${channelSubType})`. A channel that is not in the database → `Random span channel not found: ${moduleChannelType} ${moduleChannelId}`.
  3. `typeof endTime === 'number' && Number.isFinite(endTime)` → `Random span endTime must be a finite number, got ${JSON.stringify(endTime)}`.
  4. `endTime > time` → `Random span endTime must be after its time (${time} s), got ${endTime} s`.
  5. `typeof time === 'number' && time >= 0 && endTime <= 600` → `Random span must lie between 0 and 600 s, got ${time} to ${endTime} s`. (Amended 2026-10-29, Jeff, at T-009 start: rules 3–4 let `endTime: 1e300` through, which the upload sent as `1e+303` in the span and in every location's end-buffer delta, and they let a negative or `-Infinity` `time` through. The bound is the scripter's timeline, `TIMELINE_DURATION_SECONDS = 600` in Vue `timelineConstants.ts`, and the spec's dialog rule `0 ≤ start < end ≤ 600`. No span is stored yet, so it refuses nothing existing. The payload's gap fields stay unbounded above; that is the PLAN.md Backlog's § C bound item.)
  Rules 4 and 5 check the stored values (amended 2026-10-29, Jeff, review round 1): `time` and `endTime` **as stored**, each rounded once to whole deciseconds the way `saveScriptEvent` stores it (`Math.round(s × 10) / 10`), and their messages show those values. Checked on the raw seconds, a span from 0.05 to 0.14 s passed rule 4 but stored as 0.1 → 0.1, which rule 4 refused on every later save of the script, and the scripter resends every event. It is now refused at once: `… after its time (0.1 s), got 0.1 s`. An `endTime` of 600.04 stores as 600.0 and is valid. Rule 5's `typeof time` check stays on the raw value.
- **Read:** a span row whose `module_sub_type` is supported but differs from its loaded channel's (`configScriptChannel`'s `moduleChannel.moduleSubType`) is left out of the loaded script, as T-007 leaves out an unsupported one, with a warning ending `moduleSubType ${subtype} does not match its channel's (${channelSubType}); the row is deleted when this script is next saved`. The next save deletes the row. Unreadable `data` still fails the read.
- **Maestro save overwrite:** for an event on a Maestro channel with `endTime != null`, `saveScriptChannel` sets the payload's `isServo` to the channel's `MaestroChannel.isServo`, next to the existing `channel` overwrite. A point `MaestroEvent`'s `isServo` is unchanged. (Amended 2026-10-29, Jeff, review round 1: the channel **as stored**, the one rule 2 loads, not the request body's `moduleChannel`, which is the client's word as in rule 2. For a span on a `MaestroChannel` script channel, a stale tab or a raw PUT can no longer store a stale or missing `isServo`. The existing `channel` number overwrite keeps reading the request's channel; that is out of scope.)
- **Unchanged:** a point event (`endTime == null`, including an omitted key) is never refused or dropped by these rules, whatever its sub-type and channel. The column, payload shapes and T-007's load-time drop are unchanged; the read path gains only the mismatch drop above.

## Task

### Validation

- New `validateScriptSpans(script: Script, channelSubTypes: ReadonlyMap<string, ModuleSubType>): void` in `astros_api/src/dal/repositories/script_repository.ts` (module-level, exported for tests). `channelSubTypes` maps a script channel's id to its channel's sub-type as loaded from the database. It walks every channel's events and throws `ScriptValidationError` on the first rule a span breaks (Contract order); a span whose script channel is missing from the map gets rule 2's not-found message.
- `upsertScript` first builds `channelSubTypes` for every script channel that holds a span, loading each channel with the loaders `configScriptChannel` uses, keyed by `moduleChannelType` and `moduleChannelId`. It does this through `this.db` before the transaction: inside it, the single SQLite connection belongs to the transaction. A channel that does not load is left out of the map. (Amended 2026-10-29: it keeps the loaded channels themselves and derives `channelSubTypes` from them, so the Maestro overwrite can read the stored `isServo`.) `upsertScript` then calls `validateScriptSpans`, before `calculateLengthDS` and the transaction, so a bad `endTime` can no longer surface as the `duration_ds` constraint.
- T-007's refusal in `saveScriptEvent` moves into this pass (rule 1). `saveScriptEvent` no longer checks spans.
- `copyScript` saves through `upsertScript`, so a copy of a script with a hand-coded bad span is refused too; its route keeps its current status handling (Out of scope).

### Read

- `readScriptEvents` takes the loaded channel's sub-type (`readScriptChannels` runs `configScriptChannel` first). After T-007's unsupported-sub-type check, it drops a span row whose `module_sub_type` differs from it, with the Contract's warning. Parse the row's data first, as T-007 does, so unreadable data fails the read.

### Maestro overwrite

- In `saveScriptChannel`'s Maestro branch, when `evt.endTime != null`, also set `(evt.event as RandomMaestroEvent).isServo = c.isServo`. (Amended 2026-10-29: `c` here is the stored channel that `upsertScript` loaded for validation, passed into `saveScriptChannel`.)

### Controller

- `scripts_controller.ts` `saveScript`: `catch (error)` answers `400 { message: error.message }` when `error instanceof ScriptValidationError` (logged at `warn`, with the script id), otherwise today's 500 path.
- Export `saveScript` the way `deleteScript` is exported, for the controller test.

### Tests

Write these first.

- **`script_repository.test.ts`** (the `random span events` describe):
  - `refuses a span whose endTime is not a finite number`: `it.each` over `'5'`, `''`, `true`, `NaN`, `Infinity` (each assigned to `endTime` with a cast). Asserts `ScriptValidationError` with rule 3's message, and the stored script (rows and name) is unchanged.
  - `refuses a span that ends at its time` / `… before its time` (one `it.each`): `endTime === time` and `endTime < time`. Rule 4's message.
  - `refuses a span outside 0–600 s` (amended 2026-10-29): `it.each` over `time` −1 with `endTime` 1, `time` 599 with `endTime` 600.1, `time` `-Infinity` with `endTime` 1, and `time` `'5'` (a string, cast) with `endTime` 10. Rule 5's message; stored script unchanged.
  - `a span from 0 to exactly 600 s is saved` (amended 2026-10-29): the boundary case is accepted and reads back.
  - `rule order: a backwards span beyond 600 s reports the order` (amended 2026-10-29): `time` 700, `endTime` 650 → rule 4's message.
  - `the sub-type refusal is a ScriptValidationError`: T-007's serial case, now also `instanceof`.
  - `rule order: a span on an unsupported sub-type with a bad endTime reports the sub-type`.
  - `refuses a span whose sub-type does not match its channel`: a `genericGpio` span on a serial (`UartChannel`) script channel, with a request-body `moduleChannel` claiming `genericGpio`. Rule 2's mismatch message; stored script unchanged.
  - `refuses a span whose channel is not in the database`: rule 2's not-found message.
  - `rule order: a mismatched span with a bad endTime reports the mismatch`.
  - `drops a hand-coded span whose sub-type does not match its channel`: a `genericGpio` span row (GPIO span data) on a serial channel, written by SQL. Read leaves it out with the warning; the next save deletes the row.
  - `a Maestro span takes the stored channel's isServo on save`: payload `isServo: true` on a channel configured digital reads back `false`; a point `MaestroEvent` on the same channel keeps its `isServo`. (Amended 2026-10-29: the request body's `moduleChannel` claims servo, so the test tells the stored channel from the request's.)
  - `a span shorter than the 0.1 s storage step is refused` (amended 2026-10-29): 0.05 → 0.14 s, rule 4's message with `(0.1 s), got 0.1 s`.
  - `an end that stores as 600 s is saved` (amended 2026-10-29): `endTime` 600.04 reads back as 600.
  - `a start of %s s stores as 0 s and is saved` (amended 2026-10-29; an `it.each` over −0.04 and −0.05): stored as row time 0.
  - `refuses a span outside 0–600 s` gains a start of −0.06 (amended 2026-10-29): rule 5's message shows the stored `-0.1`.
  - `rule order: an unsupported sub-type is reported before a channel problem` (amended 2026-10-29, review round 1): `validateScriptSpans` directly, a serial-tagged span with its channel mapped to `genericGpio` and with no map entry; rule 1's message both times.
  - `a point event is never refused`: points with `endTime: null` and with the key omitted, including `time: 0`, and a point whose sub-type differs from its channel's (saved and read back as today).
- **`scripts_controller.test.ts`:**
  - `a refused save answers 400 with the reason`.
  - `any other save failure still answers 500 Internal server error` (for example, the repository throws a plain `Error`).
- T-007's existing refused-save and drop tests stay green unchanged.

## Acceptance criteria

- [x] All tests above are green; every T-007 repository test is unchanged and green (assertions unchanged; one comment corrected in the pre-push review).
- [x] A refused save writes nothing and answers 400 with the exact Contract message.
- [x] `npm run build` and the full API suite are green.
- [x] `.docs/qa/random-span-events.md` gains a "Save validation" section: a `curl` PUT with a backwards span → 400 and the message; GET shows the script unchanged; a GPIO-tagged span on a serial or HCR channel → 400 with rule 2's message; a span ending after 600 s → 400 with rule 5's message (amended 2026-10-29); a Maestro span saved with a stale `isServo` reads back with the channel's. Case 6 gains the mismatch variant (a GPIO-tagged span row on an HCR channel is dropped on load and deleted by the save).

## Out of scope

- Showing the reason in the scripter (Phase B). Today's save error modal shows axios's generic message (`Failed to save script: …`, hard-coded English); Phase B reads `response.data.message` and adds i18n keys.
- Converter behavior: reading the channel's servo/digital setting and skipping a Maestro point without a numeric `position` are T-008's (amended 2026-10-27).
- `time` validation for point events, and other routes that save scripts (`copyScript`'s route keeps its status codes).
- A point event whose `moduleSubType` differs from its channel's (PLAN.md Backlog). It needs a check of real databases first.
- The 89 `logger.error(string, err)` calls (PLAN.md Backlog).

## Verification

- `cd astros_api && npx vitest run src/dal src/controllers src/models` → green. Then `npm run build` and the full `npx vitest run` → green.
- Manual check, on a copy of the dev DB with the API from this branch:
  1. Fetch a GPIO script (`GET /api/scripts/?id=…`), give one GPIO event `"endTime": <time − 1>`, and `PUT` it back.
  2. The response is `400 {"message":"Random span endTime must be after its time (…"}`, the API log has the warn line, and a fresh GET matches step 1's.
  3. Repeat with a valid span (`endTime` = time + 5) on a Maestro channel with `"isServo"` opposite to the channel's: `200`, and the read-back payload's `isServo` matches the channel.
  4. On a script with an HCR channel, give one HCR event `"moduleType": 3, "moduleSubType": 301, "endTime": <time + 3>, "event": {"minGapMs": 50, "maxGapMs": 400}` and PUT it: `400` with rule 2's mismatch message, and a fresh GET matches the one before.
  5. Repeat step 1 with `"endTime": 601` (amended 2026-10-29): `400` with rule 5's message, and a fresh GET matches step 1's.

## Failure-mode inventory

The validation itself is synchronous. The one new I/O is a channel read for each script channel that holds a span, before the transaction. A channel deleted or reconfigured between that read and the transaction is not re-checked; the read-side drop still catches a span left mismatched, and the single-user server makes the window theoretical.

## Implementation checklist

- [x] Amendments (2026-10-29, at T-009 start): rule 5, the 0–600 s bound (Jeff; see the Contract note), with its tests, QA criterion and Verification step 5. The Tests section's rule numbers were one behind the Contract since rule 2 (the sub-type match) was inserted on 2026-10-28; corrected to match the Contract's exact messages (non-finite `endTime` is rule 3, a span not after its time is rule 4)
- [x] RED/GREEN: `ScriptValidationError` (`models/scripts/script_validation_error.ts`, exported from `models/index.ts`)
- [x] RED/GREEN: `validateScriptSpans`, rules 1–5 in Contract order, first failure wins. T-007's refusal leaves `saveScriptEvent` and keeps its `refusing event <id> on channel <ch> in script <id>: <message>` error line, now prefixed `ScriptRepository.validateScriptSpans:` (T-007's refused-save test spies on it unchanged)
- [x] RED/GREEN: `upsertScript` loads the stored channel of each span-holding script channel through `this.db` before `calculateLengthDS` and the transaction, and derives `channelSubTypes` from them. A loader's `NoResultError` leaves the channel out (rule 2's not-found message); any other error propagates (500, not a misreported 400; test renames `gpio_channels`)
- [x] RED/GREEN: read-side mismatch drop in `readScriptEvents` (after T-007's unsupported check, data parsed first; unreadable data still fails the read)
- [x] RED/GREEN: Maestro span `isServo` overwrite in `saveScriptChannel`, from the stored channel (review-round-1 amendment; first written from the request body's channel as the Task then said)
- [x] RED/GREEN: controller `saveScript` → 400 for `ScriptValidationError` (warn with the script id), 500 otherwise; `saveScript` exported
- [x] Tests beyond the task's list: a channel read failure other than a missing row is not a refusal; a point on a channel missing from the database is saved without a lookup (the Contract's "whatever its channel"); a point at 700 s is not refused; a mismatched span row with unreadable data fails the read (pre-push additions are listed under the pre-push review)
- [x] Mutation checks, round 1: 27 mutants, all killed. Each rule (off, and its boundary), the order of rules 1/3, 4/5; points validated; a plain `Error` thrown; the validate call removed; the `NoResultError` filter widened to `Error`; sub-types from the request body; the map keyed by `moduleChannelId`; `holdsSpan` always true; the read drop off, applied to points, and without parse-first; the overwrite off and applied to points; the controller's 400 branch (one needed a type-valid form: `&& false` narrows `error` to `never`), status and warn
- [x] Doc sweep: QA plan "Save validation" section (cases 11–14) and case 6 steps 8–11; spec § Validation ("adds no new save-time validator" superseded) and the spans-only rule; code comments naming `saveScriptEvent`'s refusal; both `RandomMaestroEvent` comments (API and Vue); PLAN.md (T-009 line, the int32 Backlog item: span times now bounded, gap fields not)
- [x] Manual check (Verification steps 1–5, 2026-10-29) on the QA copy of the dev DB (`/tmp/astros-span-upgrade`, with case 8's `T-008 QA`), this branch's API under `start:tsx`, a token signed with `JWT_KEY`. Through QA cases 11–14 as written: the backwards span → `400 {"message":"Random span endTime must be after its time (1 s), got 0 s"}` with the error and warn log lines; `endTime` 601 → rule 5's message; a GPIO-tagged span on a serial channel → `… does not match its channel's (101)`, and on an HCR channel (step 4) → `(103)`; each refused save left `GET` identical. A Maestro span saved with the channel switched to digital stored `"isServo":false`, and `true` after restoring. Case 6 steps 8–11 through the API: the GPIO-tagged HCR span row was dropped on `GET` with the exact warning and deleted by the `PUT` (17 → 16 rows). Re-run on the fixed build after review round 1: rewritten case 14 (a copy loaded while the channel was a servo, saved after switching it to digital) stored `"isServo":false`, then `true` after restoring; a 0.05 → 0.14 s span → `400 {"message":"Random span endTime must be after its time (0.1 s), got 0.1 s"}` with the `ScriptRepository.validateScriptSpans:` log prefix and `GET` unchanged; cases 11 and 12 gave the same messages as before
- [x] Code review, round 1 (2026-10-29). No Critical. One Important: a span shorter than the 0.1 s storage step (0.05 → 0.14 s) passed rule 4, stored as 0.1 → 0.1, and then blocked every later save of the script. Jeff amended the Contract (rules 4–5 judge the times as stored) and, from Minor 3, took `isServo` from the stored channel. Fixed in the same pass:
  - rules 4–5 use `toStoredDs`, the same rounding `saveScriptEvent` now calls, and their messages show the stored values (tests: 0.05 → 0.14 refused, 600.04 saved as 600, −0.04 saved as 0);
  - the overwrite reads the stored channel `loadSpanChannels` loaded (test: the request's copy says servo, the stored channel is digital);
  - rule 1 before rule 2 is pinned through `validateScriptSpans` directly, which gives its export a read site;
  - the 500 test asserts the logged error and no warn. Strengthening it showed the old test passed vacuously: it imported `ScriptRepository` as `../dal/…` while the controller uses `src/dal/…`, separate module instances under vitest, so the mock never applied and a `TypeError` produced the 500;
  - the refusal log prefix is `ScriptRepository.validateScriptSpans:`; docstrings name the PUT route and the unknown-type case; the spec names "channel not found"; QA case 6 step 8 has its query; QA case 14 now saves a stale copy after switching the channel.

  Backlog, not fixed: span channel checks compare sub-types only (a `UartChannel` row pointing at a Maestro module; an unknown `moduleChannelType` drops with "(0)"); a refused save logs at error level (T-007's test pins it).

  Mutation-checked (15, all killed): rule 4 on raw values, its raw message, `>=`; rule 5's raw end, raw start, `> 0`, `>= 600`; rules 2a/2b ahead of rule 1; the overwrite from the request, on points, off, and without the stored channel passed in; the controller's 500 without its error log, and the warn on every failure
- [x] Code review, round 2 (the fix delta). No Critical or Important. Fixed: rule 5's stored-value message is pinned (a start of −0.06 is shown as `-0.1`; the raw-message mutant is killed); the overwrite comment and the Contract note say "a span on a `MaestroChannel` script channel" (the `UartChannel` Backlog case gets no overwrite); the Backlog item quotes the converter's `no Maestro channel found`; the Tests list names `…the stored channel's isServo…` and the −0.04 / −0.06 cases; the QA edge bullets add them. Confirmed: `-0` from `Math.round(-0.4)` stores and prints as `0`; `MaestroChannel` and `ScriptValidationError` load as one module under vitest whichever specifier imports them.
  Not taken (refused correctly, message only, reachable only by a raw PUT, and the Contract pins the messages; for Jeff to revisit if wanted): rule 5's message for a non-number `time` shows its numeric coercion (`null` → `got 0 to 5 s`, `true` → `got 1 to 5 s`); an omitted or non-numeric `time` gets rule 4's `(NaN s)`; a string `moduleSubType` such as `"301"` gets rule 1's `not supported for moduleSubType: 301`; a time near `Number.MAX_VALUE` overflows ×10 and prints `Infinity`; rule 3 prints `got null` for `NaN`, `Infinity` and a JSON `1e400`
- [x] Pre-commit: prettier + lint (both sub-projects; API at its 11 pre-existing warnings), test files type-checked, build, full API suite 80 files / 1202 tests, Vue build + 54 files / 780 tests (+1 todo; comment-only change)
- [x] Pre-push: `/pr-review-toolkit:review-pr` (5 agents in parallel, 2026-10-29, `git diff develop...HEAD`; the checkout was clean afterwards and no review worktree was left). No Critical or Important from four agents; the test analyzer rated one gap critical:
  - **The controller's `return;` after the 400 was unpinned.** Without it a second `res.json` throws `ERR_HTTP_HEADERS_SENT` out of the catch, and the unhandled rejection exits the process. Both controller tests now assert the exact call lists.
  - **Test gaps, each with a surviving mutant:** only the first span was checked; the Kangaroo and I2C arms of `readModuleChannel` had no coverage anywhere; the `isServo` overwrite was tested in one direction; an unknown `moduleChannelType` (Vue can send `PwmChannel`) was untested on save and read; "not found" before rules 3–5; `holdsSpan`'s `!=` (an omitted `endTime`); rule 4's negation (a missing `time`); `-0.05`; accepted saves logging no error; the controller not logging the refusal at error; `SyntaxError` for unreadable data; the refusal's log prefix and context (now asserted for every refusal in `expectRefused`).
  - **Code:** a span rule 1 refuses no longer looks up its channel (a channel id SQLite can't bind turned rule 1's 400 into a 500); `loadAndValidateSpanChannels` folds the load and the validation into one method returning a `ReadonlyMap`, so `saveScriptChannel` can't get stored channels without validation; the overwrite throws instead of skipping silently if no `MaestroChannel` was loaded (reachable only when two script channels share an id, a save that fails on the `script_channels.id` primary key anyway with the same rollback and 500, so no mutant can tell the throw apart); `spanProblem` types `time` / `endTime` as `unknown` and numbers its checks; the 500 branch logs `{ err, scriptId }`.
  - **A T-007 test comment** said "only a rollback leaves the stored script unchanged", false since the refusal moved before the transaction, and no test pinned the rollback any more. The comment now says nothing is written; its assertions are unchanged. A new test (two script channels with one id) fails a write inside the transaction and pins the rollback.
  - **Docs:** the model comments say "the stored channel"; the error class's docstring no longer describes routes (the controller comments the copy route's 500); Vue's `TIMELINE_DURATION_SECONDS` points back to the API copy; QA case 8 and PLAN.md's bench line give the span-row bounds with a check query; the spec says "the order and range checks".
  - **Not fixed:** a stored span that breaks rules 3–5 locks its script (three agents). Not pursued (Jeff, 2026-10-29): no production system can hold a span before this ships, so only hand-edited dev or bench rows can; PLAN.md's bench line and QA case 8 give the bounds and a check query. The Copy button always 404s (Vue sends `GET`, the API registers `POST`; predates T-009) → T-011. Backlog: a span's `channel` still comes from the request, and a missing payload gives a 500; point times beyond `1e300` are unbounded.
  - **Module instances under vitest, observed per module:** `script_repository.js` and `logger.js` load twice when imported as `src/…` and as a relative path (the vacuous 500 test above); `models/index.js` loads once either way, so the `ScriptValidationError` and `MaestroChannel` `instanceof` checks in the tests are real. The reason for the difference was not investigated. Production builds rewrite `src/` to relative paths (tsc-alias), so both resolve to one file.
  - Fix-delta review (2026-10-29): no Critical or Important. Fixed: the controller test checks that no error call carries the refusal, bare or as `{ err }` (the old check missed the 500 log line moved above the `instanceof`; killed now); the throw's comment and this record name the duplicate-id path; the points test asserts its exact row count again; the Tests list names the −0.04/−0.05 `it.each`. Not taken: a lookup that throws for one channel (a raw PUT's unbindable id) still turns an earlier span's refusal in another channel into a 500; closing it means validating before any lookup.
  - Mutation-checked (15, all killed; one needed a type-valid form): no `return` after the 400; the controller also logging the refusal at error; the bare 500 log; first span only; the Kangaroo and I2C arms; demote-only `isServo`; an unknown type throwing; `holdsSpan`'s `!==` and its missing rule-1 filter; rule 4 un-negated; rounding halves away from zero; the old log prefix; the loader skipping validation; "not found" moved after rule 5
- [x] Pre-commit for the pre-push fixes: prettier + lint (both sub-projects; API at its 11 pre-existing warnings), test files type-checked, both builds, API 80 files / 1212 tests, Vue 54 files / 780 tests (+1 todo)
- [x] QA walk with Jeff (2026-10-29, after the pre-push fixes; a fresh copy of `.data/database.sqlite3` at `8_`, migrated to 9 on boot, with `T-008 QA` copied in from the T-008 walk's database). This branch's API ran on :3001 and Vue on :5174, because another project held :3000 and :5173.
  - Save validation cases 11–14 via `curl` gave the plan's exact 400 messages, each with the `ScriptRepository.validateScriptSpans: refusing event …` error line and the controller's warn. Every refused save left `GET` identical, and `isServo` followed the stored channel both ways.
  - Case 3 regression in the scripter: Jeff opened and saved `T-003 QA` (89 servo events), `serial test` and `T-008 QA` (a GPIO point and three spans). All answered `PUT 200`, and all 95 event rows were byte-identical afterwards. The spans kept their end times, so the scripter carries spans through the new validation.
  - Case 6 steps 8–11: a GPIO-tagged span planted on an HCR event in `Servo Test` was left out on load (the drop warning logged), and the scripter's save deleted the row (17 → 16)
