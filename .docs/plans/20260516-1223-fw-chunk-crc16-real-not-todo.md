# FW_CHUNK CRC-16 — replace `'TODO_TASK_4_CRC16'` placeholder

## Problem

The server's `FW_CHUNK` payload's `crc16-hex` field is the literal string `'TODO_TASK_4_CRC16'` (placeholder at `chunk_streamer.ts:324`). The firmware-side parser `parseFwChunk` at `lib_native/AstrOsMessaging/src/AstrOsSerialMessageService.cpp:589-628` calls `parseHex16` on this field, which requires **exactly 4 hex characters**. The placeholder fails the parse, every chunk is rejected as "Invalid message," and the master never sends `FW_CHUNK_ACK` — which both blocks the transfer AND causes the master's RX serial buffer to overflow (the streamer keeps the 16-chunk sliding window full because no ACK closes any slot).

The placeholder was deliberately non-numeric ("greppable marker, replaced when the master starts checking it" — comment at chunk_streamer.ts:319-323). The master is now checking it; time to compute the real CRC.

## Approach

Add `astros_api/src/utility/crc16.ts` with:

```ts
export function crc16CcittFalse(buf: Buffer | Uint8Array): number;
export function crc16CcittFalseHex(buf: Buffer | Uint8Array): string;  // 4 lowercase hex chars
```

Algorithm: CRC-16/CCITT-FALSE per AstrOs.ESP `.docs/protocol.md` (poly `0x1021`, init `0xFFFF`, no input/output reflection, xorOut 0). Bit-by-bit reference impl — matches the firmware's PURE implementation at `lib_native/AstrOsBulkTransport/src/AstrOsBulkTransport.cpp:61-108`. Canonical check vector: `"123456789"` → `0x29B1`.

CRC is computed over the **decoded chunk bytes** (the raw binary slice, NOT the base64 string) — protocol-doc serial scope: *"over the decoded payload bytes."*

Format: 4 lowercase hex chars, no `0x` prefix. The firmware's `parseHex16` accepts both cases but the rest of the protocol (sha256-hex) uses lowercase, so match the convention.

## Tasks

- [ ] **New utility + tests.** `astros_api/src/utility/crc16.ts` exports the two functions. `crc16.test.ts` covers: the canonical check vector (`"123456789"` → `0x29B1`); the empty-input edge case (returns init value `0xFFFFu`); known-good vectors for round-trip with the firmware impl; hex formatter pads to 4 chars (`0x00AB` → `"00ab"`). No mutation-test gate needed beyond the canonical-value test — the algorithm is fixed.

- [ ] **Wire into chunk_streamer.** Replace `crc16Hex: 'TODO_TASK_4_CRC16'` at `chunk_streamer.ts:324` with `crc16Hex: crc16CcittFalseHex(chunkBytes)`. Drop the TODO comment block above it (it was load-bearing while the placeholder existed; with the real impl in place the comment becomes drift).

- [ ] **Pipeline + commit.** Same active branch. Format + lint + build + vitest. Manual: bench-side, retry the flash — expect the master to ACK chunks instead of "Invalid message," and the RX buffer overflow warnings to subside as the streamer's sliding window drains naturally via ACKs.

## Files touched

- `astros_api/src/utility/crc16.ts` (new)
- `astros_api/src/utility/crc16.test.ts` (new)
- `astros_api/src/firmware/chunk_streamer.ts` — replace the placeholder + comment

## Out of scope

- **Table-based CRC for performance.** Firmware uses bit-by-bit (matching here) and notes the rate is bounded by the 115200-baud link, not CRC compute. Same applies on the server side — Node's Buffer over the ~4KB chunk is fast enough.
- **The `Buffer overflow` warnings.** Expected to subside once the master starts ACKing (sliding window flows normally). If they persist after the CRC fix, it's a separate flow-control / chunk-size / master-RX-buffer-size investigation — different bug, different plan.
- **CRC over the wire-line bytes** (some protocols put the CRC over the full message). Spec is explicit: decoded payload only. Don't include header / framing / base64 envelope.
