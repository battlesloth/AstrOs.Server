import { describe, it, expect, vi } from 'vitest';
import { JobLock } from '../job_lock/job_lock.js';
import { rejectIfLocked } from './ws_lock_guard.js';
import { TransmissionType } from '../models/enums.js';

function mockWs() {
  const ws: any = {};
  ws.send = vi.fn();
  return ws;
}

describe('rejectIfLocked (WebSocket inbound)', () => {
  it('returns false and sends nothing when lock is not held', () => {
    const lock = new JobLock();
    const conn = mockWs();

    const rejected = rejectIfLocked('SERVO_TEST', conn, lock);

    expect(rejected).toBe(false);
    expect(conn.send).not.toHaveBeenCalled();
  });

  it('returns false for non-write-class msgType even when locked', () => {
    const lock = new JobLock();
    lock.acquire('flashJob:abc');
    const conn = mockWs();

    const rejected = rejectIfLocked('SOMETHING_READ_CLASS', conn, lock);

    expect(rejected).toBe(false);
    expect(conn.send).not.toHaveBeenCalled();
  });

  it('returns true and sends lockStateChanged + flashJobActive when locked + write-class msgType', () => {
    const lock = new JobLock();
    lock.acquire('flashJob:abc');
    const conn = mockWs();

    const rejected = rejectIfLocked('SERVO_TEST', conn, lock);

    expect(rejected).toBe(true);
    expect(conn.send).toHaveBeenCalledTimes(2);

    // First frame: lockStateChanged echo with current state.
    const first = JSON.parse(conn.send.mock.calls[0][0]);
    expect(first.type).toBe(TransmissionType.lockStateChanged);
    expect(first.locked).toBe(true);
    expect(first.owner).toBe('flashJob:abc');

    // Second frame: flashJobActive error with rejected msgType.
    const second = JSON.parse(conn.send.mock.calls[1][0]);
    expect(second.type).toBe(TransmissionType.flashJobActive);
    expect(second.error).toBe('flashJobActive');
    expect(second.lockOwner).toBe('flashJob:abc');
    expect(second.rejectedMsgType).toBe('SERVO_TEST');
  });
});
