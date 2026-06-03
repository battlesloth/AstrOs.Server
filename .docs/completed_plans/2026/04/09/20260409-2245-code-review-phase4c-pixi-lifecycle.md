# Code Review Phase 4c: PixiJS Lifecycle & Resource Cleanup

Full plan — touches rendering code, needs manual QA on timeline editor.

## Context

The PixiJS timeline editor has two resource management issues:

1. **Race condition on unmount** — `AstrosPixiView.vue`'s `initializePixi()` is async (calls `await init()` which does `await loadAssets()` + `await app.init()`). If the user navigates away during init, `onUnmounted` runs but init continues, adding children to destroyed containers.

2. **Leaked listeners and async sprites** — `PixiChannelEvent` and `PixiChannelData` register pointer listeners and call `Assets.load().then(sprite => this.addChild(sprite))` per instance. Listeners are never removed. The `.then()` callbacks can fire after the container is destroyed/removed from the display tree.

Note: `Assets.load()` is internally cached by PixiJS, so the performance concern of "loading per instance" is actually fine — the real issue is the `.then()` callbacks outliving their containers.

## Tasks

### Vue C-2: Lifecycle guard in AstrosPixiView.vue

- [x] Add `let isDestroyed = false` flag in the component setup
- [x] Set `isDestroyed = true` at the start of `onUnmounted`
- [x] Guard after each `await` in `init()` (loadAssets + app.init)
- [x] Guard in `initializePixi()` before the `addChannel` loop
- [x] Guard in `addChannel` / `addEvent` — early return if `isDestroyed`

### Vue H-5: Destroy methods for PixiChannelEvent and PixiChannelData

#### pixiChannelEvent.ts
- [x] Add `private isDestroyed = false` property
- [x] Add `destroy()` override (idempotent) that sets `isDestroyed`, calls `removeAllListeners()`, calls `super.destroy({ children: true })`
- [x] Guard all `Assets.load().then()` callbacks via a new `loadAsset(asset, cb)` helper that checks `isDestroyed` before applying the texture — 14 call sites now funnel through it
- [x] Update `rebuild()` to early-return on `isDestroyed`

#### pixiChannelData.ts
- [x] Same pattern: `isDestroyed` flag, `destroy()` override, `loadIcon(asset, button)` helper that guards the callback
- [x] Guarded `Assets.load` callbacks for swapIcon, deleteIcon, playIcon
- [x] Button pointerdown listeners explicitly removed in `destroy()` (tracked via a `buttons` array) in addition to the parent's `removeAllListeners()`

#### AstrosPixiView.vue — cleanup integration
- [x] `useEventBoxes.removeEventBox` now destroys the removed box (so single-event removal is clean too)
- [x] Added `removeAllEventBoxesForChannel(channelId)` helper to `useEventBoxes`, which is called from `doRemoveChannel` to destroy every PixiChannelEvent for that channel before the row container is torn down
- [x] `pixiChannelList.removeChannelRow` now calls `destroy({ children: true })` on the PixiChannelData after detaching it
- [x] `doRemoveChannel` explicitly destroys the row container (`PixiChannelEventRow`) after removing it from the display tree
- [x] `onUnmounted` destroys every tracked row container before calling `app.destroy()`, so our custom destroy methods run even if Pixi's cascade behavior changes

## Key files

- `astros_vue/src/components/scripter/AstrosPixiView.vue` — lifecycle guards + cleanup calls
- `astros_vue/src/pixiComponents/pixiChannelEvent.ts` — destroy method + async guards
- `astros_vue/src/pixiComponents/pixiChannelData.ts` — destroy method + async guards

## Verification

- `cd astros_vue && npx vitest run && npx vue-tsc --noEmit`
- Manual QA:
  - Open scripter, add channels and events, verify timeline renders
  - Navigate away mid-load (click nav link quickly after opening scripter) — verify no console errors
  - Add/remove multiple channels in quick succession — verify no leaked containers
  - Long editing session — verify no memory growth (check browser task manager)
