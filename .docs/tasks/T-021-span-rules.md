# T-021: Shared span rules for the scripter (overlap, clamp, validation, hints)

<!-- File: .docs/tasks/T-021-span-rules.md. Branch: feature/T-021-span-rules. PR title: "T-021: Shared span rules for the scripter". -->

## Context

- **Spec:** `.docs/specs/20261022-0748-random-span-events-design.md`. This task covers § Behavior / Common and § Validation, plus § Scripter, Interaction (the overlap rule and "every path stops at the boundary"), and Dialog (defaults and the hint line).
- **Project:** PLAN.md § Random span events, Phase B (the scripter). This is the first task, and the other Phase B tasks call it: the dialog (T-022), the bar (T-023), drag and resize (T-024) and channel swap (T-025).
- **Why one module:** the spec calls for "one shared pure helper" for overlap and clamping, which every creation and move path uses. It is unit-tested first (TDD).

## Contract (pinned — do not change)

**File:** `astros_vue/src/utils/spanRules.ts`. These are pure functions: no Vue, no Pixi, no store.

**Units:** times are seconds, like `ScriptEvent.time`, on a 0.1 s grid. Gaps arrive in seconds from the dialog and are stored as integer ms (`Math.round(s × 1000)`). Constants:

| Constant | Value |
|---|---|
| `SPAN_TIME_STEP_S` | 0.1 |
| `TIMELINE_END_S` | 600 (`TIMELINE_DURATION_SECONDS`) |
| `GPIO_MIN_GAP_S` | 0.02 |
| `SERVO_MIN_GAP_S` | 0.1 |
| `DEFAULT_SPAN_LENGTH_S` | 5 |

**Types:**
- `TimedEvent = { id: string; time: number; endTime: number | null }`. A point has `endTime === null`, and a span covers `[time, endTime)`.
- `SpanKind = 'gpio' | 'servo'`.

**Functions:**
- **`findOverlap(events: TimedEvent[], time: number, endTime: number | null, ignoreId?: string): TimedEvent | null`**
  - Returns the first event that the point or span `[time, endTime)` collides with, by the spec's overlap rule:
    - a point may sit exactly on a span's end, but not inside a span or on its start;
    - two spans may touch.
  - `ignoreId` skips the event being edited.
- **`clampPointTime(events: TimedEvent[], eventId: string, fromTime: number, toTime: number): number`**
  - The time a dragged point stops at.
  - Coming from the right, it stops at a span's end; coming from the left, it stops 0.1 s before the span's start.
  - It also stops at 0 and 600.
- **`clampSpanMove(events: TimedEvent[], spanId: string, fromStart: number, toStart: number, length: number): number`**
  - The start a dragged span stops at.
  - Its leading edge stops at the next event: a right edge may land exactly on an event's time, and a left edge stops 0.1 s after a point's time, or at a span's end.
  - The length is unchanged, and the span stays within 0 to 600.
- **`clampSpanEdge(events: TimedEvent[], spanId: string, edge: 'start' | 'end', toTime: number, minLengthS: number): number`**
  - The time a dragged edge stops at.
  - It applies the same boundary rules and never makes the span shorter than `minLengthS`.
- **`defaultSpanEnd(events: TimedEvent[], start: number, minLengthS: number): number | null`**
  - Returns `start + 5`, cut short at the next event on the channel and at 600.
  - Returns `null` when even `minLengthS` doesn't fit.
- **`validateSpan(fields: SpanFields, kind: SpanKind, events: TimedEvent[], ignoreId?: string): SpanFieldError[]`**
  - `SpanFields` holds `start`, `end`, `minGapS` and `maxGapS`. For servos it also holds `minPos`, `maxPos`, `minMove`, `maxMove: number | null`, `speed` and `acceleration`.
  - Returns every broken rule from the spec's § Validation, as codes.
- **`SpanFieldError`** is an enum of the error codes; the dialog maps each to an i18n key. Values are `SCREAMING_CASE` strings:

  | Code | Rule |
  |---|---|
  | `START_OUT_OF_RANGE` | start outside 0–600 |
  | `END_NOT_AFTER_START` | |
  | `END_OUT_OF_RANGE` | |
  | `SPAN_SHORTER_THAN_MIN_GAP` | |
  | `MIN_GAP_BELOW_FLOOR` | |
  | `MAX_GAP_BELOW_MIN_GAP` | |
  | `POSITION_RANGE_INVALID` | `0 ≤ minPos < maxPos ≤ 100` |
  | `MIN_MOVE_INVALID` | `1 ≤ minMove ≤ range / 2` |
  | `MAX_MOVE_INVALID` | `minMove ≤ maxMove ≤ range`, when set |
  | `MOTION_OUT_OF_RANGE` | speed or acceleration outside 0–255 |
  | `OVERLAPS_EVENT` | |

- **`spanHintRange(lengthS: number, minGapS: number, maxGapS: number): { min: number; max: number }`**
  - `min = floor(T / maxGap) + 1` and `max = floor(T / minGap) + 1`, counting the first change at the start.

## Task

- Write the module and `astros_vue/src/utils/__tests__/spanRules.spec.ts` test-first. Use hand-written literal expectations for every rule and boundary in the spec.
- Floating point: compare and clamp on the 0.1 s grid, rounding to deciseconds, so 0.1 + 0.2 never makes a near-boundary event collide.

## Acceptance criteria

- [ ] **The overlap rule:**
  - a point on a span's end is allowed, and a point on its start or inside it is not;
  - spans that touch are allowed;
  - `ignoreId` lets an edited event keep its own place.
- [ ] **Every clamp in the spec:**
  - from the left and from the right;
  - a span's right edge exactly on an event, and its left edge 0.1 s after one;
  - 0 and 600;
  - an edge stopping at `minLengthS`.
- [ ] **`defaultSpanEnd`:** 5 s with room; cut at the next event; cut at 600; `null` with no room.
- [ ] **`validateSpan`:** each code at its boundary (just valid / just invalid), for GPIO and servo floors, and a blank max move.
- [ ] **`spanHintRange`:** the spec's formula, including a gap range that divides the length exactly.
- [ ] **Mutations:**
  - the half-open rule made closed fails;
  - the 0.1 s left-side offset dropped fails.

## Out of scope

- Any component, store or Pixi change (T-022 to T-024).
- Modelling servo travel time in the hint, which the spec leaves out.

## Verification

- `cd astros_vue && npx vitest run src/utils`, then the full `npx vitest run`.
- `npm run format && npm run lint`, then `npm run build`.

## Implementation checklist

<!-- Added when work starts. -->
