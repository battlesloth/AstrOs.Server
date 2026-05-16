# Firmware view — fast first paint after server restart

## Problem

First navigation to `/firmware` after a server restart shows a near-blank page for up to ~10 seconds. The page chrome (topology, controllers panel, source strip) is gated on `phase !== 'idle'`, and `FirmwareView#onMounted` does:

```ts
await Promise.all([firmware.fetchReleases(), firmware.fetchCurrentJob()]);
if (firmware.phase === 'idle') firmware.setPhase('select');
```

`fetchReleases` calls `GET /firmware/releases`, which in turn calls `GitHubReleaseService.getReleases()`. The service's cache is in-memory only (`private cache: CacheEntry | null = null`), so a server restart wipes it; the first call has to round-trip to `api.github.com` with up to a 10s `FETCH_TIMEOUT_MS`. Subsequent loads within the 5-min TTL feel instant. `fetchCurrentJob` is a local SQLite hit — not the bottleneck.

`AstrosFirmwareSourceStrip` already renders a `releases_loading` affordance when `releasesLoadState === 'loading'` (line 132), plus a `stale` warning and an `error` warning. The strip is fully equipped to communicate the in-flight state — but the view never renders it during the first load because `phase` is still `'idle'`.

## Approach (option 1 + 4)

Decouple the page-render gate from the GitHub fetch. The page paints as soon as the (fast) local job-state check resolves; the source strip's existing loading copy carries the operator through the GitHub wait.

`fetchCurrentJob` stays awaited because a refreshed-mid-flash resync sets `phase` directly to `'flashing'`/`'failed'`/`'done'`. Setting `phase = 'select'` first would cause a brief "Select firmware" flash before snapping to the live-flash UI on cold-load.

## Tasks

- [x] Update `FirmwareView.vue#onMounted` so `fetchCurrentJob` is awaited (gates phase transition), but `fetchReleases` runs as fire-and-forget. The page transitions to `'select'` as soon as the job check resolves, regardless of whether GitHub has replied.
- [x] In `AstrosFirmwareSourceStrip.vue`, disable the release `<select>` while `releasesLoadState === 'loading'` so the operator doesn't try to pick a release that isn't there yet. (The `releases_loading` text already shows where the tag/date would be.)
- [x] Add a regression test in `FirmwareView.spec.ts` confirming the view transitions out of `'idle'` even when `fetchReleases` is pending — using a pending promise for the releases call, the source strip should render before the promise resolves.
- [x] Pre-commit: `npm run prettier:write && npm run lint:fix && npm run build && npx vitest run` from `astros_vue/`, then `superpowers:requesting-code-review` on the diff. Manual QA: restart the API server, navigate to `/firmware`, confirm topology/panel paint immediately while the source strip shows "Loading releases…".

## Files touched

- `astros_vue/src/views/FirmwareView.vue` — `onMounted` rewiring
- `astros_vue/src/components/firmware/firmwareSourceStrip/AstrosFirmwareSourceStrip.vue` — disabled state on select during load
- `astros_vue/src/views/__tests__/FirmwareView.spec.ts` — regression test

## Out of scope

- Persisting the GitHub cache to disk (option 3 from the diagnostic) — larger change, separate plan if we want it.
- Warming the cache at server startup (option 2) — also separate; trade-off is every boot fetches even if nobody opens the page.
- A retry button next to the `releases_load_error` warning — would be nice, but the current path quietly re-fetches the next time the user revisits the page (cache empty → fresh attempt), so it isn't load-bearing.
