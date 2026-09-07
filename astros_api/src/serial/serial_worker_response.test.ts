import { describe, expect, it } from 'vitest';
import { SerialWorkerResponseType } from './serial_worker_response.js';

// Value-pin for the postMessage boundary: in integration runs the main thread
// executes src/ while the Worker runs compiled dist/, which can lag src/ if
// the mtime-based rebuild check is fooled (see the enum's own comment). An
// insertion that renumbers members silently remaps every response type in
// that skew window — this test turns the append-only rule from advisory
// comment into an enforced invariant.
describe('SerialWorkerResponseType wire values', () => {
  it('pins every member to its postMessage numeric value', () => {
    expect(SerialWorkerResponseType.UNKNOWN).toBe(0);
    expect(SerialWorkerResponseType.TIMEOUT).toBe(1);
    expect(SerialWorkerResponseType.POLL).toBe(2);
    expect(SerialWorkerResponseType.REGISTRATION_SYNC).toBe(3);
    expect(SerialWorkerResponseType.CONFIG_SYNC).toBe(4);
    expect(SerialWorkerResponseType.SCRIPT_DEPLOY).toBe(5);
    expect(SerialWorkerResponseType.SCRIPT_RUN).toBe(6);
    expect(SerialWorkerResponseType.SEND_SERIAL_MESSAGE).toBe(7);
    expect(SerialWorkerResponseType.UPDATE_CLIENTS).toBe(8);
    expect(SerialWorkerResponseType.FW_TRANSFER_BEGIN_ACK).toBe(9);
    expect(SerialWorkerResponseType.FW_CHUNK_ACK).toBe(10);
    expect(SerialWorkerResponseType.FW_CHUNK_NAK).toBe(11);
    expect(SerialWorkerResponseType.FW_TRANSFER_END_ACK).toBe(12);
    expect(SerialWorkerResponseType.FW_PROGRESS).toBe(13);
    expect(SerialWorkerResponseType.FW_DEPLOY_DONE).toBe(14);
    expect(SerialWorkerResponseType.FW_BACKPRESSURE).toBe(15);
    expect(SerialWorkerResponseType.POLL_NAK).toBe(16);
    expect(SerialWorkerResponseType.NO_OP).toBe(17);
  });
});
