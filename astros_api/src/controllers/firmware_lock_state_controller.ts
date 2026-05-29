import { Router } from 'express';
import { JobLock } from '../job_lock/job_lock.js';

const route = '/firmware/lock-state';

export function registerFirmwareLockStateRoutes(router: Router, jobLock: JobLock) {
  router.get(route, (req: any, res: any) => getLockState(jobLock, req, res));
}

export function getLockState(jobLock: JobLock, _req: any, res: any) {
  res.status(200).json(jobLock.getState());
}
