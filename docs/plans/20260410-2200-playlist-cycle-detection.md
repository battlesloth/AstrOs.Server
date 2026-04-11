# Playlist cycle detection

## Context

Copilot code review on the `playlist_work` PR flagged that `flattenPlaylistTrack()` in `astros_api/src/serial/animation_queue/playlist_converter.ts:42` recursively resolves nested playlist tracks but has no cycle detection. A playlist that directly or transitively includes itself would recurse indefinitely and crash the server at playback time.

Verified: there is **no** upstream guard. `PlaylistRepository.upsertPlaylist` at `astros_api/src/dal/repositories/playlist_repository.ts:13` performs no validation, so a cyclic playlist can be saved through the normal API path. The bug is real and reachable.

Additional context: silently skipping a cyclic branch at runtime is unsafe for droid animations — a skipped section (e.g., panel-open before a lightsaber launch) can leave the physical droid in a bad state and cause mechanical damage. **Failure must be loud, not silent.**

## Fix

Defense in depth across two layers:

1. **Converter guard** (`flattenPlaylistTrack`) — throw a clear error when a cycle is detected on the current call path. This prevents the infinite recursion at runtime and refuses to play a broken playlist. Use DFS path tracking (`Set<string>`, add-before-recurse / remove-after-recurse via `try/finally`) so that legitimate sibling duplicates of the same sub-playlist are allowed. The entry point `convertPlaylistToQueueItem` must seed the visited set with the top-level playlist's own ID, otherwise direct self-reference (`A → A`) isn't caught.

2. **Save-time validation** (`upsertPlaylist`) — reject saves that would create a cycle before writing anything to the DB. The check is **per-top-level-track**: for each `Playlist`-type track in the playlist being saved, walk the reference graph of the referenced sub-playlist and report whether the save target is reachable. The first top-level track that causes a cycle is reported back to the caller with **which specific track** (id + trackName + idx) is the culprit, so the frontend can tell the user exactly which entry to remove instead of making them guess.

### Error contract

A dedicated `PlaylistCycleError` class carries structured data from the repository layer up to the controller, which formats it into an HTTP response the frontend can display:

```ts
export class PlaylistCycleError extends Error {
  constructor(
    public readonly playlistId: string,
    public readonly offendingTrack: {
      id: string;
      trackName: string;
      idx: number;
      trackId: string;
    },
    message: string,
  ) {
    super(message);
    this.name = 'PlaylistCycleError';
  }
}
```

User-facing message format (constructed at the controller boundary):

> "Cannot save playlist: track \"{trackName}\" at position {idx + 1} creates an infinite loop. Remove or replace this track and try again."

The converter guard (runtime play) can throw the same error class but with a simpler message — at play time the user just needs "this playlist is broken, fix it in the editor."

## Tasks

- [x] **PlaylistCycleError class** — added at `astros_api/src/models/playlists/playlist_cycle_error.ts` with `playlistId`, `offendingTrack: OffendingTrackInfo`, and a default message format.

- [x] **Converter guard** — TDD `flattenPlaylistTrack` cycle detection
  - 3 new tests in `playlist_converter.test.ts`: direct self-reference throws, transitive cycle A→B→A throws, sibling duplicates allowed
  - DFS path tracking with `try/finally` cleanup in `playlist_converter.ts`; visited set seeded with top-level playlist ID in `convertPlaylistToQueueItem`; re-throws `PlaylistCycleError` with the top-level track as offender
  - `makeMockRepo` got a call-count safety net so the RED state fails cleanly instead of hanging the runner
  - All 15 converter tests pass, full suite 180/180

- [x] **Save-time validation** — TDD `upsertPlaylist` cycle rejection with per-track identification
  - 5 new tests in `playlist_repository.test.ts`: direct self-reference throws, direct self-reference identifies the correct offending track, transitive cycle A→B→A throws with the A-level track reported, sibling duplicates (not a cycle) save successfully, legitimate nested playlists save successfully
  - `validateNoCycles` + `isPlaylistReachable` helpers on `PlaylistRepository`; fresh visited set per top-level track walk (so sibling duplicates are not false-positives); called at the top of `upsertPlaylist` before any DB writes

- [x] **Controller error surfacing**
  - `playlist_controller.ts` `savePlaylist`: catches `PlaylistCycleError`, returns HTTP 400 with `{ error: 'playlist_cycle', message, offendingTrack }`. `savePlaylist` exported for test access. 2 new tests (cyclic → 400 + structured body, valid → 200).
  - `api_server.ts` `runPlaylist`: wrapped in try/catch; `PlaylistCycleError` → HTTP 409 with same structured body. Imports `PlaylistCycleError` via `src/*` alias to match converter's import path (avoids dual-module `instanceof` breakage in esbuild-based runtimes).
  - Frontend `playlists.ts` store `saveSelectedPlaylist`: extracts `error.response.data` on axios failure; on `playlist_cycle` response returns `{ success: false, errorCode: 'playlist_cycle', offendingTrack }` instead of the generic error.
  - Frontend `AstrosPlaylistEditor.vue` `save()`: checks for `errorCode === 'playlist_cycle'` and shows a localized toast with `trackName` + `position + 1` via the new i18n key.
  - New i18n key `playlist_editor_view.cycle_error` in `enUS.json`.

- [x] **Green checklist** — `npm run prettier:check` clean, `npm run lint` clean, `npm run test -- --run` 180/180 passing, Vue `npm run build` + `npm run test:unit -- --run` 1/1 passing, Vue lint + format clean. Ready to commit.

## Critical files

- `astros_api/src/models/playlists/playlist_cycle_error.ts` — **new** file with `PlaylistCycleError` class
- `astros_api/src/serial/animation_queue/playlist_converter.ts` — add cycle detection to `flattenPlaylistTrack`; seed visited set in `convertPlaylistToQueueItem`; throw `PlaylistCycleError`
- `astros_api/src/serial/animation_queue/playlist_converter.test.ts` — add three new test cases
- `astros_api/src/dal/repositories/playlist_repository.ts` — add `validateNoCycles` helper + call in `upsertPlaylist`; throw `PlaylistCycleError` with the top-level offending track
- `astros_api/src/dal/repositories/playlist_repository.test.ts` — add four new test cases (direct, transitive, sibling-duplicate negative, legitimate-nested negative)
- `astros_api/src/api_server.ts` — add `PlaylistCycleError` catch blocks at the save and play route boundaries, return structured 400/409
- `astros_vue/src/stores/playlists.ts` — (only if needed) surface the cycle error message to the user via toast

## Verification

```bash
cd astros_api
npm run lint:fix
npm run prettier:check
npm run test -- --run   # expect 170 + 6 new = 176 tests passing
```

Manual smoke test (optional): start the dev server, create playlist A, edit it to include itself as a track, hit save — expect a 4xx with a clear error message. Create playlist A and B where A contains B, then edit B to contain A and save — expect the same.
