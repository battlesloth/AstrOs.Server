import type { WebSocket } from 'ws';
import type { JobLock } from './job_lock.js';
import { logger } from './logger.js';
import {
  WS_WRITE_CLASS_MESSAGE_TYPES,
  buildFlashJobActiveResponse,
  buildLockStateResponse,
} from './models/networking/lock_responses.js';

/**
 * WebSocket-side counterpart to the HTTP gate in writeGuard. When an inbound
 * write-class message (per WS_WRITE_CLASS_MESSAGE_TYPES) arrives while the
 * lock is held, sends the originating client a lockStateChanged echo plus a
 * flashJobActive error frame and signals to the caller that normal dispatch
 * should be skipped. Returns false (and sends nothing) when the lock is free
 * or the message is not write-class.
 *
 * HTTP write-class requests are gated by writeGuard at the global mount;
 * this helper exists because WebSocket inbound doesn't pass through Express
 * middleware.
 */
export function rejectIfLocked(msgType: string, conn: WebSocket, lock: JobLock): boolean {
  if (!WS_WRITE_CLASS_MESSAGE_TYPES.has(msgType) || !lock.isLocked()) {
    return false;
  }
  const state = lock.getState();
  try {
    conn.send(JSON.stringify(buildLockStateResponse(state)));
    conn.send(JSON.stringify(buildFlashJobActiveResponse(state, msgType)));
    logger.warn(`websocket write-class message ${msgType} rejected: lock held by ${state.owner}`);
  } catch (err) {
    logger.error(`error sending lock state response for rejected message ${msgType}: ${err}`);
  }
  return true;
}
