# Code Review Phase 4a: Code Quality & Performance

Light plan — contained fixes with no architectural risk.

## Tasks

- [ ] **Delete dead code** — `astros_vue/src/pixiComponents/pixiVerticalScrollBar.ts` is entirely commented out. Scrollbar implementation lives in `pixiScrollBar.ts`. Delete the file.

- [ ] **Simplify `handleWebsocketMessage`** — `astros_api/src/api_server.ts` (~L425). Currently wraps synchronous JSON.parse + switch in an unnecessary `new Promise()` constructor. Simplify to a plain function with try/catch. `servoMoveCommand` is the only handler and doesn't need to be awaited.

- [ ] **Cache API key** — `astros_api/src/api_key_validator.ts`. Currently hits DB on every `/remotecontrol` request. Add module-level `cachedKey`/`cachedAt` variables. Return cached value if within 60s TTL, otherwise fetch from DB. Reset cache on fetch failure.

- [ ] **Cache session check** — `astros_vue/src/router/index.ts` (~L67-93). `beforeEach` guard calls `api.get(CHECK_SESSION)` on every route change. Add module-level `lastChecked` timestamp. Skip API call if within 60s TTL. Clear cache on auth failure (redirect to /auth). Still check token existence first.

- [ ] **Replace FillGradient with plain color** — `astros_vue/src/pixiComponents/helpers.ts` (~L4-6). `getText()` creates a `FillGradient` with identical start/end colors. Replace with plain hex number. Keep `FillGradient` in `getTruncatedGradientText()` which uses actual gradients.

- [ ] **Extract serial route boilerplate** — `astros_api/src/api_server.ts`. 8 handlers repeat identical `sendSerialUnavailable` check + try/catch + 500 response pattern. Create `withSerialGuard(handler)` wrapper that handles the guard and error response, leaving handlers to contain only business logic. Handlers: `syncControllers`, `syncControllerConfig`, `uploadScript`, `runPlaylist`, `runScript`, `panicStop`, `directCommand`, `formatSD`.

## Verification

- `cd astros_vue && npx vitest run && npx vue-tsc --noEmit`
- `cd astros_api && npx vitest run`
