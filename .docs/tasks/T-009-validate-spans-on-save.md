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
- **Read:** a span row whose `module_sub_type` is supported but differs from its loaded channel's (`configScriptChannel`'s `moduleChannel.moduleSubType`) is left out of the loaded script, as T-007 leaves out an unsupported one, with a warning ending `moduleSubType ${subtype} does not match its channel's (${channelSubType}); the row is deleted when this script is next saved`. The next save deletes the row. Unreadable `data` still fails the read.
- **Maestro save overwrite:** for an event on a Maestro channel with `endTime != null`, `saveScriptChannel` sets the payload's `isServo` to the channel's `MaestroChannel.isServo`, next to the existing `channel` overwrite. A point `MaestroEvent`'s `isServo` is unchanged.
- **Unchanged:** a point event (`endTime == null`, including an omitted key) is never refused or dropped by these rules, whatever its sub-type and channel. The column, payload shapes and T-007's load-time drop are unchanged; the read path gains only the mismatch drop above.

## Task

### Validation

- New `validateScriptSpans(script: Script, channelSubTypes: ReadonlyMap<string, ModuleSubType>): void` in `astros_api/src/dal/repositories/script_repository.ts` (module-level, exported for tests). `channelSubTypes` maps a script channel's id to its channel's sub-type as loaded from the database. It walks every channel's events and throws `ScriptValidationError` on the first rule a span breaks (Contract order); a span whose script channel is missing from the map gets rule 2's not-found message.
- `upsertScript` first builds `channelSubTypes` for every script channel that holds a span, loading each channel with the loaders `configScriptChannel` uses, keyed by `moduleChannelType` and `moduleChannelId`. It does this through `this.db` before the transaction: inside it, the single SQLite connection belongs to the transaction. A channel that does not load is left out of the map. `upsertScript` then calls `validateScriptSpans`, before `calculateLengthDS` and the transaction, so a bad `endTime` can no longer surface as the `duration_ds` constraint.
- T-007's refusal in `saveScriptEvent` moves into this pass (rule 1). `saveScriptEvent` no longer checks spans.
- `copyScript` saves through `upsertScript`, so a copy of a script with a hand-coded bad span is refused too; its route keeps its current status handling (Out of scope).

### Read

- `readScriptEvents` takes the loaded channel's sub-type (`readScriptChannels` runs `configScriptChannel` first). After T-007's unsupported-sub-type check, it drops a span row whose `module_sub_type` differs from it, with the Contract's warning. Parse the row's data first, as T-007 does, so unreadable data fails the read.

### Maestro overwrite

- In `saveScriptChannel`'s Maestro branch, when `evt.endTime != null`, also set `(evt.event as RandomMaestroEvent).isServo = c.isServo`.

### Controller

- `scripts_controller.ts` `saveScript`: `catch (error)` answers `400 { message: error.message }` when `error instanceof ScriptValidationError` (logged at `warn`, with the script id), otherwise today's 500 path.
- Export `saveScript` the way `deleteScript` is exported, for the controller test.

### Tests

Write these first.

- **`script_repository.test.ts`** (the `random span events` describe):
  - `refuses a span whose endTime is not a finite number`: `it.each` over `'5'`, `''`, `true`, `NaN`, `Infinity` (each assigned to `endTime` with a cast). Asserts `ScriptValidationError` with rule 3's message, and the stored script (rows and name) is unchanged.
  - `refuses a span that ends at or before its time`: `endTime === time` and `endTime < time`. Rule 4's message.
  - `refuses a span outside 0–600 s` (amended 2026-10-29): `it.each` over `time` −1 with `endTime` 1, `time` 599 with `endTime` 600.1, `time` `-Infinity` with `endTime` 1, and `time` `'5'` (a string, cast) with `endTime` 10. Rule 5's message; stored script unchanged.
  - `a span from 0 to exactly 600 s is saved` (amended 2026-10-29): the boundary case is accepted and reads back.
  - `rule order: a backwards span beyond 600 s reports the order` (amended 2026-10-29): `time` 700, `endTime` 650 → rule 4's message.
  - `the sub-type refusal is a ScriptValidationError`: T-007's serial case, now also `instanceof`.
  - `rule order: a span on an unsupported sub-type with a bad endTime reports the sub-type`.
  - `refuses a span whose sub-type does not match its channel`: a `genericGpio` span on a serial (`UartChannel`) script channel, with a request-body `moduleChannel` claiming `genericGpio`. Rule 2's mismatch message; stored script unchanged.
  - `refuses a span whose channel is not in the database`: rule 2's not-found message.
  - `rule order: a mismatched span with a bad endTime reports the mismatch`.
  - `drops a hand-coded span whose sub-type does not match its channel`: a `genericGpio` span row (GPIO span data) on a serial channel, written by SQL. Read leaves it out with the warning; the next save deletes the row.
  - `a Maestro span takes the channel's isServo on save`: payload `isServo: true` on a channel configured digital reads back `false`; a point `MaestroEvent` on the same channel keeps its `isServo`.
  - `a point event is never refused`: points with `endTime: null` and with the key omitted, including `time: 0`, and a point whose sub-type differs from its channel's (saved and read back as today).
- **`scripts_controller.test.ts`:**
  - `a refused save answers 400 with the reason`.
  - `any other save failure still answers 500 Internal server error` (for example, the repository throws a plain `Error`).
- T-007's existing refused-save and drop tests stay green unchanged.

## Acceptance criteria

- [ ] All tests above are green; every T-007 repository test is unchanged and green.
- [ ] A refused save writes nothing and answers 400 with the exact Contract message.
- [ ] `npm run build` and the full API suite are green.
- [ ] `.docs/qa/random-span-events.md` gains a "Save validation" section: a `curl` PUT with a backwards span → 400 and the message; GET shows the script unchanged; a GPIO-tagged span on a serial or HCR channel → 400 with rule 2's message; a span ending after 600 s → 400 with rule 5's message (amended 2026-10-29); a Maestro span saved with a stale `isServo` reads back with the channel's. Case 6 gains the mismatch variant (a GPIO-tagged span row on an HCR channel is dropped on load and deleted by the save).

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

- [ ] Amendments (2026-10-29, at T-009 start): rule 5, the 0–600 s bound (Jeff; see the Contract note), with its tests, QA criterion and Verification step 5. The Tests section's rule numbers were one behind the Contract since rule 2 (the sub-type match) was inserted on 2026-10-28; corrected to match the Contract's exact messages (non-finite `endTime` is rule 3, a span not after its time is rule 4)
- [ ] RED/GREEN: `ScriptValidationError` (`models/scripts/script_validation_error.ts`, exported from `models/index.ts`)
- [ ] RED/GREEN: `validateScriptSpans`, rules 1–5 in Contract order, first failure wins; T-007's refusal leaves `saveScriptEvent`, keeping its `refusing event <id> on channel <ch> in script <id>: <message>` error line (T-007's refused-save test spies on it unchanged)
- [ ] RED/GREEN: `upsertScript` builds `channelSubTypes` through `this.db` before `calculateLengthDS` and the transaction, for script channels holding a span. A loader's `NoResultError` leaves the channel out of the map (rule 2's not-found message); any other error propagates (500, not a misreported 400)
- [ ] RED/GREEN: read-side mismatch drop in `readScriptEvents` (after T-007's unsupported check, data parsed first)
- [ ] RED/GREEN: Maestro span `isServo` overwrite in `saveScriptChannel` (from the request body's channel, as the existing `channel` overwrite; T-008's converter reads the stored channel)
- [ ] RED/GREEN: controller `saveScript` → 400 for `ScriptValidationError` (warn with the script id), 500 otherwise; `saveScript` exported
- [ ] Mutation checks on each rule, the rule order, the `NoResultError` filter, the read drop and the overwrite
- [ ] Doc sweep: QA plan "Save validation" section and case 6's mismatch variant; spec § Validation ("adds no new save-time validator" is superseded by T-009) and the spans-only rule; code comments naming `saveScriptEvent`'s refusal; PLAN.md (T-009 line, the int32 Backlog item: span times now bounded, gap fields not)
- [ ] Pre-commit: prettier + lint, build, full API suite, `superpowers:requesting-code-review`
- [ ] Manual check (Verification steps 1–5) on a copy of the dev DB
- [ ] Pre-push: `/pr-review-toolkit:review-pr`
