# Agentic Development Workflow

**Scope:** how work gets decomposed, sized, tracked, and verified in this repo when the implementer is a coding agent (Claude Code). This doc owns the rationale; `CLAUDE.md` carries the condensed standing orders loaded every session. Adopted 2026-08-14, adapted from the VTT project's workflow doc.

---

## 1. Sizing replaces estimating

Story points estimate human effort; agents don't have velocity in that sense. What survives from estimation is the thing points secretly enforced: a **complexity cap on any single unit of work**. For humans the failure mode of an oversized story is schedule overrun. For agents it's **context exhaustion and drift** — too many concerns in one session, earlier decisions fall out of the working set, and the agent quietly contradicts itself. Agents don't run out of weeks; they run out of coherent context.

Decomposition keeps its second job: **forced design thinking**. Splitting a big task is how the seams get discovered, and the seams are where the design lives.

### The five sizing rules

A task is correctly sized when **all** of these hold. If any fails, decompose further.

1. **One session, with headroom.** The task fits comfortably in a single focused agent session.
2. **Zero unmade architectural decisions.** Implementation choices only. If an architectural decision lurks inside, split until it surfaces as its own human-reviewed step. Decisions surface to Jeff; they don't get made mid-implementation.
3. **Independently verifiable.** A concrete check proves the task is done: tests pass, a bench behavior holds, a command produces a specific result. **Verifiability is to agents what estimability is to humans** — an unverifiable task is one an agent can plausibly hallucinate completing. Verification is written down before work starts.
4. **Pinned interfaces.** The contracts the task touches are fixed before it begins. In this repo the hardest contracts cross the repo boundary: `SerialMessageType` and the wire protocol must match AstrOs.ESP firmware, and remote-config JSON must stay M5Stack-compatible. If a contract doesn't exist yet, the *first* task is "design and pin the contract" — a review-gated task producing a document, not code.
5. **Reviewable by the human.** Small enough that Jeff will actually read the diff. Review capacity is the bottleneck, not generation capacity.

---

## 2. Three tiers

| Tier | When | Artifact |
|------|------|----------|
| **Quick** | Small, minimally invasive fixes during bench testing or feature review — CSS, copy, spacing, typos | None. Fix it on the active branch. If it grows, stop and promote to a task. |
| **Task** | Anything else that passes the five sizing rules as one unit | One file: `.docs/tasks/T-NNN-<slug>.md` |
| **Project** | Work that fails the sizing rules and must split into multiple tasks | A `PLAN.md` section + a seam-discovery session producing several task files |

Quick-tier changes don't appear in `PLAN.md` — git history covers them.

---

## 3. The backlog lives in the repo

Task descriptions are effectively **prompts**, so they belong versioned next to the code, written with agent-grade context. A three-line card is a bad prompt.

- **`PLAN.md`** at repo root: the authoritative status view (format in §5). Replaces the old `current_project.md` tracker.
- **`.docs/tasks/`**: one markdown file per open task. On completion (verified, merged, checkbox flipped) the file moves to `.docs/tasks/completed/`. It remains the record of what was asked for — useful when a regression appears.
- Task IDs are `T-NNN`, allocated sequentially (next = max existing anywhere in `.docs/tasks/` including `completed/`, plus 1). The ID links file → branch (`feature/T-NNN-<slug>`) → PR title (`T-NNN: <title>`) → `PLAN.md` checkbox → Log entry.

### Task file template

Template at [`.docs/templates/task.md`](./templates/task.md). Sections:

- **Context** — why this work exists; links to specs, log analyses, bench findings.
- **Contract (pinned — do not change)** — the interfaces this task touches but must not alter. If the contract seems wrong, stop and raise it; never adapt it silently.
- **Task** — what to do, stated tightly.
- **Acceptance criteria** — checkboxes the agent ticks as each is verified, before the PR opens.
- **Out of scope** — not decoration: the guardrail that keeps an agent from "helpfully" wandering into adjacent work and colliding with a task that hasn't happened yet. Adjacent improvements go in a note, not the diff.
- **Verification** — the concrete commands/bench checks that prove completion. Written before work starts.
- **Implementation checklist** — added when work *starts* (not at authoring time); checked off and committed as work proceeds. This replaces the old separate plan file: card and plan are one document.

Everything above the checklist is written and committed **before implementation code** — that is the "commit the plan first" rule in its new form. For modules involving filesystem state, concurrency, network I/O, crash-recovery, or cross-process state, the task file also gets a failure-mode inventory (see `CLAUDE.md`).

### QA lifecycle

Completing a task includes updating the owning feature's manual QA plan in `.docs/qa/` (creating it if the feature is new) — hands-on steps with expected results, runnable by someone who didn't build it. There is no per-task QA intermediate; the feature plans are the living regression suite.

### Review gates (unchanged)

Pre-commit review (`superpowers:requesting-code-review`) and the pre-push toolkit (`/pr-review-toolkit:review-pr`) run exactly as specified in `CLAUDE.md`. Copilot review on a PR is Jeff's manual option at the gate, not a standing rule.

---

## 4. Decomposition workflow (project tier)

Per project (or project phase), before any implementation:

1. **Seam-discovery session** (Jeff + agent, via `superpowers:brainstorming`): split the scope against the five sizing rules until every piece passes. Design questions surfacing here is the point. Contracts get pinned into `.docs/` (protocol docs, specs).
2. **Write the task files** — each with context, pinned contract, acceptance criteria, out-of-scope, verification.
3. **Order by dependency**, noting which tasks pin contracts later tasks consume.
4. **Implement one task per session.** Fresh session per task unless tasks are trivially small and share context.
5. **Review gate per task**: Jeff reads the diff on the PR, verification runs green, `PLAN.md` checkbox flips. No batching reviews across tasks — that reintroduces the oversized diff through the back door.

**Rolling wave, one phase deep.** Fully decompose a phase at its start, not before — task files written ahead of their contracts and spike results are thin cards. Future phases stay as scope lines in `PLAN.md`. Exception: **cross-phase and cross-repo contracts pin early** (serial protocol changes shared with AstrOs.ESP, DB migration shapes) — contracts early, tickets late.

---

## 5. PLAN.md and the session ritual

Project state must be **externalized into an artifact the agent maintains as part of every task's definition of done**. Agent output is bursty and sessions are discontinuous; Jeff's memory doesn't grow because the codebase did. `PLAN.md` is the human's primary interface to the project — and the agent's, since per-machine agent memory is now a cache: **when memory and `PLAN.md` disagree, `PLAN.md` wins.**

Format:

```markdown
## Status
Active:  <project + phase, or "none">
Now:     <T-NNN in progress, or "—">
Next:    <what follows>
Blocked: <blockers incl. cross-repo (AstrOs.ESP) waits, or "none">
Last:    <date — last completed outcome>

## <Active project name>
- [x] T-011 ...
- [ ] T-012 ...

## Standalone tasks
- [ ] T-014 ...

## Backlog (unscheduled candidates)
- <idea / finding — not yet a task file>

## Log
- YYYY-MM-DD T-NNN: <title>
  - <short sub-bullets, one idea each>
```

- **Verified tasks are the unit of progress** — not lines, commits, or sessions.
- The **Log** is append-only: one dated entry per completed task, plus process/tooling changes. Review rounds on an open PR are not logged individually — that detail survives in PR threads and branch commits. Quick-tier fixes stay out entirely.
- **Backlog** is the inbox for findings and ideas that aren't yet task files (no contract, no verification). Promoting one to a task means writing its file and giving it an ID.

**Session ritual:**

- **Open:** read `PLAN.md`, state status back (active project, in-progress task, next) before touching code. If the summary surprises Jeff, something is wrong *before* any code is written.
- **Close:** update the Status block; append the Log entry for any completed task. A session that ends without this is not finished.

---

## 6. Branching

The existing model in `CLAUDE.md` (feature branches off `develop`, PR to `develop`, Jeff merges, merge commits) already provides the property this workflow needs: one task = one branch = one reviewable diff, and `git log --first-parent develop` reads as the task log. The only changes:

- Branch naming carries the task ID: `feature/T-NNN-<slug>`.
- PR titles carry it too: `T-NNN: <title>`, with verification evidence in the body.
- One task per branch — a branch quietly accumulating several tasks is batched review wearing a git costume.

Merging remains Jeff's act; the agent never pushes (Jeff pushes via VS Code). The doc-only direct-to-`develop` carve-out is unchanged.

---

## 7. Anti-patterns

- **Estimating anyway.** The only estimate that matters is one-session / not-one-session.
- **Thin cards.** "Fix the remote" as a task with no contract, criteria, or scope fence — the agent fills gaps with plausible inventions.
- **Batched review.** Letting several tasks land, then reviewing. Recreates the 2,000-line diff the sizing rules exist to prevent.
- **Contract design smuggled into implementation tasks.** The most expensive agent failure is a confidently implemented wrong contract — doubly so here, where the other side of the contract is firmware in another repo.
- **Status in agent memory.** Memory is per-machine and silently drifts (the Remote Redesign tracker was three shipped phases behind reality at bootstrap). Status lives in `PLAN.md`; memory holds only non-repo facts.
- **A session that ends without updating `PLAN.md`.** That's how the drift starts.
