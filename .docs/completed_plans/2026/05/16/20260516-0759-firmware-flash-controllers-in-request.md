# Firmware flash — send selected controllers in the POST body

## Problem

The flash POST body is `{ source: { kind, version? } }` only — no controllers field. The Vue UI's selection (`firmwareStore.selectedControllerIds`) is decorative: the panel gates the Flash button on it, the confirm modal lists it, but **nothing crosses the network.** Server-side, `listFlashTargets()` returns `Array.from(controllerVariantCache.entries())` — every controller the server has ever heard a POLL_ACK with variant from. The orchestrator flashes that whole set regardless of what the operator picked.

Symptoms surfaced by this bug:
- Operator selects 2 of 3 controllers → server flashes all 3.
- Operator selects 2 → server's variantCache is empty (post-restart, pre-c.6c.1 firmware, or some unrelated reason) → `no_controllers` error. The error copy says "Pick at least one before flashing" which lies to the operator who already did.

## Approach

Add `controllers: string[]` to the request body. The list carries MAC addresses (the orchestrator's existing identity space). Server filters its `controllerVariantCache` to the requested MACs and proceeds with only those entries. Slot IDs are NOT used as the wire identity — MAC is what the chunk_streamer addresses over ESP-NOW, so MAC-end-to-end avoids a slot↔MAC resolution layer.

Edge cases:
- Empty list → `no_controllers` (existing reason, now actually means what the copy says).
- Requested MAC not in variantCache → new reason `controllers_unknown`, detail enumerates the missing MACs so the operator can diagnose ("Body controller hasn't reported its variant yet — wait a poll cycle and retry"). HTTP 400.
- Mixed variants across the selected subset → existing `variant_mismatch` still fires from `validateControllers`.
- `'local-build'` (upload mode) → same flow, same controllers list, same filter. Variant resolution downstream uses the uploaded artifact regardless of variant info per controller.

## Tasks

- [x] **Shared type contract.** Extend `FlashRequest` in `astros_api/src/models/firmware/flash_orchestrator.ts` to include `controllers: string[]`. Update `validateFlashRequest` in `astros_api/src/controllers/firmware_flash_controller.ts` to require it (non-empty array of strings). Add a new `FlashOrchestratorErrorReason` value `'controllers_unknown'`; add HTTP 400 to `REASON_HTTP_STATUS`.

- [x] **Orchestrator filter.** Change `ControllersStore.listFlashTargets()` (the interface at `flash_orchestrator.ts:357`) to accept a `requestedIds: string[]` argument and return only matching entries. Update the production implementation at `api_server.ts:573-577` to filter `controllerVariantCache.entries()` by the requested set. In the orchestrator's `start()` flow (`flash_orchestrator.ts:558`), pass `request.controllers` through. Throw `FlashOrchestratorError('controllers_unknown', detail)` with a comma-separated MAC list when any requested MAC is missing from the cache.

- [x] **Client payload.** Update `firmware.ts#startFlash` to include `controllers` in the POST body. Source: map each `selectedControllerIds` slot id to its MAC via `useControllerStore`'s MAC mapping (`bodyMac`/`coreMac`/`domeMac`, or the generic `controllerMacBySlot` accessor — check what exists). If a selected slot has no known MAC client-side, skip it AND log a console.warn so the operator at least has a breadcrumb (this case is structurally unusual — selection requires a controller row to exist, which requires LocationStatus, which carries MAC).

- [x] **i18n + UX.** Add `firmware_view.flash_errors.controllers_unknown` to `enUS.json` with operator-friendly copy mentioning that selected controller(s) haven't reported their firmware variant yet. Map the new reason in `mapHttpErrorToFlashEnvelope` (utils/firmwareFlashError.ts) and the `KNOWN_FLASH_ERROR_REASONS` set (types/firmware.ts).

- [x] **Tests.** Server side: validate the new request shape; reject missing/empty/non-array controllers; orchestrator filter respects requestedIds; `controllers_unknown` fires with detail when MACs missing. Client side: store's `startFlash` builds the right body shape; backwards-compat check that selected-but-no-MAC paths log + skip. Mutation-verify the new filter clause. Manual QA: select 2 of 3 controllers, confirm only those 2 receive the firmware (per WS progress events).

## Files touched

- `astros_api/src/models/firmware/flash_orchestrator.ts` — `FlashRequest` type
- `astros_api/src/controllers/firmware_flash_controller.ts` — validation + error mapping
- `astros_api/src/firmware/flash_orchestrator.ts` — `ControllersStore` interface, `start()` filter
- `astros_api/src/api_server.ts` — `listFlashTargets` implementation
- `astros_vue/src/stores/firmware.ts` — `startFlash` POST body
- `astros_vue/src/types/firmware.ts` — `KNOWN_FLASH_ERROR_REASONS` set
- `astros_vue/src/utils/firmwareFlashError.ts` — reason mapping
- `astros_vue/src/locales/enUS.json` — new copy
- Test files alongside each implementation file

## Out of scope

- Sending **slot IDs** (Body/Core/Dome) instead of MACs. MAC-based wire is the simpler path; slot abstraction can layer on top later if needed.
- Distinguishing the `controllers_unknown` failure mode in the UI **before** clicking Flash (e.g., a per-row "no variant yet" pill). This would require the UI to learn about variant cache state, which is server-only today.
- Rewriting the `controllerVariantCache` to be a persistent / DB-backed store. Today it's in-memory and wipes on restart. Out of scope; the new contract handles the empty-cache case with a clearer error and the operator can wait one poll cycle.
- Reconciling Body's sentinel MAC (`00:00:00:00:00:00`) with this flow. Per the `project_master_esp_sentinel_mac` memory, Body always reports the sentinel; the variantCache and chunk_streamer both handle this today. The new filter just needs to allow the sentinel as a valid MAC, which is naturally the case (it's a string key in the cache like any other).
