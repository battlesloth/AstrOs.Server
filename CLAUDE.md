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

Always run lint and prettier before making a commit to ensure consistent formatting.

## Planning (MANDATORY)

**NEVER write implementation code without a written, committed plan.** This is a hard rule, with the exceptions below.

### Quick feedback mode

No plan is required for small, minimally invasive changes made while reviewing a completed feature. Examples: CSS tweaks, wording/copy changes, spacing fixes, color adjustments, typo corrections. Just make the change directly. If a "quick" change starts growing in scope, stop and write a plan.

### Light plan mode

For medium-sized changes that are straightforward but span more than a trivial tweak — e.g., adding a new API endpoint with a store and view, or a self-contained bug fix touching 2-3 files — use a light plan:

1. Write a brief plan (a short description + a checklist of 3-5 tasks) and save to `docs/plans/` with the same naming convention.
2. **Commit the plan file before writing implementation code.**
3. Check off tasks as completed and commit updates.

Light plans skip the brainstorming skill and don't require a scope guard evaluation. If the plan grows beyond ~5 tasks or starts spanning many layers, escalate to a full plan.

### Full plan workflow

For larger features or work that spans multiple layers:

1. Brainstorm the feature with the user (using `superpowers:brainstorming`).
2. Write the plan using `superpowers:writing-plans` and save to `docs/plans/` with a timestamped filename including time (e.g., `20260327-1500-feature-name.md` using `YYYYMMDD-HHmm` format).
3. The plan must include a checklist of discrete tasks with checkboxes (`- [ ]`). Each task should be small enough to complete and commit independently.
4. **Commit the plan file to the repo before writing any implementation code.** This ensures the plan survives crashes, context loss, or session restarts.
5. As each task is completed, update the plan file to check off the box (`- [x]`) and commit the update. This makes the plan the single source of truth for progress.
6. If a session is interrupted, the next session should read the plan file to determine what has been done and what remains.

### Scope guard — break up large work

During planning, evaluate the total scope. If a feature involves **more than ~8 discrete tasks**, or spans **3+ layers** (migration + API + shared types + store + UI + tests + QA), it is probably too large for a single plan. In that case:

- **Warn the user** that the work should be broken into phases.
- **Propose separate plan files** for each phase (e.g., `20260330-study-crud-phase1-api.md`, `20260330-study-crud-phase2-ui.md`).
- Each phase should be independently shippable and testable.
- Get user approval on the phasing before proceeding.

## QA Test Plans

For each feature, create a manual QA test plan in `docs/qa/` with a descriptive filename (e.g., `auth-login.md`, `setup-wizard.md`). Each plan should include:

- **Preconditions**: required state/setup before testing
- **Step-by-step test cases**: numbered steps with specific user actions
- **Expected results**: what should happen after each step or group of steps
- **Edge cases / negative tests**: invalid inputs, error states, boundary conditions

QA plans should be committed alongside the feature work they cover.

## Skills & Subagents

Use the following skills and subagents as part of the development workflow:

- **Brainstorming** (`superpowers:brainstorming`): Always brainstorm before building new features. Explore intent, requirements, and design before writing code.
- **Write Plan** (`superpowers:writing-plans`): Write a plan before any multi-step implementation. Save plans to `docs/plans/`.
- **Execute Plan** (`superpowers:executing-plans`): Use to execute written implementation plans with review checkpoints.
- **TDD** (`superpowers:test-driven-development`): Write tests before implementation code for features and bug fixes. **Exceptions**: serial/hardware integration code, PixiJS rendering code, and UI layout work where the feedback loop is inherently manual — for these, write tests after implementation where feasible, or rely on manual QA.
- **Frontend Design** (`frontend-design:frontend-design`): Use for all Vue component and page work to produce polished, production-grade UI.
- **Feature Dev** (`feature-dev:feature-dev`): Use for guided feature development with codebase understanding and architecture focus.
- **Debugging** (`superpowers:systematic-debugging`): Use systematic debugging for any bug, test failure, or unexpected behavior before proposing fixes.
- **Verification** (`superpowers:verification-before-completion`): Always verify before claiming work is done or creating a PR. Run tests and confirm output — evidence before assertions.
- **Code Review** (`superpowers:requesting-code-review`): Request a code review after completing significant features or before merging.
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
