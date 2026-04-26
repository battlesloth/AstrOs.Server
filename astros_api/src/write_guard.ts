import { RequestHandler } from 'express';
import { SystemStatus } from './system_status.js';

const BLOCKED_WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const ALLOWED_IN_READONLY: Array<{ method: string; path: string }> = [
  { method: 'POST', path: '/login' },
  { method: 'POST', path: '/reauth' },
  { method: 'POST', path: '/panicStop' },
  { method: 'POST', path: '/panicClear' },
];

const BLOCKED_GET_PATHS = new Set([
  '/locations/syncconfig',
  '/locations/synccontrollers',
  '/scripts/upload',
  '/scripts/run',
  '/playlists/run',
]);

export function writeGuard(systemStatus: SystemStatus): RequestHandler {
  return (req, res, next) => {
    if (!systemStatus.isReadOnly()) {
      next();
      return;
    }

    const allowlisted = ALLOWED_IN_READONLY.some(
      (entry) => entry.method === req.method && entry.path === req.path,
    );
    if (allowlisted) {
      next();
      return;
    }

    const blockedWrite = BLOCKED_WRITE_METHODS.has(req.method);
    const blockedGet = req.method === 'GET' && BLOCKED_GET_PATHS.has(req.path);

    if (blockedWrite || blockedGet) {
      const state = systemStatus.getState();
      res.status(503).json({
        message: 'Server is in read-only mode',
        reason: state.reason,
      });
      return;
    }

    next();
  };
}
