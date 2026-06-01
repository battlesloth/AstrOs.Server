# Fix: script upload status lost on page refresh

## Problem

On the Scripts page, uploading a script correctly updates the dome/core/body
status badges, but after a page refresh every badge reverts to "Not uploaded" —
even though the deployment was persisted to the database.

## Root cause

`deploymentStatus` is a dictionary keyed by location. The two paths that
populate it disagree on the key:

- **Live WebSocket update** (`api_server.ts:1065` → `stores/scripts.ts:87`) keys
  by the location **name** (`'body' | 'core' | 'dome'`), the `Location` enum
  value.
- **Page-load read** (`script_repository.ts:192` in `getScripts()` and `:246`
  in `getScript()`) keys by `dep.location_id` — the `locations.id` **UUID** FK.

Every frontend consumer (`AstrosScriptRow.vue:26`, `ScriptsView.vue:104`,
`AstrosScriptTestModal.vue:70/77/84`) looks up by the `Location` enum name, so on
refresh the UUID keys never match → `undefined` → "Not uploaded".

The write path correctly uses the UUID for the FK column (pinned by the existing
`script_deployments FK contract` tests). Only the read-back key shape is wrong.
Both queries already `select locations.name as location_name`, so the name is in
hand — they just key by the wrong column.

## Fix

In `ScriptRepository.getScripts()` and `getScript()`, key `deploymentStatus` by
`dep.location_name` (the enum name) instead of `dep.location_id` (the UUID). Skip
rows with a null name (orphaned deployment with no matching location — the
frontend can't render it under any key anyway).

## Tasks

- [x] Add failing repository tests: a deployed script's `deploymentStatus` from
      `getScripts()` and `getScript()` is keyed by the location name, not the id
      (assert both the name-key is present and the id-key is absent). Confirm red.
- [x] Apply the key fix to both methods (lines 192 and 246). Confirm green.
- [x] Run full API suite (868 pass), lint (0 errors), prettier, build (tsc clean).
- [x] Code review the diff; address Critical/Important. (None found; ready to commit.)
- [x] Update QA plan note if one exists for the scripts page. (No scripts QA plan exists — no-op.)
