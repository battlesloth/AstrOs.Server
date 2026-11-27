# T-023: Draw a random span as a bar on the timeline

<!-- File: .docs/tasks/T-023-span-bar.md. Branch: feature/T-023-span-bar. PR title: "T-023: Draw a random span as a bar on the timeline". -->

## Context

- **Spec:** `.docs/specs/20261022-0748-random-span-events-design.md`, § Scripter / The bar ("mockup option A", Jeff's pick) and the "clicking inside a span" rule under Interaction.
- **Project:** PLAN.md § Random span events, Phase B. Needs T-022 (spans can be created).
- **PixiJS rendering** is a CLAUDE.md TDD exception, so this is verified by hand. Logic that can be tested (width, the summary text) lives in pure functions with unit tests.

## Contract (pinned — do not change)

- **A new `PixiSpanEvent`** class in `astros_vue/src/pixiComponents/pixiSpanEvent.ts`.
  - It follows `PixiChannelEvent`'s pattern: it extends `Container`, and its `destroy()` is idempotent behind `isDestroyed`.
  - It is held in a `shallowRef` (memory: Pixi refs need `shallowRef`).
- **Size and position:**
  - the left edge is the span's start, with no centring;
  - the width is `(end − start) / 600 × TIMELINE_WIDTH`, recomputed on every zoom in the existing `updateEventBoxPositions` pass;
  - it has the same light box and dark border as other events.
- **Contents:**
  - a left icon zone with a new "random" glyph (an asset in `pixiComponents/assets/`) and the channel-type icon (servo, or the up/down arrows for GPIO);
  - summary text that truncates when the bar is narrow:
    - servo: "Random · every 0.4–2.0 s / pos 20–100% · move 15–60%";
    - GPIO: "Random · toggle every 0.05–0.40 s";
  - for servos, a shaded horizontal band showing the min–max position range.
- **The summary text** comes from a pure `spanSummary(event: ScriptEvent, t): string` in `astros_vue/src/utils/spanSummary.ts`, built from i18n strings.
- **Clicking the bar** opens that span's edit dialog (T-022). The bar consumes the tap, as event boxes do, so it never adds an event.
- **`useEventBoxes`** creates a `PixiSpanEvent` for an event with `endTime !== null` and a `PixiChannelEvent` otherwise. Every add, remove, rebuild and position path handles both.

## Task

- The class, the asset, the `useEventBoxes` and `AstrosPixiView.vue` wiring, and `spanSummary` with its spec (each kind, a blank max move, and digital Maestro).
- **QA:** `.docs/qa/random-span-events.md` gains the bar cases: rendering, zoom, narrow bars and click-to-edit.

## Acceptance criteria

- [ ] **Bars:** each kind of span draws as a bar at the right place and width, at every zoom level, with its summary and, for servos, the band.
- [ ] **Clicking a bar** opens its dialog and never adds an event.
- [ ] **Teardown:** deleting the span or its channel, or reloading the script, removes the bar with no Pixi errors in the console (destroy is idempotent).
- [ ] The `spanSummary` spec passes.
- [ ] The QA cases are added.

## Out of scope

- Dragging and resizing (T-024).
- Any change to point-event boxes.

## Verification

- `cd astros_vue && npx vitest run`; `npm run format && npm run lint`; `npm run build`.
- **By hand in the scripter** (Chromium; a dev DB copy with spans of each kind):
  - zoom through every level;
  - click each bar;
  - delete a span;
  - delete a channel that has spans;
  - switch scripts.

## Implementation checklist

<!-- Added when work starts. -->
