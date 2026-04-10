# Code Review Phase 4c: PixiJS Lifecycle & Resource Cleanup

Full plan — touches rendering code, needs manual QA on timeline editor.

## Context

The PixiJS timeline editor has two resource management issues:

1. **Race condition on unmount** — `AstrosPixiView.vue`'s `initializePixi()` is async (calls `await init()` which does `await loadAssets()` + `await app.init()`). If the user navigates away during init, `onUnmounted` runs but init continues, adding children to destroyed containers.

2. **Leaked listeners and async sprites** — `PixiChannelEvent` and `PixiChannelData` register pointer listeners and call `Assets.load().then(sprite => this.addChild(sprite))` per instance. Listeners are never removed. The `.then()` callbacks can fire after the container is destroyed/removed from the display tree.

Note: `Assets.load()` is internally cached by PixiJS, so the performance concern of "loading per instance" is actually fine — the real issue is the `.then()` callbacks outliving their containers.

## Tasks

### Vue C-2: Lifecycle guard in AstrosPixiView.vue

- [ ] Add `let isDestroyed = false` flag in the component setup
- [ ] Set `isDestroyed = true` at the start of `onUnmounted`
- [ ] Guard after each `await` in `init()`:
  ```
  await loadAssets();
  if (isDestroyed) return;

  await app.value.init({...});
  if (isDestroyed) return;
  ```
- [ ] Guard in `initializePixi()` before the `addChannel` loop:
  ```
  await init();
  if (isDestroyed) return;
  ```
- [ ] Guard in `addChannel` / `addEvent` — early return if `isDestroyed`

### Vue H-5: Destroy methods for PixiChannelEvent and PixiChannelData

#### pixiChannelEvent.ts
- [ ] Add `private isDestroyed = false` property
- [ ] Add `destroy()` method that:
  - Sets `isDestroyed = true`
  - Calls `this.removeAllListeners()` (Pixi Container method — removes pointerdown, pointertap, etc.)
  - Calls `super.destroy({ children: true })` to clean up display objects
- [ ] Guard all `Assets.load().then()` callbacks: check `if (this.isDestroyed) return` before `this.addChild(sprite)`
- [ ] Update `rebuild()` to also check `isDestroyed`

#### pixiChannelData.ts
- [ ] Same pattern: `isDestroyed` flag, `destroy()` method with `removeAllListeners()` + `super.destroy()`
- [ ] Guard `Assets.load().then()` callbacks for swapIcon, deleteIcon, playIcon
- [ ] Guard button `pointerdown` listeners in `addButton()`

#### AstrosPixiView.vue — cleanup integration
- [ ] In `doRemoveChannel()`, call `destroy()` on the removed `PixiChannelData` and each `PixiChannelEvent` in that channel before removing from the display tree
- [ ] In `onUnmounted`, the existing `app.value?.destroy(true, { children: true, ... })` should cascade to children, but explicitly calling `destroy()` on tracked containers ensures listeners are cleaned up before the Pixi app teardown

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
