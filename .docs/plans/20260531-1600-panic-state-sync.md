# Panic-State Sync + Clear Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` (or subagent-driven) to implement task-by-task. Steps use `- [ ]` for tracking. TDD for logic; frontend-design for UI; tests-after via Vue Test Utils for layout.

**Goal:** Let clients clear a server panic-stop and always know the current panic state (on load/refresh and in real time), with the mobile Stop-All button morphing to Clear-Panic and a desktop Clear-Panic button appearing under the droid when panicked.

**Architecture:** Mirror the existing `JobLock` round-trip exactly — server-side observable state (`AnimationQueue` gains a `subscribe()`/`getPanicState()`), broadcast on change via `updateClients`, on-connect WS snapshot, a `GET` hydrate endpoint, a small Pinia store, and a `useWebsocket` handler. UI reads the store.

**Tech Stack:** Express/TS backend, Vue 3 + Pinia + vue-i18n frontend, vitest.

**Decisions (locked):** full GET+WS mirror; mobile clear = hold-to-confirm (reuse `useHoldGesture`); desktop clear = a click button under the droid; panic state is a **boolean** (no who/when); panic stop & clear stay always-allowed (safety, not read-only-gated).

---

## File structure

**Backend (`astros_api/`)**
- `src/models/enums.ts` — add `TransmissionType.panicState = 17`.
- `src/models/networking/panic_responses.ts` *(new)* — `PanicState` interface + `buildPanicStateResponse`.
- `src/serial/animation_queue/animation_queue.ts` — add `subscribe()/notify()/getPanicState()`; notify in `panicStop()`/`clearPanicStop()`.
- `src/api_server.ts` — subscribe→broadcast; on-connect snapshot; `GET /panicState`; add WS snapshot.

**Frontend (`astros_vue/`)**
- `src/enums/WebsocketMessageType.ts` — add `PANIC_STATE = 17`.
- `src/api/endpoints.ts` — `PANIC_STATE = 'api/panicState'`, `PANIC_CLEAR = 'api/panicClear'`.
- `src/models/...` — `PanicState` type (mirror `LockState` export site).
- `src/stores/panicState.ts` *(new)* — `inPanicStop` + `setState` + `fetchPanicState`.
- `src/composables/useWebsocket.ts` — `PANIC_STATE` case + `handlePanicStateMessage`.
- `src/App.vue` — `panicStateStore.fetchPanicState()` on mount.
- `src/composables/useRemoteCommands.ts` — `panicClear()`.
- `src/components/mobileRemote/mobileRemote/AstrosMobileRemote.vue` — `inPanicStop` prop, button morph, `clearPanic` emit, i18n.
- `src/views/MobileRemoteView.vue` — pass `:in-panic-stop`, handle `@clear-panic`.
- `src/views/StatusView.vue` — desktop Clear-Panic button under the droid when panicked.
- `src/locales/enUS.json` — `mobile_remote.clear_*`, `status.clear_panic*`.

---

## Task 1: Wire-protocol enum + payload type (backend + frontend mirror)

**Files:** Modify `astros_api/src/models/enums.ts`; Create `astros_api/src/models/networking/panic_responses.ts`; Modify `astros_vue/src/enums/WebsocketMessageType.ts`.

- [ ] **Add backend enum value.** In `enums.ts` `TransmissionType`, after `flashJobFailed = 16` add `panicState = 17`.
- [ ] **Create `panic_responses.ts`:**
```ts
import { TransmissionType } from '../enums.js';
import { BaseResponse } from './base_response.js';

export interface PanicState {
  inPanicStop: boolean;
}

export interface PanicStateResponse extends BaseResponse, PanicState {}

// Single source of truth for the panicState WS payload — used for both the
// change broadcast (animationQueue.subscribe handler) and the on-connect
// snapshot. Mirrors buildLockStateResponse.
export function buildPanicStateResponse(state: PanicState): PanicStateResponse {
  return { type: TransmissionType.panicState, inPanicStop: state.inPanicStop };
}
```
(Check `base_response.ts` for the exact `BaseResponse` shape — it's `{ type: TransmissionType }`. Match `lock_responses.ts`.)
- [ ] **Add frontend enum value.** In `WebsocketMessageType.ts`, after `FLASH_JOB_FAILED = 16` add `PANIC_STATE = 17`. (Hand-maintained mirror — value MUST match backend 17.)
- [ ] **Commit:** `feat(api): panicState wire type (TransmissionType 17 + payload builder)`

---

## Task 2: AnimationQueue observable panic state (TDD)

**Files:** Modify `astros_api/src/serial/animation_queue/animation_queue.ts`; Test `astros_api/src/serial/animation_queue/animation_queue.test.ts`.

Mirror `JobLock.subscribe/notify` (`astros_api/src/job_lock/job_lock.ts:46-63`).

- [ ] **Write failing tests** in `animation_queue.test.ts`:
```ts
it('getPanicState reflects panicStop / clearPanicStop', () => {
  const q = new AnimationQueue(() => {});
  expect(q.getPanicState()).toEqual({ inPanicStop: false });
  q.panicStop();
  expect(q.getPanicState()).toEqual({ inPanicStop: true });
  q.clearPanicStop();
  expect(q.getPanicState()).toEqual({ inPanicStop: false });
});

it('notifies subscribers on panicStop and clearPanicStop', () => {
  const q = new AnimationQueue(() => {});
  const seen: boolean[] = [];
  q.subscribe((s) => seen.push(s.inPanicStop));
  q.panicStop();
  q.clearPanicStop();
  expect(seen).toEqual([true, false]);
});

it('unsubscribe stops notifications', () => {
  const q = new AnimationQueue(() => {});
  const seen: boolean[] = [];
  const off = q.subscribe((s) => seen.push(s.inPanicStop));
  off();
  q.panicStop();
  expect(seen).toEqual([]);
});
```
- [ ] **Run → fail** (`subscribe`/`getPanicState` missing): `cd astros_api && npx vitest run src/serial/animation_queue/animation_queue.test.ts`
- [ ] **Implement.** Add to `AnimationQueue` (import `PanicState` type):
```ts
private panicListeners = new Set<(state: PanicState) => void>();

getPanicState(): PanicState {
  return { inPanicStop: this.inPanicStop };
}

subscribe(listener: (state: PanicState) => void): () => void {
  this.panicListeners.add(listener);
  return () => this.panicListeners.delete(listener);
}

private notifyPanic(): void {
  const state = this.getPanicState();
  for (const fn of this.panicListeners) {
    try { fn(state); } catch (error) { logger.error('Error in panic listener:', error); }
  }
}
```
Call `this.notifyPanic()` at the end of `panicStop()` and `clearPanicStop()`. (Guard `clearPanicStop` to only notify when it actually changes? Keep simple: notify always — idempotent for clients.) Import `logger` if not present.
- [ ] **Run → pass.** Confirm existing queue tests still pass.
- [ ] **Commit:** `feat(api/queue): observable panic state (subscribe + getPanicState)`

---

## Task 3: api_server — broadcast, on-connect snapshot, GET endpoint

**Files:** Modify `astros_api/src/api_server.ts`. Import `buildPanicStateResponse` + `PanicState`.

Mirror the JobLock wiring: constructor subscribe (`api_server.ts:284-286`), on-connect snapshot (`:708-712`), and a GET like the lock controller.

- [ ] **Subscribe → broadcast** (next to the `jobLock.subscribe` in the constructor — note `animationQueue` is created in `Init()`/setup, so place this subscribe right after the queue is constructed, wherever `new AnimationQueue(...)` is, ~`api_server.ts:302`):
```ts
this.animationQueue.subscribe((state) => {
  this.updateClients(buildPanicStateResponse(state));
});
```
- [ ] **On-connect snapshot** — in the `ws.on('connection', ...)` handler, after the lockState snapshot (`api_server.ts:710`):
```ts
try {
  conn.send(JSON.stringify(buildPanicStateResponse(this.animationQueue.getPanicState())));
} catch (err) {
  logger.error(`websocket initial panicState send error: ${err}`);
}
```
- [ ] **GET endpoint** — register alongside the panic routes (`api_server.ts:577`):
```ts
this.router.get('/panicState', this.authHandler, (req: any, res: any) => {
  res.status(200).json(this.animationQueue.getPanicState());
});
```
- [ ] **Build + existing tests.** `cd astros_api && npx tsc --noEmit -p tsconfig.json && npx vitest run`. (The integration harness exercises WS connect — confirm no regression.)
- [ ] **Commit:** `feat(api): broadcast + GET + on-connect snapshot for panic state`

---

## Task 4: Frontend endpoints + PanicState model + store (TDD)

**Files:** Modify `astros_vue/src/api/endpoints.ts`; add `PanicState` type (mirror where `LockState` is exported, `astros_vue/src/models`); Create `astros_vue/src/stores/panicState.ts`; Test `astros_vue/src/stores/__tests__/panicState.spec.ts`.

- [ ] **Endpoints:** add `export const PANIC_STATE = 'api/panicState';` and `export const PANIC_CLEAR = 'api/panicClear';` near `PANIC_STOP` (`endpoints.ts:28`).
- [ ] **PanicState type:** `export interface PanicState { inPanicStop: boolean }` in the models barrel (mirror `LockState`; find its export in `astros_vue/src/models`).
- [ ] **Write failing store test** (mirror `stores/__tests__/jobLock.spec.ts` if present, else `remoteControl.spec.ts` mock style):
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
vi.mock('@/api/apiService', () => ({ default: { get: vi.fn() } }));
import apiService from '@/api/apiService';
import { usePanicStateStore } from '../panicState';
const apiGet = apiService.get as ReturnType<typeof vi.fn>;

describe('panicState store', () => {
  beforeEach(() => { setActivePinia(createPinia()); apiGet.mockReset(); });
  it('setState updates inPanicStop', () => {
    const s = usePanicStateStore();
    s.setState({ inPanicStop: true });
    expect(s.inPanicStop).toBe(true);
  });
  it('fetchPanicState hydrates from GET', async () => {
    apiGet.mockResolvedValue({ inPanicStop: true });
    const s = usePanicStateStore();
    await s.fetchPanicState();
    expect(apiGet).toHaveBeenCalledWith('api/panicState');
    expect(s.inPanicStop).toBe(true);
  });
  it('fetchPanicState leaves state on error', async () => {
    apiGet.mockRejectedValue(new Error('x'));
    const s = usePanicStateStore();
    await s.fetchPanicState();
    expect(s.inPanicStop).toBe(false);
  });
});
```
- [ ] **Run → fail.**
- [ ] **Implement `panicState.ts`** (mirror `stores/jobLock.ts`):
```ts
import { ref } from 'vue';
import { defineStore } from 'pinia';
import apiService from '@/api/apiService';
import { PANIC_STATE } from '@/api/endpoints';
import type { PanicState } from '@/models';

export const usePanicStateStore = defineStore('panicState', () => {
  const inPanicStop = ref(false);
  function setState(state: PanicState) { inPanicStop.value = state.inPanicStop; }
  async function fetchPanicState(): Promise<void> {
    // HTTP hydrate closes the cold-mount window before the WS on-connect
    // snapshot arrives; both converge on setState. Mirrors jobLock.fetchLockState.
    try {
      const response = (await apiService.get(PANIC_STATE)) as PanicState;
      setState(response);
    } catch (error) {
      console.warn('panicState.fetchPanicState failed', error);
    }
  }
  return { inPanicStop, setState, fetchPanicState };
});
```
- [ ] **Run → pass.**
- [ ] **Commit:** `feat(vue): panicState store + endpoints`

---

## Task 5: WS handler + App hydrate

**Files:** Modify `astros_vue/src/composables/useWebsocket.ts`; `astros_vue/src/App.vue`.

- [ ] **WS handler.** In `useWebsocket.ts`, add to the `switch (parsedMessage.type)`:
```ts
case WebsocketMessageType.PANIC_STATE:
  handlePanicStateMessage(parsedMessage);
  break;
```
and the handler (mirror `handleLockStateChanged`):
```ts
function handlePanicStateMessage(message: BaseWsMessage) {
  try {
    const data = message as unknown as { inPanicStop: boolean };
    usePanicStateStore().setState({ inPanicStop: data.inPanicStop });
  } catch (error) {
    console.error('Error handling panic state message:', error);
  }
}
```
Import `usePanicStateStore`. (The `default` exhaustiveness `as never` block stays valid — `PANIC_STATE` is now a handled case.)
- [ ] **App hydrate.** In `App.vue` `onMounted`, after `jobLockStore.fetchLockState();` add `usePanicStateStore().fetchPanicState();` (import + instantiate like the others).
- [ ] **Type-check + test:** `cd astros_vue && npx vue-tsc --noEmit -p tsconfig.app.json && npx vitest run src/composables/__tests__/useWebsocket.spec.ts`. Add a dispatcher test asserting a `PANIC_STATE` frame calls the store (mirror existing useWebsocket dispatcher tests).
- [ ] **Commit:** `feat(vue): handle panicState WS message + hydrate on mount`

---

## Task 6: useRemoteCommands.panicClear (TDD)

**Files:** Modify `astros_vue/src/composables/useRemoteCommands.ts` + its spec.

- [ ] **Failing test** (in `useRemoteCommands.spec.ts`, mirror panicStop cases): mock `apiService.post`; assert `panicClear()` calls `apiService.post('api/panicClear', {})` and returns `{success:true}`; failure → `{success:false}`.
- [ ] **Implement** `panicClear()` mirroring `panicStop()` but `POST PANIC_CLEAR`. Add `PANIC_CLEAR` import.
- [ ] **Run → pass.**
- [ ] **Commit:** `feat(vue): useRemoteCommands.panicClear`

---

## Task 7: Mobile Stop-All ↔ Clear-Panic morph

**Files:** Modify `astros_vue/src/components/mobileRemote/mobileRemote/AstrosMobileRemote.vue` + spec; `astros_vue/src/locales/enUS.json`. Use `frontend-design`.

- [ ] **i18n:** add under `mobile_remote`: `"clear_idle": "CLEAR PANIC"`, `"clear_arming": "HOLD TO CLEAR…"`, `"clear_active": "CLEARING…"`, `"clear_toast": "Clearing panic…"`, `"clear_caption": "Hold to re-enable control"`.
- [ ] **Prop + emit:** add prop `inPanicStop: { type: Boolean, default: false }`; add emit `clearPanic: []`.
- [ ] **Morph the existing hold gesture** (`AstrosMobileRemote.vue:117-128`) — branch `onFire`:
```ts
onFire: () => {
  if (props.inPanicStop) {
    showToast(t('mobile_remote.clear_toast'), 1800);
    emit('clearPanic');
  } else {
    showToast(t('mobile_remote.panic_toast'), 1800);
    emit('panic');
  }
},
```
- [ ] **Template:** add a `--clear` class modifier on `.astros-mobile-remote__panic` when `inPanicStop`; make `stopAllLabel` and the caption branch on `inPanicStop` (idle/arming/active → clear_* vs stop_all_*). Distinct color for clear (e.g. the primary blue/green, NOT panic red) so it doesn't read as "stop". Keep the 600ms hold + arming fill (hold-to-confirm).
- [ ] **Tests** (`AstrosMobileRemote.spec.ts`): with `inPanicStop: true`, the button reads the clear label and a hold (mousedown + advance 600ms) emits `clearPanic` (not `panic`); with `inPanicStop: false`, a hold emits `panic`. (Use the existing fake-timer render helper; add `inPanicStop?: boolean` to its props type.)
- [ ] **Commit:** `feat(remote): mobile Stop-All button morphs to Clear-Panic when panicked`

---

## Task 8: MobileRemoteView wiring

**Files:** Modify `astros_vue/src/views/MobileRemoteView.vue` + spec.

- [ ] Read the store: `const { inPanicStop } = storeToRefs(usePanicStateStore());`. Pass `:in-panic-stop="inPanicStop"` to `AstrosMobileRemote`. Handle `@clear-panic="onClearPanic"`.
- [ ] `async function onClearPanic() { const r = await commands.panicClear(); if (!r.success) toast.error(t('mobile.command_failed', { name: t('mobile_remote.clear_idle') })); }` (or a dedicated `mobile.clear_failed` key — add it).
- [ ] **Tests** (`MobileRemoteView.spec.ts`): emitting `clear-panic` from `AstrosMobileRemote` calls `apiPost` with `api/panicClear`; failure → toast. (Mock the panicState store or set it via pinia.)
- [ ] **Commit:** `feat(remote): wire mobile clear-panic to the server`

---

## Task 9: Desktop Clear-Panic button on the Status page

**Files:** Modify `astros_vue/src/views/StatusView.vue` + a new spec; `astros_vue/src/locales/enUS.json`. Use `frontend-design`.

- [ ] **i18n:** `status.clear_panic` = "Clear Panic Stop", `status.panicked_hint` = "The droid is in panic stop — control is disabled until cleared." `status.clear_panic_failed` = "Couldn't clear panic — try again."
- [ ] **Template:** below `<AstrosStatus .../>` inside the centered column, add (reads `usePanicStateStore().inPanicStop`):
```vue
<div v-if="inPanicStop" class="mt-6 flex flex-col items-center gap-2">
  <p class="text-error font-semibold">{{ $t('status.panicked_hint') }}</p>
  <button class="btn btn-error" data-testid="clear-panic" @click="onClearPanic">
    {{ $t('status.clear_panic') }}
  </button>
</div>
```
- [ ] **Script:** `const { inPanicStop } = storeToRefs(usePanicStateStore());` + `const commands = useRemoteCommands(); const toast = useToast(); const { t } = useI18n();` and `async function onClearPanic() { const r = await commands.panicClear(); if (!r.success) toast.error(t('status.clear_panic_failed')); }`.
- [ ] **Test** (`StatusView.spec.ts`): mount with pinia; when the panicState store has `inPanicStop=true` the `clear-panic` button renders and clicking it POSTs `api/panicClear`; when false it's absent. (Mock `apiService` + `useToast`; stub `AstrosStatus`/`AstrosLayout` as needed.)
- [ ] **Commit:** `feat(status): desktop Clear-Panic button under the droid when panicked`

---

## Task 10: QA plan + full verification

**Files:** Create `astros_vue/.docs/qa/panic-state.md` (or `.docs/qa/`); run full gates.

- [ ] **QA plan:** trigger panic from mobile → mobile button morphs to CLEAR (hold to clear) AND a second device's mobile button + the desktop Status page both reflect panic in real time; refresh either device while panicked → still shows panicked (GET + on-connect snapshot); clear from desktop → mobile updates live; clear from mobile → desktop button disappears; panic/clear work while in read-only mode; WS-disconnected clear still attempts + toasts on failure.
- [ ] **Gates:** `cd astros_api && npx tsc --noEmit -p tsconfig.json && npx vitest run`; `cd astros_vue && npm run lint && npx vue-tsc --noEmit -p tsconfig.app.json && npx vitest run`.
- [ ] **Pre-push:** `/pr-review-toolkit:review-pr`; address Critical/Important.
- [ ] **Commit** the QA plan.

---

## Notes / risks
- **Enum sync:** the `17` value must match on both sides (backend `TransmissionType`, frontend `WebsocketMessageType`) — a mismatch silently routes the frame to the wrong handler. Pin both in Task 1.
- **Safety:** verify `panicStop`/`panicClear` are NOT blocked by the read-only `writeGuard` (they currently use `authHandler` only — confirm no global write-guard middleware wraps them).
- **`clearPanicStop` notify:** notify unconditionally (idempotent); a redundant `false→false` broadcast is harmless.
- **Branch:** `feature/panic-state` (off merged `develop`). Commit this plan first.
