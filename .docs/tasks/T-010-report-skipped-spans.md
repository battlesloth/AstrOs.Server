# T-010: Report skipped spans on upload

<!-- File: .docs/tasks/T-010-report-skipped-spans.md. Branch: feature/T-010-report-skipped-spans. PR title: "T-010: Report skipped spans on upload". -->

## Context

- **Found by:** the T-008 pre-push review. PLAN.md § Random span events lists it as T-010 (Jeff, 2026-10-29: before Phase B).
- **Today:** when the converter can't send a span (`ScriptConverter`'s `randomSpanCommand` returns reasons, or the conversion throws), it sends `0|delta|0` in the span's place and logs a `warn`. `uploadScript` still answers `{ message: 'success' }`, and the UI turns green, so nobody sees that the span won't play.
- **The wire rule (Jeff, 2026-11-27):** the server sends enumerated codes, not English or request text. T-013's refusal codes follow the same rule.

## Contract (pinned — do not change)

- **`SpanSkipReason`** is an enum in `astros_api/src/scripting/span_skip_reason.ts`, with `SCREAMING_CASE` string values:

  | Code | When the converter skips |
  |---|---|
  | `SPAN_PAYLOAD_INVALID` | the payload isn't an object |
  | `SPAN_CHANNEL_NOT_FOUND` | no GPIO channel, UART module or Maestro channel for the span |
  | `SPAN_PARAMETERS_INVALID` | `randomSpanProblems` found a broken rule |
  | `SPAN_UNSUPPORTED_SUBTYPE` | a span on a sub-type without span support |
  | `SPAN_CONVERSION_ERROR` | the conversion threw |

  The `warn` line keeps today's detail (the reason strings) for the log only.
- **`ScriptConverter#skippedSpans(): readonly SkippedSpan[]`** returns the spans skipped by the last `convertScript` call.
  - `SkippedSpan = { eventId: string; scriptChannelId: string; reason: SpanSkipReason }`.
  - `convertScript`'s signature is unchanged.
- **`GET /api/scripts/upload?id=`** answers `200 { message: 'success', skipped: SkippedSpan[] }`.
  - `skipped` is always present, and empty when nothing was skipped. The change is additive.
  - Every other response is unchanged.
- **Vue:**
  - `stores/scripts.ts` `uploadScript` returns `{ success: true, skipped }`.
  - When `skipped` isn't empty, `ScriptsView.vue` and `AstrosScriptTestModal.vue` show a warning toast from `enUS.json`, with the count: "{count} random span(s) won't play: open the script to fix them". The upload itself still counts as successful.

## Task

- **API:** the enum; collect the skips in `ScriptConverter` (each skip path tags its reason); reset them at the start of every `convertScript`; the `uploadScript` reply.
- **Tests:** `script_converter.test.ts`:
  - each reason, from a staged span;
  - none for a valid span;
  - reset between calls;
  - the reply shape, in the upload route's test.
- **Vue:** the store, both toasts, and the i18n key, with store and view specs.
- **QA:** `.docs/qa/random-span-events.md` gains a case: a span made invalid by SQL, then uploaded, gives the warning toast and a `skipped` entry.

## Acceptance criteria

- [ ] Each `SpanSkipReason` is reported for its case; a valid span reports nothing; and `skipped` resets between conversions.
  - Mutation: drop the reset, and the test fails.
- [ ] `uploadScript` answers with `skipped`.
- [ ] The Vue store and views show the toast only when `skipped` isn't empty.
- [ ] The QA case is added.

## Out of scope

- Skipped Maestro point events (a point without a numeric `position`). Same mechanism, but not a span; Backlog.
- A converter throw outside the span path, which empties every controller's upload (spec § Backlog notes).
- Showing per-span detail in the UI. The count and "open the script" are enough, because the scripter's dialogs (T-022) prevent invalid spans.

## Verification

- `cd astros_api && npx vitest run`; `npm run prettier:write && npm run lint:fix`; `npm run build`; smoke `npm run typecheck`.
- `cd astros_vue && npx vitest run`; `npm run format && npm run lint`; `npm run build`.
- **By hand on a dev DB copy:**
  1. Insert a span with `minGapMs` below the floor (SQL), and upload it.
  2. Expected: the reply carries `skipped: [{ …, reason: 'SPAN_PARAMETERS_INVALID' }]`, the toast shows, and the log has the `warn`.

## Implementation checklist

<!-- Added when work starts. -->
