# Firmware OTA — Decomposition + Protocol Contract

## Context

We need to push firmware updates to the ESP fleet from the AstrOs web UI. The server (this repo) talks to a master ESP over serial; the master forwards to padawan ESPs over ESP-NOW. Today we have no way to do this — firmware ships via USB cable + esptool, manually, per controller. The UI design for the new "Firmware" view is already complete (high-fidelity, see `.docs/design_handoff_firmware_update/`); the recently-shipped heartbeat-with-firmware-version feature (PR #63, commits `6e2750a` + `1daf3a6`) is the foundation that makes per-controller version delta + post-flash verification possible.

**This plan is a decomposition + protocol contract.** It is not an implementation plan. It identifies sub-projects, fixes the wire-level interface between them, and hands off implementation details to per-sub-project plans that get written separately. Three of the five sub-projects live in `AstrOs.Server` (this repo); two live in the sibling `AstrOs.ESP` firmware repo.

The work is significant because the existing bulk-data transport in firmware is too fragile for 1.2 MB images: no CRC, no per-frame ACK, no retransmit, in-memory string concatenation in `PacketTracker`, and a 1-second packet timeout that will expire mid-transfer. The single biggest risk in this feature is hardening that transport — and it is exactly the work that will also fix the half-built script-deploy bulk path.

## Sub-project decomposition

| # | Name | Repo | Scope | Blocked by | Plan file path | Shippable alone? |
|---|------|------|-------|------------|----------------|-------------------|
| **c0** | Platform prerequisites | AstrOs.Server | DB column for `firmware_version` (migration_7), thread heartbeat version into controllers store, `JobLock` singleton with subscribe/notify, new `lockStateChanged` `TransmissionType`. No UI, no OTA. | — | `astros-server/.docs/plans/<date>-firmware-ota-c0-platform.md` | Yes — version persistence is independently useful for compatibility checks. |
| **a** | Bulk transport hardening | AstrOs.ESP | Replace `PacketTracker` with chunked, CRC-checked, ACK-driven, streaming-receive transport. Works over both serial (master side) and ESP-NOW (padawan side). New `BulkReceiver` callback API. Side-effect: fixes the half-built script-deploy bulk path. | — | `AstrOs.ESP/.docs/plans/<date>-bulk-transport-hardening.md` (create dir; mirror Server convention) | No — only meaningful when consumed by **b**. |
| **b** | OTA receiver | AstrOs.ESP | Master serial→SD writer; master SD→ESP-NOW forwarder (sequential); padawan ESP-NOW→`esp_ota_*` streaming writer; SHA-256 verify; commit + reboot; version-after-reboot via existing 2 s heartbeat. | **a** | `AstrOs.ESP/.docs/plans/<date>-ota-receiver.md` | No — useless without **c**. |
| **c** | Server orchestrator | AstrOs.Server | New `SerialMessageType` values; flash-job state machine; GitHub release fetch + 5-min cache + on-disk `.bin` cache (LRU N=5); upload handler with `esp_app_desc_t` validation; SHA-256 stream-hash; per-controller progress tracking; WebSocket fan-out; integrate with `JobLock`. | **c0**, **a** protocol freeze | `astros-server/.docs/plans/<date>-firmware-ota-server.md` | No — needs UI to be useful. |
| **d** | Vue Firmware view | AstrOs.Server (astros_vue/) | New `/firmware` route + nav entry; `FirmwareView` page; `firmware` Pinia store; `useWebsocket` handler additions; design tokens added to `styles.css`; `firmware_view.*` i18n; lock-aware UI banner so other views grey out write actions when locked. | **c** API contract; can mock against fixtures | `astros-server/.docs/plans/<date>-firmware-ota-vue.md` | No. |

**Build order:** **c0** → (**a** in parallel with **c**-stub-against-mock-firmware) → **b** → wire **c** to real **b** → **d** wires to real **c**.

## Protocol contract

The contract is the durable interface between sub-projects. **No sub-project plan should change these wire formats without amending this document and notifying the other sub-projects.** New `SerialMessageType` integer values are reserved starting at **30** (current last is `SERVO_TEST_ACK = 22`; gap leaves room for in-flight additions like `SERVO_TEST_NAK`).

### A. Server ↔ Master (serial)

Existing framing is unchanged: `[type(int)][RS][validator-string][RS][msg-id][GS][payload]\n` with `RS=0x1E`, `US=0x1F`, `GS=0x1D`. Chunk payloads are base64-encoded because the line-delimited framing breaks on raw binary.

**New `SerialMessageType` values:**

| Value | Name | Direction | Purpose |
|---|---|---|---|
| 30 | `FW_TRANSFER_BEGIN` | server → master | Announce job. Includes target list, total size, expected SHA-256, chunk size. |
| 31 | `FW_TRANSFER_BEGIN_ACK` | master → server | Ready / reject (e.g. SD full). |
| 32 | `FW_CHUNK` | server → master | One frame of base64-encoded bytes with seq + CRC-16. |
| 33 | `FW_CHUNK_ACK` | master → server | Cumulative ACK with `next-expected-seq` and `window-remaining`. |
| 34 | `FW_CHUNK_NAK` | master → server | Bad CRC / out-of-order with `last-good-seq`. |
| 35 | `FW_TRANSFER_END` | server → master | End-of-stream + final SHA-256. |
| 36 | `FW_TRANSFER_END_ACK` | master → server | `OK` \| `HASH_MISMATCH` \| `IO_ERROR` + computed hash. |
| 37 | `FW_DEPLOY_BEGIN` | server → master | Push staged SD copy to listed controllers, in given order. |
| 38 | `FW_PROGRESS` | master → server (unsolicited) | Per-controller, per-stage update. |
| 39 | `FW_DEPLOY_DONE` | master → server | All targets attempted; final per-controller report. |
| 40 | `FW_BACKPRESSURE` | master → server | Pause / resume sender. |

**Payload field layouts** (US between fields; RS between repeated groups):

```
FW_TRANSFER_BEGIN:    transfer-id<US>total-size<US>sha256-hex<US>chunk-size<US>target-list
                      target-list = controllerId[RS]controllerId[RS]...
                                    "master" included means master self-flashes last
FW_CHUNK:             transfer-id<US>seq<US>payload-len<US>base64-bytes<US>crc16-hex
FW_CHUNK_ACK:         transfer-id<US>highest-contiguous-seq<US>next-expected-seq<US>window-remaining
FW_CHUNK_NAK:         transfer-id<US>last-good-seq<US>reason-code   // CRC|SIZE|OUT_OF_ORDER|FLASH_FULL
FW_TRANSFER_END:      transfer-id<US>total-chunks<US>final-sha256-hex
FW_TRANSFER_END_ACK:  transfer-id<US>OK|HASH_MISMATCH|IO_ERROR<US>computed-sha256-hex
FW_DEPLOY_BEGIN:      transfer-id<US>order-list   // ordered ids, padawans first, master last
FW_PROGRESS:          transfer-id<US>controller-id<US>stage<US>bytes-sent<US>total-bytes<US>detail
                      stage = QUEUED|UPLOADING_TO_MASTER|SENDING|VERIFYING|REBOOTING
                              |VERSION_CONFIRMED|FAILED
FW_DEPLOY_DONE:       transfer-id<US>per-controller-result-list
                      result = controllerId<US>OK|FAILED<US>finalVersion<US>errorOrEmpty (RS-separated)
FW_BACKPRESSURE:      transfer-id<US>PAUSE|RESUME<US>reason
```

**Recommended values:** `chunk-size = 4096` decoded bytes (≈ 5.5 KB base64; ≈ 0.5 s transit at 115200 baud). Sliding window = 16 frames. Per-frame ACK timeout 1500 ms with up to 3 retries. Whole-transfer watchdog 5 min.

**Happy path (Body+Core+Dome all selected):**

```
Server                                Master
  |--FW_TRANSFER_BEGIN------------------>|     (open SD file)
  |<-FW_TRANSFER_BEGIN_ACK----------------|
  |--FW_CHUNK seq=0..N (sliding window)-->|     (write to SD, update streaming SHA)
  |<-FW_CHUNK_ACK ...---------------------|
  |--FW_TRANSFER_END--------------------->|     (verify SD hash)
  |<-FW_TRANSFER_END_ACK OK---------------|
  |--FW_DEPLOY_BEGIN order=core,dome,master->|
  |<-FW_PROGRESS core SENDING...----------|
  |<-FW_PROGRESS core VERIFYING-----------|
  |<-FW_PROGRESS core REBOOTING-----------|
  |<-FW_PROGRESS core VERSION_CONFIRMED---|     (master saw new version in heartbeat)
  |<-FW_PROGRESS dome ...same sequence----|
  |<-FW_PROGRESS master REBOOTING---------|     (master flashes self last)
  |<-FW_DEPLOY_DONE all=OK----------------|     (sent BEFORE master commits + reboots)
  |<-(silence ~8s while master reboots)---|
  |<-(POLL_ACK heartbeat: master version=target)
                                                Server holds the JobLock until this heartbeat.
```

**Failure modes:**
- CRC fail → `FW_CHUNK_NAK` with last-good-seq → server resumes from N+1.
- Hash mismatch at end → `FW_TRANSFER_END_ACK HASH_MISMATCH` → one retry of full transfer, then fail job.
- SD full → `FW_TRANSFER_BEGIN_ACK` rejects → fail job fast.
- Padawan unreachable / reboot timeout → master moves to next padawan, marks that controller `FAILED` in `FW_DEPLOY_DONE`. Per the "continue past failures" decision.

### B. Master ↔ Padawan (ESP-NOW)

Constraint: 250-byte ESP-NOW frame. Existing per-frame overhead leaves ≈150 bytes usable after CRC + seq fields. **Frames are binary packed structs, not US/RS-delimited** — every byte matters.

**New `AstrOsPacketType` values:**

| Name | Direction | Purpose |
|---|---|---|
| `OTA_BEGIN` | master → padawan | Announce: transfer-id, total size, SHA-256, chunk-size. |
| `OTA_BEGIN_ACK` / `OTA_BEGIN_NAK` | padawan → master | Padawan called `esp_ota_begin` / no free slot. |
| `OTA_DATA` | master → padawan | One chunk: transfer-id, seq, len, CRC-16-CCITT, payload. |
| `OTA_DATA_ACK` / `OTA_DATA_NAK` | padawan → master | Per-frame ACK with `next-expected-seq`, `window-remaining`. |
| `OTA_END` | master → padawan | End-of-stream + final SHA-256. |
| `OTA_END_ACK` | padawan → master | `OK` / `HASH_MISMATCH` / `WRITE_ERROR` + computed hash. |
| `OTA_COMMIT` | master → padawan | `esp_ota_set_boot_partition` + reboot. |
| `OTA_COMMIT_ACK` | padawan → master | About to reboot. (No post-reboot message; heartbeat carries the new version.) |

**Frame layouts** (binary, fixed-offset):

```
OTA_BEGIN payload (≈40 bytes):
  uint8  transfer-id
  uint32 total-size
  uint16 chunk-size           // recommend 128 bytes per OTA_DATA
  uint32 total-chunks
  uint8[32] sha256-expected
  uint8  flags                // bit0=enable-psram-buffer; rest reserved

OTA_DATA payload (≈148 bytes):
  uint8  transfer-id
  uint32 seq
  uint16 payload-len
  uint16 crc16-ccitt          // poly 0x1021, init 0xFFFF; over [transfer-id..payload]
  uint8  payload[chunk-size]

OTA_DATA_ACK / OTA_DATA_NAK:
  uint8  transfer-id
  uint32 highest-contiguous-seq
  uint32 next-expected-seq
  uint8  window-remaining     // backpressure
  uint8  reason-code          // 0 on ACK; CRC|WRITE|OUT_OF_ORDER|HEAP on NAK

OTA_END payload:               { uint8 transfer-id; uint32 total-chunks-sent; uint8[32] sha256-final; }
OTA_END_ACK payload:           { uint8 transfer-id; uint8 status; uint8[32] sha256-computed; }
OTA_COMMIT payload:            { uint8 transfer-id; }
OTA_COMMIT_ACK payload:        { uint8 transfer-id; uint8 rebooting; }   // rebooting always = 1
```

**Recommended timing/window:**
- Chunk size: **128 bytes** (1.2 MB / 128 ≈ 9400 frames per padawan).
- Sliding window: **8 frames** outstanding.
- Per-frame ACK timeout: **400 ms** with 3 retries.
- `OTA_BEGIN_ACK` timeout: **2 s** (padawan may erase a partition).
- `OTA_END_ACK` timeout: **5 s** (full SHA-256 over 1.2 MB takes 1–3 s on ESP32).
- Inter-padawan idle: **0 ms**.
- Post-`OTA_COMMIT` heartbeat poll: master polls padawan's heartbeat for `version === target` for **up to 15 s** before declaring `VERSION_CONFIRMED` or `FAILED detail=reboot_timeout`.

**Happy path (one padawan):**

```
Master                                 Padawan
  |--OTA_BEGIN--------------------------->|   esp_ota_begin(inactive_part)
  |<-OTA_BEGIN_ACK------------------------|
  |--OTA_DATA seq=0..7------------------->|   esp_ota_write each
  |<-OTA_DATA_ACK next=8 win=8------------|
  |     ... (sliding window) ...          |
  |--OTA_END------------------------------>|   esp_ota_end + sha256 verify
  |<-OTA_END_ACK OK------------------------|
  |--OTA_COMMIT---------------------------->|   esp_ota_set_boot_partition
  |<-OTA_COMMIT_ACK rebooting=1-------------|
  |  (silent: padawan reboots)              |
  |<-(POLL_ACK heartbeat: version=target)---|
  master records VERSION_CONFIRMED, moves to next padawan
```

**Failure modes:** v1 = abort that padawan and move on. Resume-from-seq-N is a future extension (the wire format already supports it via `next-expected-seq`).

### C. Server ↔ Vue (WebSocket)

**New `TransmissionType` values:** `flashJobStarted`, `flashControllerUpdate`, `flashControllerResult`, `flashJobDone`, `flashJobFailed`, `lockStateChanged`.

**JSON shapes** (existing `{ type, data }` envelope):

```jsonc
// flashJobStarted
{ "type": "flashJobStarted", "data": {
    "jobId": "uuid", "transferId": "uuid",
    "source": { "kind":"github"|"upload", "version":"1.4.0", "filename":"...", "sha256":"..." },
    "targets": [ { "controllerId":"...", "name":"...", "address":"AA:BB:..", "currentVersion":"1.3.2" }, ... ],
    "startedAt": "ISO-8601", "startedBy": "user-email"
}}
// flashControllerUpdate (throttled to 4 Hz per controller, latest-wins)
{ "type": "flashControllerUpdate", "data": {
    "jobId":"uuid", "controllerId":"core",
    "stage":"QUEUED|UPLOADING_TO_MASTER|SENDING|VERIFYING|REBOOTING|VERSION_CONFIRMED|FAILED",
    "bytesSent": 524288, "totalBytes": 1234567, "detail":"ok"
}}
// flashControllerResult (terminal per-controller)
{ "type":"flashControllerResult", "data": {
    "jobId":"uuid", "controllerId":"core",
    "result":"OK"|"FAILED", "finalVersion":"1.4.0"|null, "error":null|"reboot_timeout"
}}
// flashJobDone
{ "type":"flashJobDone", "data": {
    "jobId":"uuid", "endedAt":"...",
    "summary":[ { "controllerId":"core", "result":"OK", "finalVersion":"1.4.0" }, ... ]
}}
// flashJobFailed (job aborted before reaching DONE)
{ "type":"flashJobFailed", "data": {
    "jobId":"uuid", "endedAt":"...",
    "reason":"master_serial_disconnect"|"hash_mismatch_master"|"upload_failed"|"...",
    "partialSummary":[ ... ]
}}
// lockStateChanged
{ "type":"lockStateChanged", "data": { "locked":true|false, "owner":"flashJob:<jobId>"|null, "since":"..." }}
```

**Late-join behavior:** server holds in-memory `currentJob` snapshot. On WS connect, if a job is active, immediately send `flashJobStarted` + latest `flashControllerUpdate` per controller + current `lockStateChanged`, then resume the live stream. Auto-reconnect (3 s in `useWebsocket.ts`) means flapping clients re-subscribe mid-job — store latest-per-controller, not just last-broadcast, so the snapshot replay is correct.

## Bulk transport hardening (input for sub-plan **a**)

The single highest-risk sub-project. Requirements the firmware sub-plan must meet:

- **CRC:** CRC-16/CCITT-FALSE (poly `0x1021`, init `0xFFFF`). Use ESP-IDF's `esp_crc16_le`. CRC-16 sufficient because frames are tiny and outer SHA-256 covers the whole image.
- **ACK strategy:** explicit per-frame ACK with cumulative `highest-contiguous-seq` (TCP-style). NAK carries `last-good-seq`; sender Go-Back-N retransmits.
- **Sliding window:** 8 frames × 128 bytes = 1 KB inflight on ESP-NOW; 16 frames × 4 KB = 64 KB on serial.
- **Timeouts:** replace `PACKET_EXPIRATION_TIME = 1s`. Per-frame ACK 400 ms (ESP-NOW) / 1500 ms (serial) with 3 retries. Whole-transfer watchdog 3 min (ESP-NOW per padawan) / 5 min (serial). Make these `#define`s in a new `transport_config.h`.
- **Streaming receive callback API** (no in-memory concatenation — that's the `PacketTracker` heap-exhaustion bug):
  ```cpp
  struct BulkReceiver {
    virtual esp_err_t onBegin(uint8_t transferId, uint32_t totalSize, const uint8_t sha256[32]) = 0;
    virtual esp_err_t onChunk(uint8_t transferId, uint32_t seq, const uint8_t* data, size_t len) = 0;
    virtual esp_err_t onEnd(uint8_t transferId, const uint8_t computedSha256[32]) = 0;
    virtual void onAbort(uint8_t transferId, uint8_t reasonCode) = 0;
  };
  ```
  OTA receiver implements with `esp_ota_write` calls in `onChunk`. Master's SD writer implements with `fwrite` + incremental SHA-256.
- **Backpressure:** receiver signals via `OTA_DATA_ACK.window-remaining`. Master surfaces upward via `FW_BACKPRESSURE PAUSE/RESUME` so server can ease off.
- **Backwards compatibility:** new transport runs on **new packet types** only. The half-built `DEPLOY_SCRIPT` bulk types stay broken-ish until **a** lands; **a** should port script-deploy onto the new transport as a side-effect — document this so it's not lost.

## Source acquisition + caching (input for sub-plan **c**)

- **GitHub releases endpoint:** `GET https://api.github.com/repos/<owner>/AstrOs.ESP/releases` (anonymous, **60 req/hr per IP** — drives the cache decision).
- **Asset selection:** match `^astros-esp-v\d+\.\d+\.\d+\.bin$`; prefer exact `astros-esp-v${tag_name#v}.bin`; reject if `content_type` isn't octet-stream.
- **In-memory cache:** 5-min TTL keyed by repo. Serve stale on fetch error with a `staleSince` field surfaced in the API response.
- **On-disk cache** under `~/.config/astrosserver/firmware-cache/`:
  ```
  github/<assetname>.bin
  github/<assetname>.bin.sha256
  github/<assetname>.meta.json    // {tag, downloadedAt, sourceUrl, size}
  uploads/upload-<uuid>.bin (+ .sha256, .meta.json)   // most-recent only
  ```
  Eviction: keep newest 5 by semver descending (ties broken by `published_at` descending). Uploads keep the most recent only — replaced on next upload. **No delete-after-flash** (keeps retry capability).
- **SHA-256 computation:** stream-hash via `crypto.createHash('sha256')` piped into the download / upload stream. Never load 1.2 MB into a Buffer. Persist hex hash to `*.sha256` next to the bin so re-loads skip recomputation.
- **Upload mode:** `express-fileupload` with `useTempFiles: true, tempFileDir: '<appdata>/tmp'`. After temp-file lands, hash + parse `esp_app_desc_t` + atomic `fs.rename` to `uploads/upload-<uuid>.bin`.
- **Upload validation:** parse `esp_app_desc_t` from the .bin (well-known offset in ESP-IDF binaries). Verify `project_name` matches expected (e.g. `astros-esp` — confirm in firmware sub-plan). Extract `version` and use it to populate the UI's "Selected release" display. Reject mismatched binaries before flash.

## Hard-lock spec

- **What it guards** (block with HTTP 423 + JSON `{error, lockOwner, since}`):
  - `POST/PUT/DELETE /scripts/*`, `POST /scripts/:id/deploy`, `POST /scripts/:id/run`
  - `POST /controllers/:id/*` (config, format-sd, servo-test, run-command, direct-command)
  - `POST /playlists/*`, `POST /panic`
  - `POST /firmware/jobs` (only one flash job at a time)
  - WebSocket inbound write-class messages (`script | run | directCommand | formatSD | servoTest | sync`) → reject with `lockStateChanged` echo + `flashJobActive` error frame.
- **Server-side enforcement:** `JobLock` singleton (`src/job_lock.ts`) with `acquire(owner): boolean`, `release(owner)`, `isLocked()`, `getOwner()`, `subscribe(fn)`. Express middleware `requireUnlocked` applied to listed routes, **after** `authHandler`.
- **WebSocket reflection:** every `acquire`/`release` fires `lockStateChanged` to all clients. Other UI views use this to disable write controls site-wide.
- **Auto-release conditions:**
  1. **Master's post-reboot heartbeat returns with `version === target`** — primary release condition. Lock is held from `Push firmware` confirmation through master's full self-reboot cycle.
  2. `flashJobFailed` emitted (master serial disconnect, hash mismatch on master's SD copy, upload failed, etc.).
  3. Master heartbeat doesn't return within 15 s after `FW_DEPLOY_DONE` → emit `flashJobFailed reason=master_reboot_timeout`, then release.
  4. `SIGTERM`/`SIGINT` → emit `flashJobFailed reason=server_shutdown`. (No persistence — lock is gone after restart anyway per "no crash recovery" decision.)
- **Lock acquired BEFORE the GitHub download** so user sees "Preparing…" instead of being able to start a script edit during a 10–60 s download window.

## Verification gates per sub-project

| Sub-project | Gate | Hardware? |
|---|---|---|
| **c0** | Unit: heartbeat parsing populates `firmware_version`; `JobLock` acquire/release/subscribe; `lockStateChanged` JSON round-trip. Migration_7 applies cleanly + rolls back via existing backup path. | No |
| **a** | Host unit tests on `lib_native`: CRC verify, sliding-window state machine, ACK/NAK reordering, retransmit counter. **Hardware:** push 1.2 MB through ESP-NOW between two real ESPs and verify byte-exact via SHA-256. **Hardware:** push 1.2 MB serial → master SD, verify file hash on SD card. Stretch: fault-injection wrapper for frame loss. | Yes (≥2 boards) |
| **b** | **Hardware:** full Body+Core+Dome happy path with a .bin that boots with a distinguishable banner. Force a hash mismatch (server flips one byte) → padawan refuses commit, master reports `FAILED`, master itself stays on old firmware. Force a padawan reboot timeout → master moves on. Confirm `esp_ota_mark_app_valid_cancel_rollback` is called late enough that crash-on-boot rolls back. | Yes (full 3-board droid) |
| **c** | Mock master via `node-pty`/`socat` PTY pair running a stub firmware; drive full state machine through happy + each failure mode. Fixture-based GitHub API tests (no live calls in CI). On-disk cache eviction unit tests. SHA-256 stream test with a 1.2 MB fixture. `esp_app_desc_t` parse with real binary fixtures. | No for unit; Yes end-to-end with **b**. |
| **d** | Component tests with mocked Pinia store: each stage renders correct badge; lock-state disables firmware action button on other views; late-join replays snapshot correctly. Manual smoke against running **c** with stub firmware. | No |

## Open items — sub-plans must resolve

1. **`SerialMessageType` numbering reservation.** Lock the new range (30–40) in a shared `protocol.md` checked into both repos at the same commit so firmware and server cannot drift. Sub-plan **a** owns this file's creation; **c0** references it.
2. **Padawan rollback heuristic.** When does the padawan call `esp_ota_mark_app_valid_cancel_rollback`? Suggested: after first successful POLL_ACK heartbeat to master post-boot. Sub-plan **b** decides.
3. **"Body == master" naming.** The orchestration assumes Body controller IS the master. Visual design supports this (Body has the "MASTER" badge). Sub-plan **c** confirms via the controllers data model and notes if a different mapping is needed.
4. **`esp_app_desc_t` project_name string.** What value does AstrOs.ESP set in `CONFIG_APP_PROJECT_NAME`? Sub-plan **c** reads from firmware repo and bakes the expected value into the upload validator.
5. **Master report-DONE-then-reboot ordering.** Documented above: master sends `FW_DEPLOY_DONE` before its own commit-and-reboot. Server holds the lock until master's heartbeat returns. Sub-plan **b** must implement the strict ordering (DONE precedes commit).

## Critical files to study (per sub-plan author)

**c0 / c (server):**
- `astros_api/src/serial/serial_message.ts` — extend `SerialMessageType` enum + `SerialMsgConst`.
- `astros_api/src/serial/message_generator.ts` + `message_handler.ts` — wire-format precedent for new message types.
- `astros_api/src/api_server.ts:407–488` — serial worker bootstrap + WebSocket fan-out (`updateClients` line ~946).
- `astros_api/src/api_server.ts:571–620` — `handlePollResponse` and `StatusResponse` shape; reuse for version persistence.
- `astros_api/src/dal/database.ts` — Kysely migration provider; add `migration_7` for `firmware_version` column.
- `astros_api/src/file_controller.ts` — `express-fileupload` precedent for the new firmware upload handler.
- `astros_api/src/firmware_config.ts` + `astros_api/src/serial/semver.ts` — existing version-comparison utilities; reuse instead of porting JSX `compareTags`.

**d (Vue):**
- `astros_vue/src/views/ModulesView.vue:196–220` — chrome to copy.
- `astros_vue/src/components/common/AstrosLayout.vue:87–110` — sidebar nav; add Firmware entry.
- `astros_vue/src/router/index.ts:50–62` — route registration.
- `astros_vue/src/stores/controller.ts` — canonical Pinia composition-style pattern.
- `astros_vue/src/composables/useWebsocket.ts:85–122` — message-type switch + handler dispatch.
- `astros_vue/src/api/apiService.ts` + `endpoints.ts` — JWT interceptor + endpoint constants pattern.
- `astros_vue/src/locales/enUS.json` — i18n shape; add `firmware_view.*` + `nav.firmware`.
- `astros_vue/src/assets/styles.css` — add CSS vars for `--astros-ink`, `--astros-ink-soft`, `--astros-border`, `--astros-border-strong`, `--astros-success-green`, `--astros-warn-yellow`.
- `.docs/design_handoff_firmware_update/` — full UI spec (read README + `firmwareDirectionC.jsx` + `firmwareShared.jsx`).

**a / b (firmware):**
- `AstrOs.ESP/lib_native/AstrOsMessaging/src/PacketTracker.hpp` — replace; this is the heap-exhaustion + 1 s timeout bug.
- `AstrOs.ESP/lib_native/AstrOsMessaging/src/AstrOsSerialMessageService.hpp` — extend `AstrOsSerialMessageType` enum.
- `AstrOs.ESP/lib_native/AstrOsMessaging/src/AstrOsEspNowMessageService.hpp` — extend `AstrOsPacketType` enum + frame layout for `OTA_DATA`.
- `AstrOs.ESP/lib/AstrOsEspNow/src/AstrOsEspNowService.cpp:381–397` — packet-type dispatch for adding OTA handlers.
- `AstrOs.ESP/src/main.cpp:1500–1541` — `loadConfig()` + `isMasterNode` atomic. OTA dispatch differs by role.
- `AstrOs.ESP/src/main.cpp:388, 682–686` — heartbeat producer + version field; OTA reuses for "I'm back on new firmware" signal.
- `AstrOs.ESP/partition_8mb.csv` and `partition_16mb.csv` — confirmed correct (ota_0 + ota_1 + otadata); no changes needed.

## Implementation roadmap (each line becomes a sub-plan task)

- [ ] **c0** ships: `firmware_version` column + heartbeat persistence + `JobLock` + `lockStateChanged` WS event.
- [ ] Shared `protocol.md` committed to both repos at the same commit, reserving SerialMessageType range 30–40 and `AstrOsPacketType OTA_*` block.
- [ ] **a** ships: new bulk transport with CRC + ACK + sliding window + streaming-receive callback. Verified on hardware end-to-end with 1.2 MB fixture.
- [ ] **c** ships against stub firmware (PTY pair): full server orchestrator including GitHub fetch, on-disk cache, upload + `esp_app_desc_t` validation, flash-job state machine, hard-lock middleware, WebSocket fan-out.
- [ ] **b** ships: OTA receiver (master serial→SD→ESP-NOW forward + padawan ESP-NOW→OTA partition + commit + reboot).
- [ ] **c** swaps PTY stub for real master, end-to-end smoke on a 3-board droid.
- [ ] **d** ships: Vue `FirmwareView`, `firmware` Pinia store, design-token additions, lock-aware banner.
- [ ] Integrated end-to-end QA against a real release on the bench.

## Out of scope (explicit non-goals for v1)

- USB-bootstrap path for first-time install of OTA-capable master firmware (manual `esptool` + USB cable; documented in `AstrOs.ESP/README.md`).
- Cancel mid-flash.
- Persistent flash-job history / "View logs" detail page.
- Code signing, secure boot, flash encryption.
- Padawan-side resume-from-seq-N (wire format leaves room for it).
- Interleaved padawan flashing (wire format leaves room; v1 sequential).
- Survival of flash jobs across server restart.
- Firmware version reporting beyond what PR #63 already ships.
