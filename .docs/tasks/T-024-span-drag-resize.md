# T-024: Drag and resize spans, stopping at the boundary

<!-- File: .docs/tasks/T-024-span-drag-resize.md. Branch: feature/T-024-span-drag-resize. PR title: "T-024: Drag and resize spans". -->

## Context

- **Spec:** `.docs/specs/20261022-0748-random-span-events-design.md` § Scripter / Interaction: dragging, the overlap rule, and every path stopping at the boundary.
- **Project:** PLAN.md § Random span events, Phase B. Needs T-021 (the clamps) and T-023 (the bar).
- **Today's drag:** `useEventBoxes.handleEventBoxDrag` writes the time into the store on every pointer move. Every path here keeps that behaviour: it stops at a boundary and never snaps back.

## Contract (pinned — do not change)

- **Body drag** moves the whole span, keeping its length. The new start is `clampSpanMove(…)` (T-021).
- **Edge drag** moves only that edge. The new time is `clampSpanEdge(…)`, with `minLengthS` set to the span's min gap.
  - The edge hit zones are about 8 px, with an `ew-resize` cursor.
  - A bar drawn narrower than about 24 px is body-drag only, and is resized in its dialog.
- **Point events** dragged toward a span stop by `clampPointTime(…)`. This replaces the free drag for every point on a channel that has spans.
- **Timeline bounds:** every drag stops at 0 and 600 s.
- **Edits reach the store** the way today's drag does: on every pointer move, and once on release.

## Task

- **The drag modes** in `useEventBoxes.ts`, `PixiSpanEvent` and the point box: body, start edge, end edge and point. Hit-testing for the edges, and the cursor changes.
- **Pure logic stays in T-021's helpers.** A small `spanDragMode(localX: number, barWidthPx: number): 'body' | 'start' | 'end'` in `utils/spanRules.ts` gets a unit test for the 8 px zones and the 24 px threshold.
- **QA:** `.docs/qa/random-span-events.md` gains the drag cases:
  - body drag into a point from either side;
  - each edge into a point and into a span;
  - shrinking to the min gap;
  - the timeline ends;
  - a narrow bar at far zoom-out.

## Acceptance criteria

- [ ] Every drag stops at the boundary in the spec, by hand at two zoom levels. The values in the store match the T-021 clamps.
- [ ] The `spanDragMode` spec passes, at the zone edges and the threshold.
- [ ] Point-event drag on a channel without spans behaves exactly as before.
- [ ] The QA cases are added.

## Out of scope

- Multi-select or group drag.
- Snapping to other channels' events.
- Undo.

## Verification

- `cd astros_vue && npx vitest run`; `npm run format && npm run lint`; `npm run build`.
- **By hand in the scripter:** the QA drag cases. After each drag, save and reload: the span's times are unchanged, and the API returns no 400.

## Implementation checklist

<!-- Added when work starts. -->
