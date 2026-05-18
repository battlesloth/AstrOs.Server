# Firmware PR review — pre-push fix batch

Follows `.docs/plans/20260517-0817-firmware-pr-review-important-sweep.md`. The pre-push toolkit re-run on 2026-05-18 surfaced 7 Important findings, of which 3 are direct incompleteness in my own prior fixes:

- **The `.catch` belt** (commit `55ddbfe`) releases the lock but doesn't (a) emit a terminal WS event so the UI can escape `phase='flashing'`, (b) null per-job state fields (`deployUnsubscriber` leak could route stale events into the next flash), (c) accurately log whether the lock was actually wedged, (d) test the log breadcrumb.
- **The C3 audio regression** (commit `73ee268`) made `fileUpload({ limits, limitHandler })` global. The `/audio/savefile` route shares the middleware. Oversize audio uploads now get firmware-themed JSON the audio UI can't parse. The 50MB ceiling pre-existed; my change worsened the error path.
- **Plan-trail integrity** — my `20260517-0817` plan asserted Type I1/I2/I6 were "captured in 1734-followup." The 1734 stub uses its own internal numbering and doesn't cover those three items. Three Important type-design findings are orphaned with no tracker.

Plus a misleading comment in `upload.ts`, a duplicated word, an ambiguous test comment, and two dead Vue types.

## Scope guard

All 5 fixes are small (<30 LOC each, <50 for the belt rewrite). No new behavior; no new feature work. Stays inside the same operator-facing surface this branch already covers.

## Tasks

- [ ] **Belt second pass** (code-reviewer I2 + silent-failure New-1/2 + test-analyzer I1) — rewrite `flash_orchestrator.ts:823-841` to:
  - Wrap a best-effort `emitWs(flashJobFailed)` in its own inner try/catch BEFORE releasing the lock (UI exits `flashing` phase even when belt fires).
  - Null `runInProgress`, `currentJob`, `phase`, `deployUnsubscriber`, `throttle`, `abortController` WITHOUT invoking disposers (disposers may be what threw).
  - Check `release()` return value; log "force-released" vs "lock was already released" accordingly.
  - Extend the existing belt test to `vi.spyOn(logger, 'error')` and assert the emit was attempted (count `flashJobFailed` frames on `fx.emitWs`).
- [ ] **Route-scope upload size limit** (code-reviewer I1) — replace the global `app.use(fileUpload(...))` mount with path-prefixed mounts: 50MB+`limitHandler` for `/api/firmware/upload`, no size limit for `/api/audio/savefile`. Preserve `useTempFiles` + `tempFileDir` on both.
- [ ] **Rewrite misleading limitHandler disclaimer** in `models/firmware/upload.ts:43-48`. Acknowledge `firmwareUploadLimitHandler` is *defined* in `firmware_upload_controller.ts` and *wired* into express-fileupload's options in `api_server.ts`.
- [ ] **File orphaned type-design stub** for the three uncaptured run-1 Importants. Also fix the incorrect claim in the `20260517-0817-...md:12` line.
- [ ] **Prose + dead-type sweep**: drop one of the duplicated "per-controller" words at `flash_orchestrator.ts:297-298`; rewrite the "math is the same" comment at `chunk_streamer.test.ts:1906` to call out the inverted relationship; delete unused `FirmwareUploadErrorResponse` + `FirmwareUploadErrorCode` Vue types.
- [ ] **Pre-commit gate per task** — prettier + lint + build + vitest + `superpowers:requesting-code-review` for any non-prose-only diff.

## Out of scope (deferred)

- **Silent I2** (`cancelFlash` 404 swallow when WS dropped) — needs a UX call about WS-disconnected recovery; not introduced by my fixes.
- **Silent I5** (`fetchReleases` non-actionable copy) — needs new copy + Retry button; new UI work.
- **test-analyzer I2** (cross-side `it.each` pin for streamer reasons) — needs a design call about shared-type sourcing.
- **comment-analyzer I2** (`message_helper.ts:54-57` dead FW_CHUNK entry) — pre-existing, outside this branch's diff; surface for a separate cleanup.
- **silent-failure New-3/4/5** (limitHandler logging, defensive try/catch, Express.json 100KB default) — low-probability + new work; track separately if needed.

## Why this batch lives on this branch

All 5 items either *fix incompleteness in this branch's prior commits* (belt, C3 regression, plan integrity, misleading disclaimer) or *clean up prose drift this branch's commits introduced* (duplicate word, ambiguous test wording). The deferred items are separate concerns that pre-date this branch or need design discussion.
