import type { RequestHandler } from 'express';
import type { JobLock } from './job_lock.js';
import type { LockedErrorResponse } from './models/networking/lock_responses.js';

export function requireUnlocked(lock: JobLock): RequestHandler {
  return (req, res, next) => {
    if (!lock.isLocked()) {
      next();
      return;
    }
    const body: LockedErrorResponse = {
      error: 'flashJobActive',
      lockOwner: lock.getOwner(),
      since: lock.getSince(),
    };
    res.status(423).json(body);
  };
}
