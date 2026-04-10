# Code Review Phase 4: Tech Debt & Performance

## Context

Final phase of code review resolution. Phases 1-3 complete. This phase tackles code quality, performance, and PixiJS resource management.

## Phase 4a: Contained fixes (this session)

### Quick fixes
- [ ] Delete dead code `pixiVerticalScrollBar.ts`
- [ ] Simplify `handleWebsocketMessage` — remove Promise constructor wrapper

### Performance
- [ ] Cache API key in `api_key_validator.ts` (60s TTL)
- [ ] Cache session check in `router/index.ts` (60s TTL)

### Code quality
- [ ] Replace FillGradient with plain color in `helpers.ts` `getText()`
- [ ] Extract serial route handler boilerplate into `withSerialGuard()` wrapper
- [ ] New migration: fix `controller_locations.controller_id` integer → text
- [ ] New migration: add foreign key constraints + PRAGMA in `database.ts`

## Phase 4b: PixiJS lifecycle (separate session)
- [ ] Add destroyed flag + AbortController pattern in `AstrosPixiView.vue`
- [ ] Add destroy() methods to `PixiChannelEvent` and `PixiChannelData`
