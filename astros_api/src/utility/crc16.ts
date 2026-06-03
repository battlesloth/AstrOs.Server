// CRC-16/CCITT-FALSE for the FW_CHUNK serial-frame integrity check.
//
// Algorithm parameters per AstrOs.ESP `.docs/protocol.md` ("Shared values"):
//   poly = 0x1021, init = 0xFFFF, refIn = false, refOut = false, xorOut = 0
//
// Bit-by-bit reference implementation matching the firmware's PURE impl at
// AstrOs.ESP `lib_native/AstrOsBulkTransport/src/AstrOsBulkTransport.cpp:61-108`.
// The firmware comment notes: table-based would be faster but FW_CHUNK rate
// is bounded by the 115200-baud serial link, so no table needed. Same logic
// applies on the server side — Node's Buffer over a ~4KB chunk is sub-ms.
//
// Canonical check vector: `"123456789"` → `0x29B1`.

const POLY = 0x1021;
const INIT = 0xffff;

export function crc16CcittFalse(buf: Buffer | Uint8Array): number {
  let crc = INIT;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i] << 8;
    for (let bit = 0; bit < 8; bit++) {
      if (crc & 0x8000) {
        crc = ((crc << 1) ^ POLY) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc;
}

// Wire-format encoder for the FW_CHUNK `crc16-hex` field. Exactly 4
// lowercase hex chars, zero-padded, no `0x` prefix — matches the firmware's
// `parseHex16` contract (strict 4-char length, both cases accepted).
export function crc16CcittFalseHex(buf: Buffer | Uint8Array): string {
  return crc16CcittFalse(buf).toString(16).padStart(4, '0');
}
