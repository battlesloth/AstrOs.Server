# Code Review: astros_vue

**Date:** 2026-04-09  
**Scope:** `astros_vue/src/` — full frontend codebase  
**Focus:** Bugs, unhandled exceptions, data loss, bad patterns, code smells

---

## Summary

The Vue frontend is well-organized with good patterns (Pinia, composables, i18n, Storybook), but has several categories of risk concentrated around data loss from missing navigation guards, PixiJS resource lifecycle, and WebSocket robustness.

| Category                        | Critical | High | Medium | Low |
| ------------------------------- | -------- | ---- | ------ | --- |
| Data loss / unsaved changes     | 1        | 2    | 2      | —   |
| Memory leaks / resource cleanup | 1        | 2    | 3      | —   |
| WebSocket robustness            | —        | 2    | 1      | 1   |
| Error handling gaps             | —        | 1    | 3      | 2   |
| Bugs (logic / typos)            | 1        | 1    | 1      | 2   |
| Code smells / patterns          | —        | —    | 3      | 4   |

---

## Critical Issues

### C-1: Remote control save button never calls the API

**File:** `components/remoteControl/AstrosRemoteControl.vue` ~L134-140

```typescript
async function saveConfig() {
  try {
    success(t('remote_view.save_success'));
  } catch (err) {
    console.error('Error saving remote control configuration:', err);
    error(t('remote_view.save_error'));
  }
}
```

The save function shows a success toast but never calls `remoteControlStore.saveRemoteControl()`. All button-to-script assignments edited by the user exist only in client memory and are lost on page refresh or navigation. The user sees a "save successful" message but nothing is persisted.

**Impact:** Complete data loss of remote control configuration on every edit session.

**Fix:**

```typescript
async function saveConfig() {
  try {
    const result = await remoteControlStore.saveRemoteControl();
    if (result.success) {
      success(t('remote_view.save_success'));
    } else {
      error(t('remote_view.save_error'));
    }
  } catch (err) {
    error(t('remote_view.save_error'));
  }
}
```

---

### C-2: PixiJS lifecycle race condition — unmount during async init

**File:** `components/scripter/AstrosPixiView.vue`

The PixiJS initialization is async:

```typescript
const initializePixi = async (scriptChannels: Channel[]) => {
  await init(); // Async — component could unmount here
  for (const channel of scriptChannels) {
    addChannel(channel); // Operates on potentially destroyed containers
  }
};
```

If the user navigates away from the scripter while PixiJS is initializing (e.g., slow load on ARM hardware), `onUnmounted` runs but `init()` continues. When it resolves, `addChannel` tries to add children to destroyed containers. Additionally, `Assets.load()` calls in `pixiChannelEvent.ts` fire callbacks that add sprites to destroyed containers.

Global event listeners (`mousemove`, `mouseup`, `wheel`) are registered during init but may not be cleaned up if unmount races the registration.

**Impact:** Orphaned PixiJS objects, leaked event listeners, potential console errors or silent memory leak.

**Fix:** Track a `destroyed` flag, check it after every `await`, and use an `AbortController` pattern for cancellable initialization.

---

## High Severity

### H-1: WebSocket URL hardcoded to localhost

**File:** `composables/useWebsocket.ts` L15

```typescript
ws.value = new WebSocket('ws://localhost:5000/ws');
```

This breaks in any deployment where the frontend is served from a different host than the API. In the Docker setup (nginx on port 8080 proxying to API on port 3000), this WebSocket URL is wrong. Users get no real-time status updates, controller sync feedback, or script deployment status.

**Impact:** WebSocket features broken in production/Docker deployment.

**Fix:** Derive from environment variable or current window location:

```typescript
const wsUrl = import.meta.env.VITE_WS_URL || `ws://${window.location.hostname}:5000/ws`;
```

---

### H-2: WebSocket reconnects on intentional disconnect

**File:** `composables/useWebsocket.ts` L27-30

```typescript
ws.value.onclose = () => {
  wsIsConnected.value = false;
  console.log('WebSocket disconnected, retrying in 3 seconds...');
  attemptReconnect();
};
```

The `onclose` handler always calls `attemptReconnect()`, even when the user intentionally disconnects (e.g., `wsDisconnect()` called from `App.vue`'s `onUnmounted`). The `wsDisconnect` function does set `ws.value = null` and clears the timeout, but there's a race: `onclose` fires before the timeout is cleared, scheduling a new reconnect.

Additionally, there's no exponential backoff — reconnection attempts hammer the server every 3 seconds indefinitely.

**Impact:** Unnecessary reconnection attempts after logout/navigation, potential connection storms.

**Fix:** Add an `intentionalClose` flag that suppresses reconnection when disconnect is deliberate.

---

### H-3: WebSocket message parsing has no error handling

**File:** `composables/useWebsocket.ts` L72

```typescript
function handleMessage(message: string) {
  const parsedMessage = JSON.parse(message) as BaseWsMessage;
  // ...
}
```

If the server sends malformed JSON (e.g., during a partial write, or a different message format in a future version), `JSON.parse` throws an unhandled exception. Since this runs in the `onmessage` callback, the exception propagates to the browser's event loop and may crash the WebSocket handler, preventing all subsequent messages from being processed.

**Impact:** One malformed WebSocket message breaks all real-time updates until page reload.

**Fix:** Wrap in try/catch.

---

### H-4: No navigation guards — unsaved script changes lost silently

**File:** `views/ScripterView.vue`

The scripter view allows editing script name, description, channel events, and timeline positions. None of these changes are auto-saved, and there is no `onBeforeRouteLeave` guard. If the user clicks a nav link or browser back button, all unsaved work is silently discarded.

This is particularly risky because script editing (timeline event placement, channel configuration) can involve significant user effort.

**Impact:** User loses potentially hours of animation scripting work with no warning.

**Fix:** Add dirty tracking and a navigation guard:

```typescript
onBeforeRouteLeave((to, from, next) => {
  if (isDirty.value) {
    const confirmed = window.confirm('You have unsaved changes. Discard them?');
    next(confirmed);
  } else {
    next();
  }
});
```

---

### H-5: PixiJS event listeners and textures not cleaned up on destroy

**File:** `pixiComponents/pixiChannelEvent.ts`, `pixiChannelData.ts`

Multiple PixiJS components attach `pointerdown`, `pointertap`, `pointerover`, `pointerout` listeners but never remove them. When a channel event is removed from the timeline, the container is removed from the display tree but listeners remain registered.

Additionally, `Assets.load()` is called per event instance for the same assets (e.g., `'servo'` icon loaded once per servo event box). These async callbacks can fire after the container is destroyed, adding sprites to removed containers.

```typescript
// pixiChannelEvent.ts — registered but never removed
this.on('pointerdown', ...)
this.on('pointertap', ...)

// Multiple async loads that can outlive the container
Assets.load('servo').then((texture) => {
  const icon = new Sprite(texture);
  this.addChild(icon);  // 'this' may be destroyed
});
```

**Impact:** Memory leak proportional to the number of events created/destroyed during a session. On long editing sessions, GPU memory accumulates.

**Fix:** Cache loaded textures at the module level instead of per-instance `Assets.load()`. Add a `destroy()` method that removes listeners and cancels pending loads.

---

## Medium Severity

### M-1: Endpoint path inconsistency — leading slash on `SYNC_CONFIG`

**File:** `api/endpoints.ts` L8

```typescript
export const SYNC_CONTROLLERS = 'api/locations/synccontrollers';
export const SYNC_CONFIG = '/api/locations/syncconfig'; // Leading slash
```

All other endpoints use relative paths (`api/...`), but `SYNC_CONFIG` has a leading slash. With axios `baseURL: 'http://localhost:3000'`, a leading slash causes the path to be treated as absolute, resulting in `http://localhost:3000/api/locations/syncconfig` which happens to work, but it's a landmine if `baseURL` ever includes a path prefix.

**Impact:** Latent bug — works by coincidence now, breaks under configuration changes.

---

### M-2: `deleteScript` in store removes from local array before API confirms

**File:** `stores/scripts.ts` ~L53-59

```typescript
async function deleteScript(scriptId: string) {
  try {
    await apiService.delete(SCRIPTS, { id: scriptId });
    scripts.value = scripts.value.filter((s) => s.id !== scriptId);
    return { success: true };
  } catch (error) {
    return { success: false, error: ... };
  }
}
```

This is actually correct — the filter only runs if the `await` succeeds. However, the same script could be deleted twice if the user double-clicks before the first request completes (no loading state or debounce on the delete button in `ScriptsView.vue`).

**Impact:** Double-delete sends two API calls; second one may error or no-op depending on server behavior.

---

### M-3: Blob URL leak in log download

**File:** `views/UtilityView.vue`

```typescript
const downloadLogs = async () => {
  const blob = await apiService.getBlob('/api/settings/logs');
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', 'logs.zip');
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Missing: window.URL.revokeObjectURL(url)
};
```

`createObjectURL` allocates a blob URL that isn't revoked. In a long-running session with multiple log downloads, blob URLs accumulate in memory. The DOM element is properly removed, but the URL reference persists.

**Impact:** Minor memory leak per download.

**Fix:** Add `window.URL.revokeObjectURL(url)` after `link.remove()`.

---

### M-4: API key generation uses `Math.random()` and only 10 characters

**File:** `views/UtilityView.vue`

```typescript
for (let i = 0; i < 10; i++) {
  result += characters.charAt(Math.floor(Math.random() * charactersLength));
}
```

`Math.random()` is not cryptographically secure, and 10 alphanumeric characters provide only ~60 bits of entropy. For an API key that controls physical hardware (droid motors, servos), this is borderline.

**Impact:** Weak API key for hardware control endpoint.

**Fix:** Use `crypto.getRandomValues()` and increase length to 32+ characters.

---

### M-5: Session check on every route navigation

**File:** `router/index.ts` L69-91

```typescript
router.beforeEach(async (to, from, next) => {
  if (!to.meta.public && to.path !== '/auth') {
    try {
      const response = await api.get(CHECK_SESSION);
```

Every route transition (including client-side SPA navigation between tabs) makes an API call to validate the session. On slow connections or when the API is busy processing serial commands, this adds noticeable latency to every navigation.

**Impact:** Sluggish navigation UX, especially on ARM SBCs under load.

**Fix:** Cache the session check result with a short TTL (e.g., 60 seconds), or only revalidate after a period of inactivity.

---

### M-6: Remote control pages use numbered button properties instead of array

**File:** `stores/remoteControl.ts`, `components/remoteControl/AstrosRemoteControl.vue`

The `RemoteControlPage` model uses `button1` through `button9` as separate properties, and the component maintains nine separate refs:

```typescript
const currentButton1Script = ref('0');
const currentButton2Script = ref('0');
// ... through button9
```

This makes the code brittle — any change to the number of buttons requires modifying ~20 lines across 3 files. The `setButtonScripts()` function has 9 identical lines. The `selectionChange()` function uses dynamic key construction (`button${number}`).

**Impact:** Maintenance burden, error-prone when adding/removing buttons.

---

## Low Severity / Code Smells

### L-1: Typos in `useHumanCyborgRelations.ts`

**File:** `composables/useHumanCyborgRelations.ts` L90, L104

```typescript
case HumanCyborgRelationsCmd.EXTREME_SAD:
  return 'Extreme ';  // Missing "Sad"

case HumanCyborgRelationsCmd.DISABLE_MUSE:
  return 'DDisable Muse';  // Extra 'D'
```

These display in the scripter UI when users configure Human Cyborg Relations events.

**Impact:** Cosmetic — incorrect labels in the event editor.

---

### L-2: Dead code — `pixiVerticalScrollBar.ts`

**File:** `pixiComponents/pixiVerticalScrollBar.ts`

The entire file is commented out. If it's no longer needed, it should be removed. If it's planned for future use, it should be tracked in an issue.

---

### L-3: `console.log/error` statements throughout production code

Multiple stores and composables use `console.log` and `console.error` for logging:

- `stores/scripts.ts` — `console.error` in every action
- `stores/playlists.ts` — same pattern
- `composables/useWebsocket.ts` — `console.log` on every message
- `components/remoteControl/AstrosRemoteControl.vue` — `console.log` on mount

These should use a centralized logging utility that can be silenced in production builds.

---

### L-4: `controller.ts` store has unused status refs

**File:** `stores/controller.ts`

```typescript
const domeStatus = ref(ControllerStatus.DOWN);
const coreStatus = ref(ControllerStatus.DOWN);
const bodyStatus = ref(ControllerStatus.DOWN);
```

These are exported but only updated by the WebSocket status handler. They're never read by any component based on the codebase exploration. If they're used by `AstrosStatus.vue`, this is fine — but worth verifying.

---

### L-5: FillGradient objects created for solid colors in PixiJS helpers

**File:** `pixiComponents/helpers.ts`, `pixiChannelList.ts`

```typescript
const fill = new FillGradient({
  end: { x: 0, y: 1 },
  colorStops: [
    { offset: 0, color: colorStart },
    { offset: 1, color: colorEnd },
  ],
});
```

When `colorStart === colorEnd`, this creates a gradient object for a solid color. `FillGradient` is heavier than a simple hex color value. Given that event boxes and channel labels are created in bulk (potentially hundreds), this adds unnecessary GPU overhead.

---

### L-6: String truncation in `helpers.ts` is O(n²)

**File:** `pixiComponents/helpers.ts` — `truncateText()`

The function repeatedly calls `CanvasTextMetrics.measureText()` on progressively shorter substrings until the text fits the target width. For long strings, this is O(n²) in measurement calls. Binary search would reduce this to O(n log n).

**Impact:** Minor — only noticeable with very long channel names.

---

## Recommendations (prioritized)

1. **Fix remote control save** (C-1) — trivial one-line fix, prevents total data loss
2. **Add navigation guards to ScripterView** (H-4) — prevents loss of user work
3. **Make WebSocket URL configurable** (H-1) — blocks production deployment
4. **Add try/catch to WebSocket message handler** (H-3) — prevents cascading failures
5. **Add PixiJS lifecycle guard** (C-2) — prevents memory leaks on navigation
6. **Suppress reconnection on intentional disconnect** (H-2) — prevents connection storms
7. **Cache or preload PixiJS textures** (H-5) — reduces memory churn on timeline
8. **Fix endpoint path inconsistency** (M-1) — prevent future breakage
9. **Revoke blob URLs after download** (M-3) — minor memory hygiene
10. **Fix HCR typos** (L-1) — cosmetic but quick
