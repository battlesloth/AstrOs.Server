import { RequestHandler } from 'express';
import { JobLock } from '../job_lock/job_lock.js';
import { SystemStatus } from '../system_status.js';

const BLOCKED_WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const ALLOWED_IN_READONLY: Array<{ method: string; path: string }> = [
  { method: 'POST', path: '/login' },
  { method: 'POST', path: '/reauth' },
  { method: 'POST', path: '/panicStop' },
  { method: 'POST', path: '/panicClear' },
];

// Flash-active mode is stricter than read-only: panic stop / clear are
// intentionally NOT allowed while a flash job is running because emitting a
// PANIC_STOP frame on the serial port would interleave with FW_CHUNK frames
// and corrupt the in-flight transfer. Login / reauth still work so a fresh
// session can attach to the live job.
const ALLOWED_DURING_FLASH: Array<{ method: string; path: string }> = [
  { method: 'POST', path: '/login' },
  { method: 'POST', path: '/reauth' },
];

const BLOCKED_GET_PATHS = new Set([
  '/locations/syncconfig',
  '/locations/synccontrollers',
  '/scripts/upload',
  '/scripts/run',
  '/playlists/run',
]);

function isAllowed(
  list: Array<{ method: string; path: string }>,
  method: string,
  path: string,
): boolean {
  return list.some((entry) => entry.method === method && entry.path === path);
}

/**
 * Gates write-class HTTP requests. Two distinct rejection modes share one
 * "is this a write?" definition (BLOCKED_WRITE_METHODS + BLOCKED_GET_PATHS):
 *
 *   - 503 when the server is in read-only mode (DB recovery, etc.).
 *   - 423 when a flash job is active (per .docs/protocol.md hard-lock spec).
 *
 * Hot path (no gates active) skips the write-class detection entirely and
 * calls next() directly. When at least one gate is active we then check
 * whether the request is write-class and apply the relevant gate(s).
 * Read-only is checked first; a request must clear BOTH gates to proceed.
 */
export function writeGuard(systemStatus: SystemStatus, jobLock: JobLock): RequestHandler {
  return (req, res, next) => {
    const readOnly = systemStatus.isReadOnly();
    const locked = jobLock.isLocked();

    // Hot path: neither gate is active. Skip the write-class detection and
    // any allowlist lookups entirely — every read AND every write passes
    // through with a single pair of property accesses.
    if (!readOnly && !locked) {
      next();
      return;
    }

    // At least one gate is active. Now figure out whether this request even
    // needs gating before doing more work.
    const blockedWrite = BLOCKED_WRITE_METHODS.has(req.method);
    const blockedGet = req.method === 'GET' && BLOCKED_GET_PATHS.has(req.path);
    if (!blockedWrite && !blockedGet) {
      next();
      return;
    }

    if (readOnly && !isAllowed(ALLOWED_IN_READONLY, req.method, req.path)) {
      const state = systemStatus.getState();
      res.status(503).json({
        message: 'Server is in read-only mode',
        reasonCode: state.reasonCode,
      });
      return;
    }

    if (locked && !isAllowed(ALLOWED_DURING_FLASH, req.method, req.path)) {
      res.status(423).json({
        error: 'flashJobActive',
        lockOwner: jobLock.getOwner(),
        since: jobLock.getSince(),
      });
      return;
    }

    next();
  };
}
