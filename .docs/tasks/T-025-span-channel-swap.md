# T-025: Convert random spans when swapping GPIO and Maestro digital channels

<!-- File: .docs/tasks/T-025-span-channel-swap.md. Branch: feature/T-025-span-channel-swap. PR title: "T-025: Convert random spans on channel swap". -->

## Context

- **Spec:** `.docs/specs/20261022-0748-random-span-events-design.md` § Scripter / Channel swap.
- **Project:** PLAN.md § Random span events, Phase B. Needs T-022.
- **Today:** `useEventConverter` converts point events between ESP GPIO and Maestro digital channels. It throws "Converting random spans between channel types is not supported yet" for any span (T-007), so swapping a channel that has a span fails.

## Contract (pinned — do not change)

- **ESP GPIO ↔ Maestro digital (`isServo = false`):**
  - spans convert, keeping their `time`, `endTime` and gaps;
  - `RandomGpioEvent { minGapMs, maxGapMs }` ↔ `RandomMaestroEvent` with the target channel's `channel`, `isServo: false`, the same gaps, and the other fields at 0 / `null`.
- **Gap floors:** both kinds share the 0.02 s floor, so no gap changes. A span whose gaps are valid on one side is valid on the other.
- **Every other pair** (servo ↔ anything, and other module types) keeps today's behaviour: it throws for unsupported pairs. A Maestro servo span is never converted.
- **Overlap:** a swap moves a channel's events as they are. It doesn't re-check overlap, because the target lane gets exactly the source lane's events.

## Task

- **`composables/useEventConverter.ts`:** convert spans per the Contract, and drop the blanket span throw for the GPIO ↔ digital pair.
- **Specs:** `useEventConverter.spec.ts`:
  - each direction keeps the times and gaps;
  - the payload fields;
  - a servo span still throws;
  - mixed lanes of points and spans.
- **QA:** `.docs/qa/random-span-events.md` gains a swap case.

## Acceptance criteria

- [ ] Both directions convert spans as pinned (spec), and a servo span still throws.
- [ ] Mutation: drop the gap copy, and the spec fails.
- [ ] By hand: swap a lane with a GPIO span to a Maestro digital channel and back, saving and uploading each time. There's no 400 and no span-skip warning.
- [ ] The QA case is added.

## Out of scope

- Servo span conversion (not in the spec).
- Any change to the swap dialog.

## Verification

- `cd astros_vue && npx vitest run`; `npm run format && npm run lint`; `npm run build`.
- The by-hand swap above, on a dev DB copy.

## Implementation checklist

<!-- Added when work starts. -->
