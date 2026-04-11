# Animation Queue — Phase 2: Converter, API Wiring, Panic Clear

## Context

Phase 1 completed the AnimationQueue state machine and unit tests. Phase 2 wires it into the application: converting DB playlists into queue items, implementing the `runPlaylist` endpoint, adding script dispatch from the queue, and adding an explicit panic clear endpoint.

## Files to create/modify

- **Create** `astros_api/src/serial/animation_queue/playlist_converter.ts` — Playlist → AnimationQueuePlaylist conversion
- **Create** `astros_api/src/serial/animation_queue/playlist_converter.test.ts` — Converter unit tests
- **Modify** `astros_api/src/api_server.ts` — Instantiate queue, implement runPlaylist, add dispatchScriptFromQueue, panic integration, panic clear route

## Tasks

- [x] Write `playlist_converter.ts` — convert Playlist DB model to AnimationQueuePlaylist, resolving nested playlist tracks and converting durationDS to ms
- [x] Write `playlist_converter.test.ts` — unit tests with mocked PlaylistRepository
- [x] Wire AnimationQueue into api_server.ts — instantiate queue, implement runPlaylist, extract dispatchScriptFromQueue, add panic clear route
- [x] Run full test suite and verify

## Verification

```bash
cd astros_api && npx vitest run
```
