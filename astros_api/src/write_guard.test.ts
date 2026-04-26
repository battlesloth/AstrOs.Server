import { describe, it, expect, vi } from 'vitest';
import { SystemStatus } from './system_status.js';
import { writeGuard } from './write_guard.js';

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function call(
  method: string,
  path: string,
  status: SystemStatus,
): { res: any; next: ReturnType<typeof vi.fn> } {
  const guard = writeGuard(status);
  const req: any = { method, path };
  const res = mockRes();
  const next = vi.fn();
  guard(req, res, next);
  return { res, next };
}

describe('writeGuard', () => {
  describe('when not in read-only mode', () => {
    it('passes through writes', () => {
      const status = new SystemStatus();
      for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) {
        const { res, next } = call(m, '/scripts', status);
        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();
      }
    });

    it('passes through reads, including the serial-write GETs', () => {
      const status = new SystemStatus();
      for (const p of ['/anything', '/locations/syncconfig', '/scripts/upload', '/scripts/run']) {
        const { next } = call('GET', p, status);
        expect(next).toHaveBeenCalledTimes(1);
      }
    });
  });

  describe('when in read-only mode', () => {
    function readOnly(reason = 'test reason'): SystemStatus {
      const s = new SystemStatus();
      s.enterReadOnly(reason);
      return s;
    }

    it('blocks POST/PUT/PATCH/DELETE with 503 and includes reason', () => {
      const status = readOnly('migration failed');
      for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) {
        const { res, next } = call(m, '/scripts', status);
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(503);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({ reason: 'migration failed' }),
        );
      }
    });

    it('allows allowlisted POSTs (login, reauth, panicStop, panicClear)', () => {
      const status = readOnly();
      for (const p of ['/login', '/reauth', '/panicStop', '/panicClear']) {
        const { res, next } = call('POST', p, status);
        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();
      }
    });

    it('allows GET requests for safe read paths', () => {
      const status = readOnly();
      for (const p of ['/scripts', '/playlists', '/system/status']) {
        const { next } = call('GET', p, status);
        expect(next).toHaveBeenCalledTimes(1);
      }
    });

    it('blocks the five serial-write GET paths with 503', () => {
      const status = readOnly('boom');
      const blockedGets = [
        '/locations/syncconfig',
        '/locations/synccontrollers',
        '/scripts/upload',
        '/scripts/run',
        '/playlists/run',
      ];
      for (const p of blockedGets) {
        const { res, next } = call('GET', p, status);
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(503);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ reason: 'boom' }));
      }
    });
  });
});
