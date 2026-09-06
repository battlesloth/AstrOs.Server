# T-NNN: <imperative title — what this task accomplishes>

<!-- File: .docs/tasks/T-NNN-<slug>.md. Branch: feature/T-NNN-<slug>. PR title: "T-NNN: <title>".
     Everything above "Implementation checklist" is written and committed BEFORE implementation code.
     Sizing rules and rationale: .docs/agentic-workflow.md §1. -->

## Context

<!-- Why this work exists. Link specs, bench findings, log analyses, the PLAN.md project section. -->

## Contract (pinned — do not change)

<!-- Interfaces this task touches but must not alter: serial protocol enums (must match AstrOs.ESP),
     WS message shapes, DB schemas, function signatures, M5Stack-compatible JSON. If a contract this
     task needs doesn't exist yet, STOP — designing it is its own task. If a pinned contract seems
     wrong mid-task, stop and raise it; never adapt it silently. -->

## Task

<!-- What to do, stated tightly. One session's worth, zero architectural decisions. -->

## Acceptance criteria

<!-- Agent ticks each box as it is verified, before the PR opens. Human-gated criteria
     (bench sign-off) are ticked at post-merge upkeep. -->

- [ ]
- [ ]

## Out of scope

<!-- The fence. Adjacent improvements observed during work go in a note (or the PLAN.md Backlog),
     not the diff. Name the tasks that own the excluded work if they exist. -->

## Verification

<!-- Concrete, runnable proof of completion, written before work starts.
     e.g.: `npx vitest run <path>` green; bench: <action> → <observable result>. -->

## Failure-mode inventory

<!-- Only for high-stakes modules (filesystem state, concurrency, network I/O, crash-recovery,
     cross-process state) — fill from .docs/templates/failure-mode-inventory.md. Delete otherwise. -->

## Implementation checklist

<!-- Added when work STARTS, not at authoring time. Check off + commit as work proceeds. -->

- [ ]
