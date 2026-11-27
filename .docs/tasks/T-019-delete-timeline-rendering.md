# T-019: Delete the unused timeline-rendering module

<!-- File: .docs/tasks/T-019-delete-timeline-rendering.md. Branch: feature/T-019-delete-timeline-rendering. PR title: "T-019: Delete the unused timeline-rendering module". -->

## Context

- **Found by:** the review of the T-017 Backlog with Jeff (2026-11-27). T-018's type review had named `drawTimelineTicks` (7 parameters, 5 adjacent numbers) as the one Pixi helper where a silent swap was plausible.
- **What turned out to be true:** `astros_vue/src/pixiComponents/timelineRendering.ts` is imported by nothing. All three of its exports are dead code: `drawTimelineBackground`, `drawTimelineTicks` and `drawTimelineLabels`. It was last touched in a "check point" commit (`ad5812a3`).
- **What runs instead:** the scripter timeline uses `pixiTimeline.ts`'s own `drawTimelineTicks(graphics, zoom)` and `drawTimelineLabels(container, zoom)` methods, which take a `ZoomLevelConfig` object, not positional numbers.
- **Decision (Jeff, 2026-11-27):** delete the module, after T-018.

## Contract (pinned — do not change)

- **No runtime behavior change.** The scripter timeline renders exactly as before.
- **Only `timelineRendering.ts` is deleted.** `pixiTimeline.ts` and every other file stay as they are, apart from removing references to the deleted file, if any turn up.

## Task

- Delete `astros_vue/src/pixiComponents/timelineRendering.ts`.
- Grep the whole repo for `timelineRendering`, `drawTimelineBackground` and the two helper names (code, stories, specs, docs). Remove only references to the deleted module; the `pixiTimeline.ts` methods of the same names stay.

## Acceptance criteria

- [ ] `grep -rn "timelineRendering" astros_vue/src` finds nothing.
- [ ] The Vue build (type-check), the unit tests and lint pass.
- [ ] The scripter timeline looks the same: ticks, labels and zoom levels (a manual check, since this is PixiJS code; CLAUDE.md TDD exceptions).

## Out of scope

- Any change to `pixiTimeline.ts` or other Pixi components.
- Other dead code (a separate sweep if wanted).

## Verification

- **Vue:** `cd astros_vue && npx vitest run`; `npm run format && npm run lint`; `npm run build`.
- **By hand:** `npm run dev`, open a script in the scripter, and step through the zoom levels. The ticks and labels match a build from before the deletion.

## Implementation checklist

<!-- Added when work starts. -->
