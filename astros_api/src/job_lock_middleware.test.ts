import { describe, it, expect, vi } from 'vitest';
import { JobLock } from './job_lock.js';
import { requireUnlocked } from './job_lock_middleware.js';

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('requireUnlocked', () => {
  it('calls next() when the lock is not held', () => {
    const lock = new JobLock();
    const middleware = requireUnlocked(lock);
    const req: any = {};
    const res = mockRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('responds 423 with LockedErrorResponse body when the lock is held', () => {
    const lock = new JobLock();
    lock.acquire('flashJob:abc');
    const middleware = requireUnlocked(lock);
    const req: any = {};
    const res = mockRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(423);
    expect(res.json).toHaveBeenCalledTimes(1);
    const body = res.json.mock.calls[0][0];
    expect(body.error).toBe('flashJobActive');
    expect(body.lockOwner).toBe('flashJob:abc');
    expect(body.since).not.toBeNull();
  });

  it('passes again after the lock is released', () => {
    const lock = new JobLock();
    lock.acquire('flashJob:abc');
    const middleware = requireUnlocked(lock);

    // First request — locked.
    const blockedRes = mockRes();
    const blockedNext = vi.fn();
    middleware({} as any, blockedRes, blockedNext);
    expect(blockedNext).not.toHaveBeenCalled();

    // Release and retry.
    lock.release('flashJob:abc');
    const passRes = mockRes();
    const passNext = vi.fn();
    middleware({} as any, passRes, passNext);

    expect(passNext).toHaveBeenCalledTimes(1);
    expect(passRes.status).not.toHaveBeenCalled();
  });
});
