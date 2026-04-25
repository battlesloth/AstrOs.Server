# Plan: smoke-test debug logging

## Context

The smoke-test cockpit and CLI currently surface server-side activity through ad-hoc `console.log` / `console.error` calls scattered across `core/transport.ts` and `web/server.ts`. While diagnosing a bench-test issue, we needed to add five `console.log` calls to `transport.ts` just to see what the serial port was doing. That's a sign the codebase needs a real logging mechanism so we're not constantly editing source files to debug.

`pino` and `pino-roll` are already declared in `astros_smoke_test/package.json` (and installed) but never imported — they were seeded with the scaffold for exactly this moment. `astros_api/src/logger.ts` already uses pino with a rolling-file transport, so adopting pino here keeps both packages on the same logging pattern.

## Confirmed decisions

- **Use pino**, not a homegrown logger. Already declared, structured-by-default, matches `astros_api`.
- **Add `pino-pretty`** as a devDependency for terminal-readable output in dev.
- **Drop `pino-roll`** — smoke-test is an interactive dev tool, not a long-running service; no need for file rotation.
- **Env-var-driven namespace filtering.** `SMOKE_LOG=transport,server` enables debug-level for those namespaces. `SMOKE_LOG=*` enables all. Unset/empty = debug suppressed; info/warn/error always fire.
- **Stderr only.** The CLI's `--json` mode writes structured events to stdout; logs must not corrupt that channel.
- **Namespaces seeded now:** `transport`, `server`, `sse`, `state`. No `runner` namespace yet — the runner already broadcasts a rich `RunnerEvent` stream that the CLI prints.
- **Browser-side logging is out of scope.** The Vue app's existing `console.error` calls stay as-is.

## Architecture

### Module layout

`src/core/log.ts` is the single entry point. Lives in `core/` (not `web/`) so both the CLI and the cockpit can import without a circular dep.

### API

```ts
import { createLogger } from '../core/log.js';

const log = createLogger('transport');

log.debug('write', { bytes: msg.length, msgId });   // gated by SMOKE_LOG
log.info('port opened', { path, baud });            // always fires (info+)
log.warn('drain slow', { ms });
log.error('write failed', err);                     // Errors get serialized fields
```

### Implementation

A thin wrapper around a single root pino instance:

- Root pino instance configured at module load:
  - `level: 'debug'` (so debug calls reach the formatter; namespace gate decides if they actually write)
  - In dev: `transport: { target: 'pino-pretty', options: { destination: 2, colorize: true, translateTime: 'HH:MM:ss.l' } }`
  - In prod (`NODE_ENV=production`): plain pino to stderr (`destination: 2`), JSON output for piping
- `createLogger(namespace)` returns an object whose `info`/`warn`/`error` methods delegate directly to a pino child (`root.child({ ns: namespace })`).
- The `debug` method consults the parsed `SMOKE_LOG` env var — if the namespace isn't enabled, it's a no-op (early return, no allocation).
- The env var is parsed once at module load:
  - Empty / unset → `debug` always no-op
  - `*` → all namespaces enabled
  - `transport,server` → only those namespaces

### Call site changes

| File | Replaces |
|---|---|
| `src/core/transport.ts` | 5 ad-hoc `console.log` calls (open error, port error, port close, write error, drain error) → `log.error` for failures, `log.debug` for the commented-out received-line one if we want it back as opt-in. |
| `src/web/server.ts` | `console.log` startup banner → `log.info`. `console.error` for cockpit-failed-to-start → `log.error`. Add `log.debug` for `/api/connect`, `/api/disconnect`, `/api/run/:id`, `/api/panic` request lifecycles. |
| `src/web/sse.ts` | Add `log.debug` for subscriber added/removed and broadcast event shape. |
| `src/web/state.ts` | Add `log.debug` for connect/disconnect transitions and discovery flow. |

The startup banner (`[smoke-cockpit] http://localhost:5174`) becomes a `log.info` and will render through pino-pretty as `[12:34:56.789] INFO (server): listening {port:5174,mode:dev}` — same information, structured.

## Task checklist

- [ ] **1. Add deps and create logger module**
  - `package.json`: add `pino-pretty` to `devDependencies`, remove `pino-roll` from `dependencies`.
  - Run `npm install` to update lockfile.
  - Create `src/core/log.ts` per the architecture above.
  - Create `src/core/log.test.ts` covering: namespace gating (debug suppressed when `SMOKE_LOG` unset, fires when namespace listed, fires for `*`), levels above debug always fire, error objects get serialized.
  - Run `npm test` — all tests pass.

- [ ] **2. Wire logger into transport, server, sse, state**
  - Replace ad-hoc `console.log`/`console.error` calls in the four files listed above.
  - Add request-lifecycle debug calls in `web/server.ts` and subscriber-lifecycle in `web/sse.ts`.
  - Run `npm run lint:fix` and `npm run prettier:write`.
  - Run `npm test` — all tests pass.
  - Manual smoke: `SMOKE_LOG=* npm run web:dev` shows pretty namespaced output to stderr; `npm run web:dev` (no env) shows only info+ lines.

## Verification

1. `npm test` — full suite green (46 tests + new logger tests).
2. `npm run web:dev` (no `SMOKE_LOG`) — terminal shows the startup banner and any errors, no debug noise.
3. `SMOKE_LOG=* npm run web:dev` — terminal shows pretty-printed namespaced debug output for every transport, server, sse, state event.
4. `SMOKE_LOG=transport npm run web:dev` — only transport debug fires; server/sse/state stay silent at debug level.
5. `NODE_ENV=production tsx ./src/web/server.ts` — output is single-line JSON to stderr, suitable for piping to `jq`.
6. CLI `--json` mode (`SMOKE_LOG=* npm run smoke -- --json full-happy-path`) — stdout JSON stream is uncorrupted; debug logs go to stderr.

## Critical files

**New:**
- `astros_smoke_test/src/core/log.ts`
- `astros_smoke_test/src/core/log.test.ts`

**Modified:**
- `astros_smoke_test/package.json` — add `pino-pretty`, drop `pino-roll`
- `astros_smoke_test/package-lock.json` — regenerated
- `astros_smoke_test/src/core/transport.ts` — replace ad-hoc logs
- `astros_smoke_test/src/web/server.ts` — replace ad-hoc logs, add request lifecycle debug
- `astros_smoke_test/src/web/sse.ts` — subscriber lifecycle debug
- `astros_smoke_test/src/web/state.ts` — connect/disconnect debug

**Unmodified:** `astros_api/`, `astros_vue/`. The cockpit logger is independent from the API's logger.

## Classification

Light plan. Two tasks, ~6 files, single layer (logging adapter over existing call sites). No new runtime behavior — this is observability plumbing.
