# Code Review Phase 4: Tech Debt & Performance

## Context

Final phase of code review resolution. Phases 1-3 complete. Broken into three sub-phases by risk profile.

## Phase 4a: Code quality & performance (low risk)

- [ ] Delete dead code `pixiVerticalScrollBar.ts`
- [ ] Simplify `handleWebsocketMessage` — remove Promise constructor wrapper
- [ ] Cache API key in `api_key_validator.ts` (60s TTL)
- [ ] Cache session check in `router/index.ts` (60s TTL)
- [ ] Replace FillGradient with plain color in `helpers.ts` `getText()`
- [ ] Extract serial route handler boilerplate into `withSerialGuard()` wrapper

## Phase 4b: Database migrations (needs backup system first)

### Step 1: Pre-migration backup
- [ ] Add automatic database backup before migrations in `dal/database.ts`

### Step 2: Schema fixes
- [ ] `migration_5`: fix `controller_locations.controller_id` integer → text
- [ ] `migration_6`: add foreign key constraints + PRAGMA

## Phase 4c: PixiJS lifecycle (separate session)
- [ ] Add destroyed flag + AbortController in `AstrosPixiView.vue`
- [ ] Add `destroy()` methods to `PixiChannelEvent` and `PixiChannelData`
