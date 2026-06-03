# Fix: API base URL hardcoded to localhost breaks login from remote hosts

## Problem

`astros_vue/src/api/apiService.ts:8` sets the axios base URL to:

```js
baseURL: import.meta.env.BACKEND_API || 'http://localhost:3000',
```

`import.meta.env.BACKEND_API` is always `undefined` in the built bundle (Vite only
exposes `VITE_`-prefixed vars, and nothing sets it), so the fallback always wins.
Every API call (including `api/login`) is hardcoded to `http://localhost:3000`.

In production the bundle is served by nginx on the Pi at port 80. A browser on a
remote PC resolves `localhost:3000` to *the PC*, not the Pi → nothing listening →
`ERR_NETWORK`. On the Pi's own browser it happens to work, which masked the bug.

nginx (`container_files/nginx.conf`) already proxies `location /api/` →
`http://localhost:3000` on the Pi. The frontend should issue **same-origin
relative** requests so they flow through that proxy and reach the Pi's backend
from any host.

## Approach (chosen: relative everywhere + Vite dev proxy)

Make the API base URL relative in both dev and prod, mirroring how the WebSocket
composable (`useWebsocket.ts`) already derives its host from the page origin.

- **Prod:** relative `/api/...` → nginx proxy → backend. Works from any host.
- **Dev:** Vite dev server proxies `/api` → `http://localhost:3000`, so dev is
  same-origin too and exercises the same network shape as prod.

Out of scope: WebSocket (already correct — uses `window.location.hostname:5000`).

## Tasks

- [x] Change `apiService.ts` baseURL to `import.meta.env.VITE_BACKEND_API || '/'`
      (relative; `/` anchors at root regardless of current route since endpoints
      have no leading slash).
- [x] Add a `/api` dev proxy to `astros_vue/vite.config.ts` pointing at
      `http://localhost:3000`.
- [x] Add a test asserting `apiClient.defaults.baseURL` is relative (`/`) so a
      regression back to an absolute localhost URL fails the suite.
- [x] prettier:write + lint (vue) + build/type-check + vitest run, all green.
- [x] Code review on the diff, then commit.

## Deferred (noted in code review, out of scope for this fix)

- `UtilityView.vue` uses raw leading-slash API path literals (`/api/settings`,
  `/api/settings/controllers`, `/api/settings/logs`, ...) instead of `endpoints.ts`
  constants. Pre-existing, resolves correctly under the relative base. Promoting
  them to constants is a separate file-wide consistency cleanup.
