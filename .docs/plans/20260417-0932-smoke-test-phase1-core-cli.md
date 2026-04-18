# Plan: ESP32 smoke-test tool — Phase 1 (core library + CLI)

## Context

This is Phase 1 of the ESP32 smoke-test tool designed during the brainstorm captured at `/home/jeff/.claude/plans/i-want-to-update-refactored-manatee.md`. Phase 1 delivers the independently-shippable core: a scenario-runner library, built-in fixtures for Jeff's bench, seven MVP scenarios, and a CLI that runs them against a real ESP32 master over serial. Phase 2 (web UI cockpit) is a separate future plan.

**Goal of Phase 1:** `npm run smoke -- full-happy-path --confirm` from a shell drives a visible servo movement on the bench, exercising FORMAT_SD → REGISTRATION_SYNC → DEPLOY_CONFIG → DEPLOY_SCRIPT → RUN_SCRIPT → PANIC_STOP, all using the same `MessageGenerator`/`MessageHandler` code that `astros_api` ships.

**Why this matters:** today, firmware iteration requires booting the full AstrOs.Server stack (Vue + Express + SQLite + JWT) and clicking through the UI. Phase 1 replaces that with a single shell command while still sharing production code, so the smoke test breaks if the protocol ever drifts.

## Scope (recap from the full design)

- New sibling directory `astros_smoke_test/` alongside `astros_api/` and `astros_vue/`.
- Top-level `package.json` introducing npm workspaces across the three projects.
- No DB, no auth, no HTTP server in Phase 1 — the CLI talks to the serial port directly via a thin `serialport` wrapper.
- Imports `MessageGenerator`, `MessageHandler`, `MessageHelper`, `SerialMessageType` and the model classes from `astros_api/src/` via a tsconfig path alias (`@api/*`).
- TDD-exempt per `CLAUDE.md` (serial/hardware integration). Unit tests added only for pure logic (scenario composition, fixture registry lookup, CLI argv parsing).

## Task checklist

- [x] **1. Skeleton** *(revised: no workspaces — standalone project)*
  Scaffold `astros_smoke_test/` as a standalone npm project with its own `package.json`, `tsconfig.json` (path aliases `@api/*` and `src/*` both → `../astros_api/src/*` so transitive imports from pulled-in `astros_api` source files resolve), `.eslintrc.cjs` + `.eslintignore` + `.prettierrc.json` + `vitest.config.ts` all matching `astros_api`'s conventions, and an empty `src/index.ts`. No changes at the repo root, no Docker impact. Verify `cd astros_smoke_test && npm install && npm run build` succeeds and `cd astros_api && npm run build` / `cd astros_vue && npm run build` still succeed.

- [x] **2. Transport + runner**
  Implement `src/core/transport.ts` (opens serial port, reads lines delimited by `\n`, writes framed messages) and `src/core/runner.ts` (`ScenarioRunner` class — loads scenario, walks phases `setup → arrange → act → verify → teardown`, emits events: `stepStart`, `stepOk`, `stepFail`, `stepTimeout`, `txBytes`, `rxBytes`). Unit-test the phase-ordering and failure-shortcircuit logic with a fake transport.

- [ ] **3. Atomic operations**
  Implement one operation per serial message type in `src/core/operations/`: `formatSd.ts`, `registrationSync.ts`, `deployConfig.ts`, `deployScript.ts`, `runScript.ts`, `directCommand.ts`, `servoTest.ts`, `panicStop.ts`. Each wraps `MessageGenerator` from `@api/serial/message_generator`, sends over the transport, awaits ACK via `MessageHandler` parsing (with the 5s timeout from `MessageHelper.MessageTimeouts`), returns `{ ok, messageId, ackType, durationMs, rawResponse }`.

- [ ] **4. Fixtures + factory helpers**
  `src/core/fixtures/demo-location.ts` — one `ConfigSync` matching Jeff's bench wiring (master + any padawans, GPIO / Maestro modules). `src/core/fixtures/scripts/wave-hello.ts`, `multi-channel.ts`, `long-runner.ts`. `src/core/fixtures/helpers.ts` with `makeServoPulse(ch, from, to, ms)` and `makeGpioToggle(ch, durMs)`. `src/core/fixtures/index.ts` registry mapping string ID → object.

- [ ] **5. MVP scenarios**
  All seven scenarios in `src/core/scenarios/`: `sync-only`, `format-and-sync`, `config-only`, `full-happy-path`, `direct-command-sweep`, `servo-test-sweep`, `panic-drill`. Each marks its `requiresConfirmation` flag where destructive. `src/core/scenarios/index.ts` auto-discovers exports.

- [ ] **6. CLI wrapper**
  `src/cli/index.ts` parsing argv (no heavy framework — hand-rolled is enough for five flags). Commands: `list`, `<scenario>`. Flags: `--confirm`, `--port`, `--baud`, `--json`. Plain output streams runner events to stdout one line per step with `[phase] opName  ok/fail/timeout  msg=<id>  <durationMs>ms`; `--json` emits one JSON object per event. Non-zero exit on any step failure. Wire `npm run smoke` and `npm run smoke:list` scripts in `astros_smoke_test/package.json`.

## Verification (end-to-end)

Run on a machine with an ESP32 master physically connected.

1. From repo root: `npm install` (workspace install resolves everything).
2. `cd astros_smoke_test && npm run build` — compiles clean.
3. `cd astros_api && npm run build` and `cd astros_vue && npm run build` — still pass (workspace change didn't break them).
4. `npm run smoke -- list` — prints all 7 scenarios with `[destructive]` tags on the four that warrant it.
5. `npm run smoke -- sync-only --port /dev/ttyUSB0` — 1 ACK received from master, exit 0.
6. `npm run smoke -- full-happy-path --confirm --port /dev/ttyUSB0` — 7/7 `ok` steps, bench servo visibly moves during the `runScript` step, exit 0.
7. `npm run smoke -- panic-drill --confirm --port /dev/ttyUSB0` — panic during script run halts movement immediately.
8. `npm run smoke -- sync-only --json` — each event is a parseable JSON object on its own line.
9. Launching AstrOs.Server separately, then re-running `sync-only` — expect the "port in use" error, not a hang.

## Critical files

**New** (all under `astros_smoke_test/`):
- `astros_smoke_test/package.json`, `tsconfig.json`, `.eslintrc.cjs`, `.eslintignore`, `.prettierrc.json`, `vitest.config.ts`
- `astros_smoke_test/src/index.ts` (barrel)
- `astros_smoke_test/src/core/transport.ts`, `runner.ts`
- `astros_smoke_test/src/core/operations/{formatSd,registrationSync,deployConfig,deployScript,runScript,directCommand,servoTest,panicStop}.ts`
- `astros_smoke_test/src/core/fixtures/{demo-location,helpers,index}.ts`
- `astros_smoke_test/src/core/fixtures/scripts/{wave-hello,multi-channel,long-runner}.ts`
- `astros_smoke_test/src/core/scenarios/{sync-only,format-and-sync,config-only,full-happy-path,direct-command-sweep,servo-test-sweep,panic-drill,index}.ts`
- `astros_smoke_test/src/cli/index.ts`

**Reused (unchanged)** from `astros_api/src/`:
- `serial/message_generator.ts`, `message_handler.ts`, `message_helper.ts`, `serial_message.ts`
- `models/config/config_sync.ts`, `scripts/script_run.ts`, `control_module/**`

**Unmodified**: `astros_api/`, `astros_vue/` source code. Only their `package.json` files may be touched to participate in the workspace (if strictly necessary).

## Classification

Full-plan phase. 6 discrete tasks, single layer (the CLI is just a thin argv wrapper over the library). Each task is independently commit-worthy. Task 1 is the riskiest because it introduces workspaces — treat it as a checkpoint and verify all three projects still build before moving on.
