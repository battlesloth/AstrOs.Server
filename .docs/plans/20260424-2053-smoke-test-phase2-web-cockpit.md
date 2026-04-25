# Plan: ESP32 smoke-test tool — Phase 2 (web cockpit)

## Context

Phase 1 (`.docs/plans/20260417-0932-smoke-test-phase1-core-cli.md`) shipped the scenario-runner library, seven MVP scenarios, and a CLI in `astros_smoke_test/`. Bench-tested four times with stable memory; surfaced and helped fix real protocol/firmware issues (FORMAT_SD timeout, FreeRTOS stack HWMs, GPIO seed model).

Phase 2 adds a localhost web cockpit so the bench-test loop is faster and observability is better. Two priorities, in order:

1. **Primary** — one-click scenario triggering. Eliminates remembering scenario names + flag combinations on the CLI; pick from a list, optionally tick `--confirm`, click run.
2. **Secondary** — chronological TX/RX history. See the actual framed serial bytes alongside the step-level events the CLI already prints, in the order they happened.

Out of scope: composing ad-hoc commands without writing TS code, remote-bench (running on the Pi while observing from a laptop), authentication, multi-user, persistent run history.

## Confirmed decisions

- **Implementation weight: Vue 3 SPA, no Tailwind/DaisyUI.** Lightweight CSS keeps the build chain simple. Vue earns its keep on the chronological transcript (reactivity matters once messages stream in).
- **Localhost-only, no auth.** Same threat model as the CLI.
- **Lives entirely inside `astros_smoke_test/`.** No coupling to `astros_api` or `astros_vue` at runtime — same purity rule that justified Phase 1.
- **Three-panel layout** (scenarios L / transcript C / inspector R) plus a top bar.
- **Tabbed transcript history** — each scenario run gets its own tab; a `Background` tab holds bytes outside a run (firmware boot logs, ESP-NOW chatter).
- **Inspector model: live-tail + click-to-pin.** Auto-follows latest TX/RX; clicking a transcript row pins that message; an unpin button resumes the tail.
- **Three-mode inspector toggle** — `Decoded` / `Raw` / `Both`, preference persisted in `localStorage`.
- **Serial port: picker + held open across runs.** Top bar has a port dropdown (from `serialport.list()`) and Connect/Disconnect; port stays open between runs so background bytes flow into the inspector.

## Architecture

### Runtime model

Single Express server bound to `localhost:5174` for everything — API, SSE event channel, and the SPA itself. In dev, Express imports Vite as middleware so HMR + `.vue` compilation work without a second port. In prod (`npm run web:build && npm run web`), Vite emits static assets to `dist/web/` and Express serves them. One URL across dev and prod.

Cockpit reuses Phase 1's TypeScript exports without duplication:
- `ScenarioRunner` from `src/core/runner.ts` — drives scenarios.
- `SerialTransport` from `src/core/transport.ts` — the open port.
- `scenarios` registry from `src/core/scenarios/index.ts` — list + factories.
- `discover()` from `src/cli/discovery.ts` — startup MAC discovery.
- `MessageHandler` (re-exported from `astros_api/src/serial/message_handler.ts` via `@api/*` alias) — decoded view rendering.

### API surface

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/ports` | `serialport.list()` → `[{ path, manufacturer, ... }]` |
| `GET` | `/api/scenarios` | `[{ id, description, requiresConfirmation }]` from registry |
| `GET` | `/api/state` | `{ connected, port, baud, activeRunId }` for top-bar hydration |
| `POST` | `/api/connect` | Body `{ port, baud }` — opens transport; runs discovery; emits `connected` event. Returns 409 with readable message if port is in use. |
| `POST` | `/api/disconnect` | Closes transport; emits `disconnected`. |
| `POST` | `/api/run/:id` | Body `{ confirm }` — kicks off a scenario; returns `{ runId }`. 409 if a run is already active. |
| `POST` | `/api/panic` | Fires `PANIC_STOP` immediately, bypassing scenario runner. |
| `GET` | `/api/events` | SSE channel — emits all runner + connection events. |

### SSE event model

Single channel; client filters by `kind` and `runId`. Shape: `{ kind, runId?, ...payload }`.

Event kinds:
- **Connection** — `connected`, `disconnected`, `error`
- **Run lifecycle** — `runStarted`, `scenarioDone`
- **Step** — `stepStart`, `stepOk`, `stepFail`, `stepTimeout` (mirrors Phase 1's `RunnerEvent` discriminator)
- **Wire bytes** — `txBytes`, `rxBytes` (carry the framed message string + parsed metadata so the inspector doesn't need to re-parse)

Bytes outside an active run carry no `runId` and land in the Background tab.

### UI

**Top bar** (full width, always present):
- Port `<select>` populated from `/api/ports`
- Baud `<input type="number">` (default 115200)
- `Connect` / `Disconnect` button
- Connection state pill (`connected to /dev/ttyUSB0 @ 115200` / `disconnected` / `port in use`)
- Always-visible red **PANIC** button (single click, no modal — it's a safety control)

**Left panel — scenario list**:
- Vertical list of scenarios with `[destructive]` tag on the four flagged ones
- Click selects; `Run` button fires the scenario
- Destructive scenarios trigger a single-button confirmation modal before run starts
- All controls disabled when disconnected

**Center panel — tabbed transcript**:
- Tab strip across the top: `Background` (always present) + one tab per past run, labeled by scenario id + start time
- Active tab shows step events + TX/RX summary rows in chronological order
- One-line TX/RX rows: `▶ TX 18 FORMAT_SD msg=abc12345 (126 B)`
- Auto-scroll to bottom while live; pause-on-scrollup
- Tabs survive only in browser memory (refresh resets)

**Right panel — transport inspector**:
- Three-mode toggle (`[ Decoded ][ Raw ][ Both ]`), localStorage persistence keyed `smoke.inspector.mode`
- Live-tail by default — auto-updates with the latest TX/RX from the active tab
- Click a TX/RX row in the transcript to pin that message; `[Unpin / resume tail]` button returns to live
- Decoded view runs `MessageHandler.validateMessage` + the type-specific `handleXxxAck` parser; shows a tidy field tree
- Raw view: hex bytes (16 per row) + printable-ASCII column

### Connection lifecycle and error handling

- Port held open across multiple runs once connected; bytes between runs land in Background.
- `/api/connect` 409 on port-in-use with `{ message: "Port /dev/ttyUSB0 is in use; stop AstrOs.Server first" }`. UI shows in pill.
- Mid-run connection loss → `error` SSE event; current run tab marks in-flight steps failed; runner short-circuits to teardown best-effort.
- Server enforces single concurrent run; `/api/run/:id` 409 if a run is active.
- Browser refresh during a run → SSE reconnects, hydrates from `/api/state`. Past tabs are lost; the active run picks up from the next event.

## Task checklist

Four discrete tasks, each independently commit-worthy:

- [ ] **1. Express + Vite middleware scaffold**
  Create `src/web/server.ts`, `src/web/ui/{index.html,main.ts,App.vue}`, `vite.web.config.ts`. Add `vue`, `vite`, `@vitejs/plugin-vue` to deps. Wire dev mode (Express imports Vite middleware) and prod mode (Express serves built `dist/web/`). Add npm scripts `web:dev`, `web:build`, `web`. Healthcheck endpoint `/api/state` returns hardcoded `disconnected`. Verify `npm run web:dev` opens `http://localhost:5174` and renders a placeholder Vue page.

- [ ] **2. Connect flow + state endpoints + SSE channel**
  Implement `/api/ports`, `/api/connect`, `/api/disconnect`, `/api/state`, `/api/events` (SSE). Server-side `SerialTransport` + `discover()` call on connect. Top-bar Vue component with port picker, Connect/Disconnect, status pill, panic button. SSE client subscribes; `connected`/`disconnected`/`error`/`txBytes`/`rxBytes` events flow end-to-end into a Background-tab placeholder. `/api/panic` plumbed.

- [ ] **3. Scenario list, run flow, tabbed transcript**
  Implement `/api/scenarios`, `/api/run/:id`. Left panel renders the list; destructive scenarios show a confirmation modal. Tabbed transcript center panel: tab created on `runStarted`, populated by step + TX/RX events, finalized on `scenarioDone`. Run-related TX/RX is filtered by `runId` into its tab; un-tagged bytes land in Background. Single concurrent run enforced server-side.

- [ ] **4. Transport inspector**
  Right panel with mode toggle (Decoded / Raw / Both, localStorage persistence). Live-tail subscribes to txBytes/rxBytes from the active tab; click a TX/RX row to pin; unpin returns to tail. Decoded view uses `MessageHandler.validateMessage` + per-type handlers — render parsed fields as a key-value tree. Raw view: 16-byte hex rows + ASCII gutter.

## Verification (end-to-end)

Bench ESP32 master connected (and one padawan).

1. `cd astros_smoke_test && npm run web:dev` — Express + Vite middleware boots; browser at `http://localhost:5174` shows the empty cockpit, top bar in `disconnected` state.
2. Pick `/dev/ttyUSB0`, baud `115200`, click Connect — pill turns green, registration sync runs in the background, padawan MAC discovered.
3. Run `sync-only` from the left panel — new tab opens, transcript fills with one step + a TX/RX pair, ends with `scenario OK`. Inspector right panel shows the pinned ACK in Decoded mode.
4. Click the TX row in the transcript — inspector pins it; toggle Raw / Both / Decoded; verify hex bytes match the framed message length.
5. Run `full-happy-path` — confirmation modal appears; click Confirm; full sequence runs and bench servo moves visibly. Inspector shows latest message live throughout.
6. Click PANIC mid-run during `panic-drill` — script halts, transcript marks remaining steps as panic-interrupted.
7. Stop the cockpit, start AstrOs.Server, restart cockpit, click Connect — pill shows port-in-use error with readable message; no crash.
8. `npm run web:build && npm run web` — same flow runs against the built static assets, no Vite in the loop.

## Critical files

**New** (all under `astros_smoke_test/`):
- `vite.web.config.ts`
- `src/web/server.ts`, `src/web/sse.ts`
- `src/web/ui/{index.html, main.ts, App.vue, api.ts}`
- `src/web/ui/components/{TopBar,ScenarioList,TabbedTranscript,TransportInspector,ConfirmModal}.vue`
- `src/web/ui/composables/{useEventStream,useScenarioRuns,useInspectorMode}.ts`

**Reused unchanged from Phase 1**:
- `src/core/runner.ts`, `src/core/transport.ts`
- `src/core/scenarios/index.ts` and the seven scenario factories
- `src/cli/discovery.ts`
- All `@api/*` imports

**Modified**:
- `astros_smoke_test/package.json` — add `vue`, `vite`, `@vitejs/plugin-vue`, `express`; add `web:dev`, `web:build`, `web` scripts.
- `astros_smoke_test/tsconfig.json` — add `src/web/ui/**/*.vue` to `include`.
- `astros_smoke_test/src/index.ts` — barrel may need to skip web entrypoints (server uses different bootstrap).

**Unmodified**: `astros_api/`, `astros_vue/`. The cockpit is additive.

## Classification

Full-plan phase. 4 discrete tasks, single layer (the cockpit is a thin adapter over Phase 1). Each task independently commit-worthy. Task 1 is the riskiest because it introduces Vue + Vite tooling — treat as a checkpoint and confirm both `npm run web:dev` and `npm run web:build` work before moving on.
