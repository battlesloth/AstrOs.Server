# Code Review Phase 3: UX & Data Integrity

## Context

Addresses issues that protect user work, improve WebSocket reliability, and fix timing bugs in hardware control. These items improve the day-to-day experience and safety of the system.

## Tasks

### WebSocket improvements (`astros_vue/src/composables/useWebsocket.ts`)

- [ ] **H-1: Make WebSocket URL configurable** — Replace hardcoded `'ws://localhost:5000/ws'` (L15) with `import.meta.env.VITE_WS_URL || \`ws://${window.location.hostname}:5000/ws\``. This fixes WebSocket in Docker/production deployments.

- [ ] **H-2: Add intentional close flag** — Add `intentionallyClosed` ref. Set to `true` in `wsDisconnect()`, check in `attemptReconnect()` to suppress reconnection on deliberate disconnect. Reset to `false` in `wsConnect()`.

### Scripter navigation guard (`astros_vue/src/views/ScripterView.vue`, `astros_vue/src/stores/scripter.ts`)

- [ ] **H-4: Add dirty tracking and navigation guard** — In the scripter store, snapshot the script JSON on load. Add an `isDirty` computed that compares current state to snapshot. In ScripterView, add `onBeforeRouteLeave` guard that prompts the user if dirty. Reset snapshot on save. Add i18n key for the confirmation message.

### Animation queue timeout fix (`astros_api/src/serial/animation_queue/animation_queue.ts`)

- [ ] **H-3: Clear previous timeout before setting new one** — In `dispatchTrack()` (L188) and the shuffle delay in `playNextTrack()` (L148), add `clearTimeout(this.currentTimeout)` before the `setTimeout` assignment. This ensures `panicStop()` can reliably cancel all pending track dispatches.

### Worker error communication (`astros_api/src/background_tasks/serial_worker.js`)

- [ ] **H-6: Send error responses back to main thread** — In the catch block (L27) and the invalid type guard (L10), send an error response via `parentPort.postMessage()` so the main thread knows the command failed rather than timing out silently.

### Remove redundant delete call (`astros_api/src/controllers/scripts_controller.ts`)

- [ ] **M-1: Remove redundant `deleteTracksByScriptId` call** — `scriptRepo.deleteScript()` already deletes playlist tracks within its own transaction (script_repository.ts L257-277). The controller's separate call to `playlistRepo.deleteTracksByScriptId()` (L124) is a redundant double-delete. Remove it and the unused `playlistRepo` instantiation.

## Verification

- Run Vue tests: `cd astros_vue && npx vitest run`
- Run API tests: `cd astros_api && npx vitest run`  
- Manual: verify WebSocket connects in dev, verify scripter dirty prompt on navigation
