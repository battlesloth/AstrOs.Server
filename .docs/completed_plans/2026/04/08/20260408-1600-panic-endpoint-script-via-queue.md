# Light Plan: Panic Stop Endpoint + Script Run via Queue

## Context

Running a script independently while a playlist is playing could cause unexpected behavior on the ESP32s (multiple scripts dispatched simultaneously). All script execution should go through the AnimationQueue. Additionally, panic stop should be its own dedicated endpoint rather than a special case inside `runScript`.

## Tasks

- [x] Extract panic stop into its own `POST /panicStop` route — sends `PANIC_STOP` to serial worker and calls `animationQueue.panicStop()`. Remove panic logic from `runScript()`.
- [x] Change `runScript()` to queue a single-element Sequential playlist — load the script from DB to get `durationDS`, build an `AnimationQueuePlaylist` with one track, and add it to the queue. Remove the direct `serialWorker.postMessage` for `RUN_SCRIPT`.
- [x] Refactor `/remotecontrol` route to dispatch scripts or playlists — check if `req.query.id` starts with `'s'` (script) or `'p'` (playlist) and route to `runScript` or `runPlaylist` accordingly.
- [x] Update tests if any exist for these paths, verify full suite passes.

## Files to modify

- `astros_api/src/api_server.ts` — new `panicStop` route, refactor `runScript`, update `/remotecontrol`

## Key references

- `Script.durationDS` — available from `ScriptRepository.getScript(id)` at `dal/repositories/script_repository.ts:200`
- `AnimationQueuePlaylist` interface at `serial/animation_queue/queue_item/animation_queue_item.ts`
- `PlaylistType.Sequential` for the single-element wrapper
- Existing `runPlaylist()` pattern at `api_server.ts:668` for how to load locations and queue

## Verification

```bash
cd astros_api && npx vitest run
```
