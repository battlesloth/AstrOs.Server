# Code Review Phase 4a: Code Quality & Performance

Light plan — contained fixes with no architectural risk.

## Tasks

- [x] **Delete dead code** — `astros_vue/src/pixiComponents/pixiVerticalScrollBar.ts` is entirely commented out. Scrollbar implementation lives in `pixiScrollBar.ts`. Delete the file.

- [x] **Simplify `handleWebsocketMessage`** — `astros_api/src/api_server.ts` (~L425). Currently wraps synchronous JSON.parse + switch in an unnecessary `new Promise()` constructor. Simplify to a plain function with try/catch. `servoMoveCommand` is the only handler and doesn't need to be awaited.

- [x] **Cache API key** — `astros_api/src/api_key_validator.ts`. Currently hits DB on every `/remotecontrol` request. Cache scoped to the factory closure (per-validator-instance) with 60s TTL, so tests stay isolated while production still benefits from a single cached instance. Cache is reset on fetch failure. Tests added for cache hit and cache-clear-on-failure behavior.

- [x] **Cache session check** — `astros_vue/src/router/index.ts` (~L67-93). `beforeEach` guard calls `api.get(CHECK_SESSION)` on every route change. Added module-level `lastSessionCheckAt` timestamp. Skips API call if within 60s TTL. Cache cleared on missing token, auth failure, or thrown error.

- [x] **Replace FillGradient with plain color** — `astros_vue/src/pixiComponents/helpers.ts` (~L4-6). `getText()` creates a `FillGradient` with identical start/end colors. Replace with plain hex number. Keep `FillGradient` in `getTruncatedGradientText()` which uses actual gradients.

- [x] **Extract serial route boilerplate** — `astros_api/src/api_server.ts`. 8 handlers repeat identical `sendSerialUnavailable` check + try/catch + 500 response pattern. Created `withSerialGuard(handler)` wrapper that runs the guard and catches errors; handlers now contain only business logic. Also wrapped `/remotecontrol` (which dispatches to `runPlaylist`/`runScript`) and awaited its inner calls so errors propagate to the guard.

## Verification

- `cd astros_vue && npx vitest run && npx vue-tsc --noEmit`
- `cd astros_api && npx vitest run`
