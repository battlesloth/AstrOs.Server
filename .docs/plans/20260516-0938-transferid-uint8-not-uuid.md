# `transferId` wire format — uint8 not UUID

## Problem

Firmware OtaReceiver rejects every `FW_TRANSFER_BEGIN` from the server with `transferId='<uuid>' is not 0..255 numeric` (logged from `lib/OtaReceiver/src/OtaReceiver.cpp:65`). Server generates `transferId = uuid_v4()` at `flash_orchestrator.ts:601`, but the protocol-doc canonical at AstrOs.ESP `.docs/protocol.md` defines transfer-id as **`uint8`** (see the ESP-NOW `OTA_BEGIN payload` section, and consistent with all the serial-frame field-layout entries that read `transfer-id<US>...`). The firmware's BulkReceiver wants a `uint8_t xferId` natively; OtaReceiver does the string→u8 conversion at the seam (`parseStrictU8`) and surfaces this error when conversion fails.

Pre-existing protocol mismatch from the c.6c.1 orchestrator skeleton commit (`60f1c46`). Existing server test at `flash_orchestrator.test.ts:773` actively pins the WRONG contract (`expect(result.transferId).toMatch(/^[0-9a-f-]{36}$/)` — UUID regex).

## Approach

Replace `uuid_v4()` with a rotating uint8 counter on the orchestrator instance. The counter increments mod 256 per job. Single-slot semantics (the JobLock prevents concurrent transfers) means 256-deep collision-free history; a rolled-over collision would only land on a completed transfer's id, and the firmware's BulkReceiver clears active state on transfer end so reuse is safe.

Keep `transferId: string` everywhere in the TS type surface — the wire is a string of digits regardless, and changing it to `number` would touch 60+ call sites for no semantic gain.

## Tasks

- [ ] **Orchestrator: rotating uint8 transfer-id.** Replace `const transferId = uuid_v4();` at `flash_orchestrator.ts:601` with a `this.nextTransferId` counter (private field, initialized to 0). On each new transfer: take the current value (as `String(n)`), then increment + wrap (`(n + 1) & 0xff`).

- [ ] **Update the test that pins UUID format.** `flash_orchestrator.test.ts:773` asserts the UUID regex. Replace with `/^[0-9]{1,3}$/` AND a numeric range assertion (`Number(result.transferId) >= 0 && < 256`). Add a sibling test for the rotation invariant: two successive flash starts produce sequential transferIds (mutation-verifies that the counter is actually counter-like, not a constant).

- [ ] **Pipeline + commit.** Same active branch (mid-test feedback). Format + lint + build + vitest. Manual: bench-side, restart server, retry flash — the OtaReceiver error should be gone.

## Files touched

- `astros_api/src/firmware/flash_orchestrator.ts` — replace UUID generation
- `astros_api/src/firmware/flash_orchestrator.test.ts` — replace format assertion + add rotation test

## Out of scope

- **Threading the new uint8 type all the way through `TransferSpec` etc.** Keeping `transferId: string` matches the wire and saves 60+ touch sites. The single seam where parseInt happens is the firmware OtaReceiver; the server stays in string-space.
- **Persisting the counter across server restarts.** In-flight transfers don't survive restarts anyway (the JobLock is in-memory). Counter resets to 0 on boot, no correctness implications.
- **Updating `.docs/protocol.md` in AstrOs.ESP.** The protocol doc is already correct — the server was wrong. No coordinated cross-repo amendment needed.
