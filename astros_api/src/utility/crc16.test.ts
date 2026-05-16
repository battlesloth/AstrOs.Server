import { describe, it, expect } from 'vitest';
import { crc16CcittFalse, crc16CcittFalseHex } from './crc16.js';

describe('crc16CcittFalse', () => {
  it('matches the canonical CRC-16/CCITT-FALSE check vector', () => {
    // "123456789" → 0x29B1 is the canonical reference per the protocol doc
    // (AstrOs.ESP .docs/protocol.md "Shared values" table) AND every
    // CRC-16/CCITT-FALSE specification. Pin so a mutation to the polynomial,
    // init value, or reflection setting is caught immediately.
    const result = crc16CcittFalse(Buffer.from('123456789', 'ascii'));
    expect(result).toBe(0x29b1);
  });

  it('returns the init value 0xFFFF for empty input', () => {
    // Boundary case: the algorithm's init seed is 0xFFFF; no input means no
    // bytes XOR in, so the seed is the answer. Matches the firmware impl's
    // explicit early-return at AstrOsBulkTransport.cpp:87-90.
    expect(crc16CcittFalse(Buffer.alloc(0))).toBe(0xffff);
  });

  it('single zero byte: 0xE1F0 (sanity vector)', () => {
    // A second known-good vector beyond the canonical one — guards against a
    // mutation that broke the byte-XOR step but coincidentally matched 0x29B1
    // on "123456789". A single null byte exercises only the high-bit branch.
    expect(crc16CcittFalse(Buffer.from([0x00]))).toBe(0xe1f0);
  });

  it('all-0xFF bytes: deterministic, exercises the high-bit branch every iteration', () => {
    // Cross-check: 8 0xFF bytes feed the high-bit XOR branch every cycle.
    // Computed against this implementation and confirmed externally; pin so
    // a mutation that broke the polynomial-XOR step would diverge from
    // 0x97DF even though the "123456789" canonical test might coincidentally
    // still pass on certain wrong polynomials.
    const buf = Buffer.alloc(8, 0xff);
    expect(crc16CcittFalse(buf)).toBe(0x97df);
  });

  it('accepts Uint8Array as well as Buffer', () => {
    // Buffer extends Uint8Array; the impl is typed to accept either so a
    // caller passing a non-Buffer Uint8Array (e.g. Web Streams slice) works.
    const u8 = new Uint8Array([0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39]);
    expect(crc16CcittFalse(u8)).toBe(0x29b1);
  });
});

describe('crc16CcittFalseHex', () => {
  it('formats as 4 lowercase hex chars, zero-padded, no 0x prefix', () => {
    // Wire-protocol contract: parseHex16 on the firmware side requires
    // exactly 4 chars. Both cases are accepted; we emit lowercase to match
    // the convention used by sha256-hex elsewhere in the protocol.
    expect(crc16CcittFalseHex(Buffer.from('123456789', 'ascii'))).toBe('29b1');
  });

  it('pads a small CRC to 4 chars (two leading zeros)', () => {
    // crc16([0x0E]) = 0x003E — actually exercises `.padStart(4, '0')`.
    expect(crc16CcittFalseHex(Buffer.from([0x0e]))).toBe('003e');
  });
});
