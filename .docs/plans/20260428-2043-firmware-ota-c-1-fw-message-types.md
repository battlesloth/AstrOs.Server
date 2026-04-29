# c.1 — FW_\* SerialMessageType extensions + serializers

Light plan for the first server-orchestrator PR of the firmware-OTA decomposition. Builds on the now-frozen [`.docs/protocol.md`](../protocol.md) contract.

**Branch:** `feature/firmware-ota-c-1-fw-message-types` (off `develop`).
**PR target base:** `develop`.
**References:** [decomposition plan](./20260427-2202-firmware-ota-decomposition.md), [protocol contract](../protocol.md).

## Context

Implements the server-side wire layer for the cross-repo OTA protocol: extends `SerialMessageType` and validator strings with the 11 reserved `FW_*` values (30–40), adds 4 outgoing-message generators, adds 7 incoming-message handlers, and ships round-trip tests in both directions.

Stays within the existing serial-protocol patterns (`MessageGenerator.generateMessage` switch dispatch, `MessageHandler` per-type methods, `MessageHelper.ValidationMap` lookup, `SerialWorkerResponseType` for inbound). No flash-job state machine, no orchestration logic — those land in c.6. No `api_server.ts` dispatch wiring for the new handlers — that also lands in c.6. This PR ships the *capability*; c.6 wires it into a flow.

## Tasks

- [ ] **Foundation.** Extend `SerialMessageType` (values 30–40) and `SerialMsgConst` validator strings in `serial_message.ts` to match `.docs/protocol.md` § A. Extend `MessageHelper.ValidationMap` with the 11 new mappings. Add `MessageTimeouts` entries for the 4 outgoing types (`FW_TRANSFER_BEGIN` 5000 ms; `FW_CHUNK` 1500 ms per the protocol contract; `FW_TRANSFER_END` 5000 ms; `FW_DEPLOY_BEGIN` 5000 ms).
- [ ] **Typed payloads.** New `astros_api/src/models/firmware/firmware_messages.ts` consolidating typed interfaces for all 11 message payloads. Each interface mirrors the field layout from `.docs/protocol.md`: `FwTransferBegin`, `FwTransferBeginAck`, `FwChunk`, `FwChunkAck`, `FwChunkNak`, `FwTransferEnd`, `FwTransferEndAck`, `FwDeployBegin`, `FwProgress`, `FwDeployDone`, `FwBackpressure`. Stage enum included (matching protocol).
- [ ] **Outgoing generators.** Add `generateFwTransferBegin`, `generateFwChunk`, `generateFwTransferEnd`, `generateFwDeployBegin` to `MessageGenerator`, plus four new cases in the `generateMessage` switch. Each generator returns the existing `MessageGeneratorResponse` shape (msg + controllers + metaData=transferId).
- [ ] **Incoming handlers.** Add `handleFwTransferBeginAck`, `handleFwChunkAck`, `handleFwChunkNak`, `handleFwTransferEndAck`, `handleFwProgress`, `handleFwDeployDone`, `handleFwBackpressure` to `MessageHandler`. Each parses the wire payload (US/RS-separated per protocol) into a typed response.
- [ ] **Inbound response types.** Extend `SerialWorkerResponseType` with `FW_TRANSFER_BEGIN_ACK`, `FW_CHUNK_ACK`, `FW_CHUNK_NAK`, `FW_TRANSFER_END_ACK`, `FW_PROGRESS`, `FW_DEPLOY_DONE`, `FW_BACKPRESSURE`. Add response interfaces extending `ISerialWorkerResponse` for each.
- [ ] **Tests.** Round-trip tests in `message_generator.test.ts` and `message_handler.test.ts`: build payload → generate string → parse string → assert parsed payload matches original. Cover happy path for each of the 11 types plus malformed-input rejection for the 7 handlers.

## Verification

- [ ] `npm run build` clean (lint + tsc) in `astros_api/`.
- [ ] `npm run test` green for all serial-related test files. Each round-trip test demonstrates the generator's output is parseable by the corresponding handler.
- [ ] `npm run prettier:write` and `npm run lint:fix` clean.
- [ ] Visual cross-check: enum integer values 30–40 match `.docs/protocol.md` § "Reserved enum ranges". Validator strings match table A names exactly (`FW_TRANSFER_BEGIN`, etc.).

## Files in scope (8)

1. `astros_api/src/serial/serial_message.ts` — extend `SerialMessageType` + `SerialMsgConst`
2. `astros_api/src/serial/message_helper.ts` — extend `ValidationMap` + `MessageTimeouts`
3. `astros_api/src/serial/serial_worker_response.ts` — extend enum + add 7 response interfaces
4. `astros_api/src/serial/message_generator.ts` — add 4 generators + switch cases
5. `astros_api/src/serial/message_handler.ts` — add 7 handlers
6. `astros_api/src/serial/message_generator.test.ts` — generator + round-trip tests
7. `astros_api/src/serial/message_handler.test.ts` — handler + round-trip tests
8. `astros_api/src/models/firmware/firmware_messages.ts` — new directory + consolidated typed payload interfaces (server-side counterpart to `.docs/protocol.md` § A)

8 files — within the soft cap. The typed-payloads consolidation into one file (instead of one-file-per-message) is a deliberate choice: the 11 interfaces are tightly coupled by the protocol and easier to read together than scattered across 11 files.

## Out of scope

- No `api_server.ts` dispatch wiring for the new handlers — c.6 will route inbound `FW_*` ack/nak/progress messages to the flash-job orchestrator.
- No flash-job state machine, GitHub fetching, file upload, on-disk cache — those are c.3 through c.8.
- No actual hardware integration — round-trip tests verify only the wire layer.
- No protocol amendments — if implementation reveals a gap in `.docs/protocol.md`, that gets a separate cross-repo amendment commit (paired with AstrOs.ESP) before this PR merges.

## Notes for the reviewer

- Both copies of `.docs/protocol.md` (this repo + AstrOs.ESP) are the source of truth for enum numbers and field layouts. Cross-check against table A there.
- `FW_PROGRESS` is unsolicited (master → server, no preceding request); the generator pattern doesn't apply. Only the handler exists in this PR.
- `FW_CHUNK` uses base64 encoding for binary payload because the line-delimited framing (`\n` terminator) breaks on raw binary. Decoded chunk size is 4096 bytes; encoded ≈ 5500 bytes per `FW_CHUNK` line.
- The `metaData` field on `MessageGeneratorResponse` carries `transferId` for outgoing FW_* messages, mirroring the existing pattern for `scriptId` on `RUN_SCRIPT` / `DEPLOY_SCRIPT`. c.6 will consume this for state tracking.
