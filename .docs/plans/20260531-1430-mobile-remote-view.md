# Mobile Remote View

Full design: approved plan `cosmic-finding-owl.md`. This is the execution tracker.

## Goal

Serve the live remote on mobile and have it send commands. Desktop unchanged. On a mobile browser (UA match OR viewport `< 768px`), after login land on a chrome-less `/mobile` view: a two-screen app (Remote ⟷ Status) toggled by a shared top bar whose button is color-coded by **WebSocket connection** (green/red). Mobile scope = Remote + Status + logout only.

## Tasks

- [ ] `utils/isMobileClient.ts` (+ spec) — pure `isMobileClient()` = mobile-UA OR `innerWidth < 768`. TDD.
- [ ] `api/endpoints.ts` — add `PANIC_STOP = 'api/panicStop'`.
- [ ] `composables/useRemoteCommands.ts` (+ spec) — `runScript`/`runPlaylist` (delegate to existing stores), `panicStop()` → `apiService.post(PANIC_STOP)`. TDD.
- [ ] `router/index.ts` — add `/mobile` route (no `AstrosLayout`); `beforeEach` redirect: mobile + path∉{/mobile,/auth} → `/mobile`; desktop + `/mobile` → `/`. Test the redirect logic.
- [ ] `AstrosMobileRemote.vue` — add `showTopBar` prop (default true); wrap internal top bar in `v-if`. Add spec case.
- [ ] `components/mobileRemote/mobileTopBar/AstrosMobileTopBar.vue` (+ stories, spec) — wordmark + color-coded toggle button; props `connected`, `screen`; emits `toggle`. frontend-design.
- [ ] `components/mobileRemote/mobileStatus/AstrosMobileStatus.vue` (+ stories) — mobile-styled panel reusing `AstrosStatus`; logout button (emits `logout`). frontend-design.
- [ ] `views/MobileRemoteView.vue` (+ spec) — shell: screen state, load pages, read `wsIsConnected` + controller statuses, wire `@press`/`@panic`/`@logout`. frontend-design.
- [ ] `locales/enUS.json` — `mobile.*` keys.
- [ ] QA plan `.docs/qa/mobile-remote.md`.
- [ ] Verify: `npm run test:unit`, `npm run build`; manual e2e per design doc. Pre-push `/pr-review-toolkit:review-pr`.

## Notes
- Reuse: `useScriptsStore().runScript`, `usePlaylistsStore().runPlaylist`, `useWebsocket().wsIsConnected`, `AstrosStatus`, `useControllerStore()` statuses, `useRemoteControlStore().loadRemoteControl()`, logout pattern from `AstrosLayout.vue:32`.
- Panic backend route already exists: `POST /panicStop` (`api_server.ts:571`). Only the frontend wire is new.
- Shared top bar lives in the shell; `AstrosMobileRemote` embedded with `:show-top-bar="false"`.
