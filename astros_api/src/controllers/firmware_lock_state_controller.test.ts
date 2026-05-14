import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getLockState } from './firmware_lock_state_controller.js';
import { JobLock } from '../job_lock/job_lock.js';

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('Firmware Lock State Controller', () => {
  let jobLock: JobLock;

  beforeEach(() => {
    jobLock = new JobLock();
  });

  describe('GET /api/firmware/lock-state', () => {
    it('returns 200 with the unlocked state when no flash job is active', () => {
      const req: any = {};
      const res = mockRes();

      getLockState(jobLock, req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        locked: false,
        owner: null,
        since: null,
      });
    });

    it('returns 200 with the locked state when a flash job is active', () => {
      jobLock.acquire('flashJob:abc');

      const req: any = {};
      const res = mockRes();

      getLockState(jobLock, req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const payload = res.json.mock.calls[0][0];
      expect(payload.locked).toBe(true);
      expect(payload.owner).toBe('flashJob:abc');
      expect(typeof payload.since).toBe('string');
      // ISO-8601 from JobLock.acquire — sanity-check it parses
      expect(new Date(payload.since).toString()).not.toBe('Invalid Date');
    });

    it('reflects state transitions across acquire/release', () => {
      jobLock.acquire('flashJob:abc');
      jobLock.release('flashJob:abc');

      const req: any = {};
      const res = mockRes();

      getLockState(jobLock, req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        locked: false,
        owner: null,
        since: null,
      });
    });
  });
});
