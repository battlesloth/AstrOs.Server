# Playlist script-track duration (Seq Test wait bug)

## Problem

Playlist **Script** tracks store `duration_ds = 0` — the editor has no duration control for script tracks (`AstrosPlaylistTrack.vue` shows a duration input only for Wait tracks). `convertScriptTrack` uses the track's own `durationDS`, so the animation queue treats every script as 0-duration and advances to the next track the instant the script is *dispatched* (`AnimationQueue.dispatchTrack` → `setTimeout(playNextTrack, track.duration)`). A following Wait track therefore starts concurrently with the still-running script.

Observed on the `Seq Test` playlist (script → 10s Wait → script): the gap between the two servo-test scripts is `10s − scriptRuntime`, i.e. "nowhere near 10 seconds."

## Fix (load-time)

Resolve the referenced script's recorded duration when building the queue and use it for Script tracks. Wait tracks keep their user-set duration. Load-time (not save-time) so it works for existing playlists with no re-save and always reflects the current script length.

## Tasks

- [ ] `ScriptRepository.getScriptDurationsDS(): Promise<Map<string, number>>` — single `SELECT id, duration_ds FROM scripts`. Test-first.
- [ ] Thread `scriptDurations: Map<string, number>` through `convertPlaylistToQueueItem` → `convertScriptTrack` / `flattenPlaylistTrack`. Script tracks use `dsToMs(scriptDurations.get(trackId) ?? 0)`; Wait tracks unchanged. Test-first: rewrite existing converter script-duration tests to the new contract; add missing-script→0 and nested-script cases.
- [ ] Wire `runPlaylist` (api_server.ts) to build the map via the repo and pass it to the converter.
- [ ] Verify: full API build + tests; pre-push/pre-commit review; commit on `feature/regression_testing`.

## Notes

Uses the script's *recorded* duration (time of its last event). If a servo physically keeps moving past the last recorded event, a small residual overlap remains — that is a script-authoring matter (add a trailing hold event), not a queue bug.
