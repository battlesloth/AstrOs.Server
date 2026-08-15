# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AstrOs (Astromech Operating System) is a control system for R2-D2/astromech droids. This repo contains the server: a Node.js/Express API backend + Vue 3 frontend for designing animation scripts, managing microcontroller configurations, and controlling hardware over serial. It runs in Docker on ARM64 SBCs (Raspberry Pi, Orange Pi) and communicates with ESP32 microcontrollers via serial (see companion repo AstrOs.ESP).

## Repository Structure

- **`astros_api/`** — Express/TypeScript backend (API + WebSocket + serial communication)
- **`astros_vue/`** — Vue 3 + Vite frontend (Tailwind CSS + DaisyUI, Pinia stores, PixiJS timeline)
- **`container_files/`** — nginx config for Docker container
- **`deployment/`** — Deployment scripts

## Build & Run Commands

### API Backend (`astros_api/`)

```bash
npm run build          # Lint + compile TypeScript to dist/
npm run start          # Run compiled JS from dist/
npm run start:tsx      # Run TypeScript directly via tsx (dev)
npm run test           # Run vitest (watch mode)
npm run lint:fix       # ESLint fix
npm run prettier:write # Format code
```

### Vue Frontend (`astros_vue/`)

```bash
npm run dev            # Vite dev server (port 5173)
npm run build          # Type-check + Vite build
npm run test:unit      # Vitest (jsdom environment)
npm run test:e2e       # Playwright tests
npm run lint           # ESLint fix
npm run storybook      # Storybook on port 6006
```

### Docker

```bash
docker compose build   # Multi-stage ARM64 build (Vue → API → nginx+node)
docker compose up      # Ports: 8080 (nginx/Vue), 3000 (API), 5000 (WebSocket)
```

## Architecture

### Backend Key Patterns

- **Single monolithic server class**: `api_server.ts` bootstraps Express, WebSocket, passport auth (JWT), and serial port communication in one `ApiServer` class.
- **Serial communication**: A `Worker` thread (`background_tasks/serial_worker.js`) handles async serial messaging. The main thread communicates with it via `postMessage`/`onMessage`. In test mode (`NODE_ENV=test`), serial port setup is skipped.
- **Database**: SQLite via better-sqlite3 + Kysely query builder. In-memory DB for tests, file-based at `~/.config/astrosserver/database.sqlite3` in production. Migrations are registered programmatically in `dal/database.ts`.
- **Route registration**: Each controller exports a `register*Routes(router, authHandler)` function called from `api_server.ts`.
- **Repositories**: Data access in `dal/repositories/` — one per domain (scripts, playlists, locations, controllers, etc.).
- **Environment**: Configured via `.env` file copied to `dist/` at build time. Key vars: `JWT_KEY`, `API_PORT`, `WEBSOCKET_PORT`, `SERIAL_PORT`, `BAUD_RATE`.

### Frontend Key Patterns

- **State management**: Pinia stores in `stores/` — one per domain (scripter, scripts, playlists, controller, location, remoteControl).
- **API layer**: Centralized in `api/apiService.ts` with endpoints defined in `api/endpoints.ts`. Uses axios with JWT token management.
- **PixiJS timeline**: Custom animation timeline editor in `pixiComponents/` — renders channel events, scrollbars, and buttons for the script editor. This is a core UI feature.
- **Routing**: Auth-guarded routes; session checked via API before each navigation.
- **i18n**: Vue-i18n with locale files in `locales/`.
- **Styling**: Tailwind CSS 4 via `@tailwindcss/vite` plugin + DaisyUI 5.

### Domain Model

The system manages **Locations** (physical positions on the droid) that contain **Controllers** (ESP32 boards) with **Modules** (servo, I2C, UART). Users create **Scripts** (animation sequences with timed events per channel) and organize them into **Playlists**. Scripts are deployed to controllers over serial, then triggered to run.

## Pre-commit

Before each implementation commit, run in order:

1. `npm run prettier:write` and `npm run lint:fix` (formatting + lint).
2. `npm run build` (type-check) and the test suite (`npx vitest run` for single-run mode).
3. Invoke `superpowers:requesting-code-review` on the diff against the prior commit (or `origin/<branch>` for a batch of unpushed work). Mechanical checks confirm the code compiles and tests pass; code review catches what tests can't see — comment-vs-code drift, naming-vs-protocol mismatches, missing capabilities, broken test-name format strings, and similar issues that have repeatedly come back as PR feedback when this step is skipped. Address **Critical** and **Important** issues before committing; note **Minor** for later.

**When dispatching the reviewer (step 3):**

- Include the OTHER side of any interface boundary the diff touches (consumer of an enum, worker that receives an envelope, test that pins the contract). The reviewer can't catch contract mismatches it never sees.
- Frame the prompt as "find anything wrong" rather than "verify X works." Pre-framed questions return confirmation of your framing, not the bugs outside it.
- Explicitly request: dead-metadata sweep (declared fields with no read sites), doc-vs-code drift (spec/plan claims that don't match runtime behavior), and contract checks against consumers outside the diff.

**When fixing review findings (partial-fix sweep):**

- The cited line is rarely the only place the bug lives. Before marking a finding "fixed," sweep the related sites for the same drift: file/header docstrings, PR description, README, type-doc claims, sibling tests, test-skip lists. On the firmware-OTA harness branch, "macOS portability" came back across four review rounds because each fix patched the cited code site but left a stale claim somewhere else (header, test skip, PR description).
- Treat doc/header text as code. If feedback says "header claims X but code does Y," fix whichever side is wrong AND verify the other isn't making sibling claims that just slipped past.
- A reviewer flagging the same conceptual issue twice is a signal of an incomplete sweep, not a flaky reviewer. Re-grep the symbol/claim across the module before replying "fixed" the second time.

**Carve-outs that may skip step 3:** task-file-only commits (no source changes), trivial typo / comment-only fixes, and check-off-only updates to a task file or `PLAN.md`. Everything else — including any change to a `.ts` / `.tsx` / test file with logic — requires the review.

## Branching & PRs

All implementation work goes on a feature branch that merges into `develop` via pull request. Never commit directly to `develop` or `main`. `develop` is the integration branch for contributor work; `main` is production.

- Branch naming carries the task ID: `feature/T-NNN-<slug>` (e.g., `feature/T-014-poll-nak-handling`).
- Branch off the latest `origin/develop` at the start of each task. One task per branch — never let a branch accumulate multiple tasks.
- Task files commit to the feature branch too — the "commit the task file first" rule in the Workflow section still applies.
- Open the PR with `gh pr create --base develop` when the work is ready. PR title: `T-NNN: <task title>`; body carries the verification evidence.

**Exception — doc-only changes:** A "doc-only" branch is one whose entire diff is limited to `CLAUDE.md`, `README.md`, `PLAN.md`, `.docs/`, or other prose files — with no `.ts`/`.tsx`/`.vue`/`.css`/`.json` config or asset changes. A task file committed alongside implementation work does NOT make a branch doc-only. Doc-only branches may be committed directly to `develop` and skip the pre-push toolkit; PR overhead isn't justified for pure meta edits.

## Pre-push branch review

Before pushing a feature branch, run a comprehensive multi-agent review on the full diff vs `develop`:

```
/pr-review-toolkit:review-pr
```

**When required:** every PR that touches code, config, or assets — regardless of size, commit count, or which directories it touches. The per-commit reviewer sees one diff at a time; the pre-push run reframes the work as a whole-branch surface, which is where cross-commit drift, missing-test sweeps, and stale-comment regressions surface.

**Carve-out — skip only when the branch is documentation-only** (see definition under "Branching & PRs / Exception — doc-only changes" above).

**What it does.** Dispatches 5 specialized agents in parallel against the full branch diff vs `develop`:

- `code-reviewer`: bug patterns, project-convention adherence
- `pr-test-analyzer`: coverage gaps, vacuous assertions, mutation sensitivity
- `silent-failure-hunter`: swallowed errors, listener leaks, partial-failure cascades
- `type-design-analyzer`: encapsulation, invariant expression
- `comment-analyzer`: comment-vs-code drift, stale references after refactors

**Prompt the agents with hazard categories, not "review this fix."** The per-commit reviewer is framed around the change; the pre-push review must be framed around what could be wrong on the full surface. Categories that have repeatedly shown up in PR feedback on this codebase:

- **Concurrency**: TOCTOU windows, stream chunk boundaries, fixed sleeps masquerading as deterministic waits, missing line buffering on stream parsers, timing-baseline bugs (client-side `Date.now()` when server-side timestamps are in the payload).
- **Operability**: `process.exit` in library code, `close()` calls that hang on unclosed clients, `process.env` mutations across concurrent boots, listener leaks after promise resolves.
- **Resource lifecycle**: PTY cleanup, port allocation (especially "find then bind later" schemes), worker teardown, file-descriptor leaks, env restore vs explicit-config plumbing.

**Address findings.** Critical and Important items must be fixed before push. Minor items may be deferred to a follow-up commit but not silently dropped.

**Why this exists.** Per-commit reviews see narrow diffs and are framed by the specific change; cross-commit drift, architectural patterns, and stale comments-after-refactor only become visible at the full-branch level. Running this skill before push catches in ~10 minutes what would otherwise come back as multiple rounds of PR feedback churn.

## Workflow (MANDATORY)

**NEVER write implementation code without a committed task file.** Quick-tier fixes are the only exception. Rationale and templates: [`.docs/agentic-workflow.md`](./.docs/agentic-workflow.md).

### Session ritual

- **Open:** read `PLAN.md` (repo root) and state current status — active project, in-progress task, what's next — before touching code.
- **Close:** update the `PLAN.md` Status block; append a Log entry (dated header + short sub-bullets) for any completed task. Quick fixes stay out of the Log. A session that ends without this is not finished.
- `PLAN.md` is authoritative over agent memory: when they disagree, `PLAN.md` wins.

### Three tiers

- **Quick** — small, minimally invasive fixes during bench testing or feature review (CSS, copy, spacing, typos). No artifact; fix directly on the active branch. If it grows, stop and promote to a task.
- **Task** — anything else that passes the five sizing rules as one unit. One file: `.docs/tasks/T-NNN-<slug>.md` from [`.docs/templates/task.md`](./.docs/templates/task.md).
- **Project** — work that fails the sizing rules. Run a seam-discovery session (`superpowers:brainstorming`) to split it into task files + a `PLAN.md` section before implementing anything.

### Task rules

- The task file's Context / Contract / Task / Acceptance criteria / Out of scope / Verification sections are written and **committed before implementation code**. The Implementation checklist is added when work starts; check off + commit as work proceeds.
- **Sizing rules** (all must hold, else split): one session with headroom; zero unmade architectural decisions; independently verifiable; pinned interfaces; a diff small enough that it will actually be read.
- Treat the **Contract** section as immutable. If it seems wrong, stop and raise it — do not adapt it silently. If a needed contract doesn't exist, designing it is its own task.
- Respect **Out of scope**. Adjacent improvements go in a note or the `PLAN.md` Backlog, not the diff.
- Never make an architectural decision mid-task. If one surfaces, stop, state the options, and wait.
- A task is done only when its **Verification** section runs green — never claim completion without running it. Done also includes updating the owning feature's QA plan in `.docs/qa/`, moving the task file to `.docs/tasks/completed/`, and flipping the `PLAN.md` checkbox.
- If the diff is ballooning past what the task implies, stop and propose a split.

### Failure-mode inventory — for high-stakes modules

For modules involving filesystem state, concurrency, network I/O, crash-recovery, or cross-process state, fill out a **failure-mode inventory** in the task file before writing implementation code. Template at [`.docs/templates/failure-mode-inventory.md`](./.docs/templates/failure-mode-inventory.md). The c.4 firmware cache hit ~10 PR-feedback rounds catching real bugs (Windows rename, hung downloads, mismatched-bytes hit, unbounded garbage) that the inventory's error-coverage and crash-recovery sections would have surfaced upfront. Skip for simple CRUD endpoints or pure-compute modules.

## QA Test Plans

For each feature, create a manual QA test plan in `.docs/qa/` with a descriptive filename (e.g., `auth-login.md`, `setup-wizard.md`). Each plan should include:

- **Preconditions**: required state/setup before testing
- **Step-by-step test cases**: numbered steps with specific user actions
- **Expected results**: what should happen after each step or group of steps
- **Edge cases / negative tests**: invalid inputs, error states, boundary conditions

QA plans should be committed alongside the feature work they cover. Completing a task includes updating the owning feature's QA plan (or creating it if the feature is new) — the feature plans are the living regression suite; there is no per-task QA intermediate.

## Skills & Subagents

Use the following skills and subagents as part of the development workflow:

- **Brainstorming** (`superpowers:brainstorming`): Always brainstorm before building new features — this is also the vehicle for seam-discovery sessions that decompose project-tier work into tasks.
- **Write Plan** (`superpowers:writing-plans`): Use when authoring project-tier task sets. The output lands as task files in `.docs/tasks/` (template: `.docs/templates/task.md`), not standalone plan documents.
- **Execute Plan** (`superpowers:executing-plans`): Use to execute written implementation plans with review checkpoints.
- **TDD** (`superpowers:test-driven-development`): Write tests before implementation code for features and bug fixes. **Exceptions**: serial/hardware integration code, PixiJS rendering code, and UI layout work where the feedback loop is inherently manual — for these, write tests after implementation where feasible, or rely on manual QA.
- **Frontend Design** (`frontend-design:frontend-design`): Use for all Vue component and page work to produce polished, production-grade UI.
- **Feature Dev** (`feature-dev:feature-dev`): Use for guided feature development with codebase understanding and architecture focus.
- **Debugging** (`superpowers:systematic-debugging`): Use systematic debugging for any bug, test failure, or unexpected behavior before proposing fixes.
- **Verification** (`superpowers:verification-before-completion`): Always verify before claiming work is done or creating a PR. Run tests and confirm output — evidence before assertions.
- **Code Review** (`superpowers:requesting-code-review`): Run **before every implementation commit** (between tests-passing and `git commit`) — same workflow slot as prettier / lint. Mechanical checks miss comment-vs-code drift, missing capabilities, protocol-shape mismatches, and broken test-name format strings; the reviewer subagent catches them. See the Pre-commit section for the carve-outs that may skip it.
- **Parallel Agents** (`superpowers:dispatching-parallel-agents`): Use parallel agents for independent tasks that can be worked on without shared state or sequential dependencies.

## Internationalization (i18n)

- **Never hardcode user-facing strings.** Use `$t('key')` in templates or `t('key')` from `useI18n()` in script setup.
- Locale files are in `astros_vue/src/locales/`. `enUS.json` is the source of truth.
- Use named interpolation for dynamic values: `t('setup.complete.message', { email })` with `{email}` in the JSON.
- Group keys by feature/view: `auth.*`, `setup.*`, `nav.*`, `home.*`, etc.

## Accessibility (a11y)

- All interactive elements (buttons, links, inputs) must have accessible names — via visible text, `aria-label`, or `aria-labelledby`.
- Decorative images/icons: add `aria-hidden="true"`. Meaningful images: add `alt` text.
- Forms: every input must have an associated `<label>` with matching `for`/`id`.
- Error and status messages: use `role="alert"` or `aria-live="polite"` so screen readers announce them.
- Landmarks: use semantic HTML (`<header>`, `<nav>`, `<main>`, `<aside>`) with `aria-label` when there are multiple of the same landmark.
- Headings: maintain hierarchy (h1 → h2 → h3). Each page should have exactly one `<h1>` describing the page purpose.
- Focus management: when content changes dynamically (e.g., wizard steps), move focus to the new content.
- Skip link: `AppLayout` should include a skip-to-main-content link for keyboard users.
- `<html lang="">` attribute must reflect the active locale (handled by the language switcher).
