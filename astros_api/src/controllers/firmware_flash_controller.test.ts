import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cancelFlashJob, getFlashJob, startFlashJob } from './firmware_flash_controller.js';
import { FlashJobOrchestrator, FlashOrchestratorError } from '../firmware/flash_orchestrator.js';
import type { FlashJobState } from '../models/firmware/flash_job_state.js';
import { FwStage } from '../models/firmware/firmware_messages.js';

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

interface FakeOrchestrator {
  start: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
  getCurrentJob: ReturnType<typeof vi.fn>;
  notifyMasterHeartbeat: ReturnType<typeof vi.fn>;
}

function fakeOrchestrator(): FakeOrchestrator {
  return {
    start: vi.fn(),
    cancel: vi.fn(),
    getCurrentJob: vi.fn(),
    notifyMasterHeartbeat: vi.fn(),
  };
}

const validGithubBody = {
  source: { kind: 'github', version: '1.4.0' },
  controllers: ['ctrl-a', 'ctrl-b'],
};
const validUploadBody = {
  source: { kind: 'upload' },
  controllers: ['ctrl-a'],
};

describe('Firmware Flash Controller', () => {
  let orchestrator: FakeOrchestrator;

  beforeEach(() => {
    orchestrator = fakeOrchestrator();
  });

  describe('POST /api/firmware/flash', () => {
    it('returns 200 with the start envelope on happy path', async () => {
      const envelope = {
        jobId: 'job-1',
        transferId: 'transfer-1',
        source: {
          kind: 'github' as const,
          version: '1.4.0',
          sha256: 'a'.repeat(64),
          sizeBytes: 1024,
          displayName: 'astros-esp 1.4.0 (lolin_d32_pro)',
        },
        targets: ['ctrl-a', 'ctrl-b'],
      };
      orchestrator.start.mockResolvedValueOnce(envelope);

      const req: any = { body: validGithubBody };
      const res = mockRes();

      await startFlashJob(orchestrator as unknown as FlashJobOrchestrator, req, res, vi.fn());

      expect(orchestrator.start).toHaveBeenCalledWith({
        source: { kind: 'github', version: '1.4.0' },
        controllers: ['ctrl-a', 'ctrl-b'],
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(envelope);
    });

    it('accepts a kind=upload body and forwards it to the orchestrator', async () => {
      const envelope = {
        jobId: 'job-2',
        transferId: 'transfer-2',
        source: {
          kind: 'upload' as const,
          version: 'custom',
          sha256: 'b'.repeat(64),
          sizeBytes: 2048,
          displayName: 'firmware.bin',
        },
        targets: ['ctrl-a'],
      };
      orchestrator.start.mockResolvedValueOnce(envelope);

      const req: any = { body: validUploadBody };
      const res = mockRes();

      await startFlashJob(orchestrator as unknown as FlashJobOrchestrator, req, res, vi.fn());

      expect(orchestrator.start).toHaveBeenCalledWith({
        source: { kind: 'upload' },
        controllers: ['ctrl-a'],
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(envelope);
    });

    it('returns 409 with currentJobId on job_already_running', async () => {
      orchestrator.start.mockRejectedValueOnce(
        new FlashOrchestratorError('job_already_running', undefined, 'existing-job-id'),
      );

      const req: any = { body: validGithubBody };
      const res = mockRes();

      await startFlashJob(orchestrator as unknown as FlashJobOrchestrator, req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        error: 'job_already_running',
        currentJobId: 'existing-job-id',
      });
    });

    it('returns 400 on no_controllers', async () => {
      orchestrator.start.mockRejectedValueOnce(new FlashOrchestratorError('no_controllers'));

      const req: any = { body: validGithubBody };
      const res = mockRes();

      await startFlashJob(orchestrator as unknown as FlashJobOrchestrator, req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'no_controllers', detail: undefined });
    });

    it('returns 400 with the mismatched-variants detail on variant_mismatch', async () => {
      orchestrator.start.mockRejectedValueOnce(
        new FlashOrchestratorError('variant_mismatch', 'ctrl-a=lolin_d32_pro, ctrl-b=metro_s3'),
      );

      const req: any = { body: validGithubBody };
      const res = mockRes();

      await startFlashJob(orchestrator as unknown as FlashJobOrchestrator, req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'variant_mismatch',
        detail: 'ctrl-a=lolin_d32_pro, ctrl-b=metro_s3',
      });
    });

    it('returns 400 with the controller-id detail on variant_unknown', async () => {
      orchestrator.start.mockRejectedValueOnce(
        new FlashOrchestratorError('variant_unknown', 'ctrl-a, ctrl-c'),
      );

      const req: any = { body: validGithubBody };
      const res = mockRes();

      await startFlashJob(orchestrator as unknown as FlashJobOrchestrator, req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'variant_unknown',
        detail: 'ctrl-a, ctrl-c',
      });
    });

    it('returns 400 with the missing-MAC list on controllers_unknown', async () => {
      // Type-level exhaustiveness catches removal from REASON_HTTP_STATUS;
      // this pin catches a value mutation (e.g., 400 → 500).
      orchestrator.start.mockRejectedValueOnce(
        new FlashOrchestratorError('controllers_unknown', 'aa:bb:cc:dd:ee:01, aa:bb:cc:dd:ee:02'),
      );

      const req: any = { body: validGithubBody };
      const res = mockRes();

      await startFlashJob(orchestrator as unknown as FlashJobOrchestrator, req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'controllers_unknown',
        detail: 'aa:bb:cc:dd:ee:01, aa:bb:cc:dd:ee:02',
      });
    });

    it('returns 400 on asset_not_found', async () => {
      orchestrator.start.mockRejectedValueOnce(
        new FlashOrchestratorError('asset_not_found', 'lolin_d32_pro'),
      );

      const req: any = { body: validGithubBody };
      const res = mockRes();

      await startFlashJob(orchestrator as unknown as FlashJobOrchestrator, req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'asset_not_found',
        detail: 'lolin_d32_pro',
      });
    });

    it('returns 400 on release_not_found', async () => {
      orchestrator.start.mockRejectedValueOnce(
        new FlashOrchestratorError('release_not_found', 'v9.9.9'),
      );

      const req: any = { body: validGithubBody };
      const res = mockRes();

      await startFlashJob(orchestrator as unknown as FlashJobOrchestrator, req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'release_not_found',
        detail: 'v9.9.9',
      });
    });

    it('returns 400 on no_upload', async () => {
      orchestrator.start.mockRejectedValueOnce(new FlashOrchestratorError('no_upload'));

      const req: any = { body: validUploadBody };
      const res = mockRes();

      await startFlashJob(orchestrator as unknown as FlashJobOrchestrator, req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'no_upload', detail: undefined });
    });

    it('returns 502 on source_resolution_failed', async () => {
      orchestrator.start.mockRejectedValueOnce(
        new FlashOrchestratorError('source_resolution_failed', 'cache fetch refused'),
      );

      const req: any = { body: validGithubBody };
      const res = mockRes();

      await startFlashJob(orchestrator as unknown as FlashJobOrchestrator, req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(502);
      expect(res.json).toHaveBeenCalledWith({
        error: 'source_resolution_failed',
        detail: 'cache fetch refused',
      });
    });

    it('returns 502 on release_lookup_failed', async () => {
      orchestrator.start.mockRejectedValueOnce(
        new FlashOrchestratorError('release_lookup_failed', 'github 503'),
      );

      const req: any = { body: validGithubBody };
      const res = mockRes();

      await startFlashJob(orchestrator as unknown as FlashJobOrchestrator, req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(502);
      expect(res.json).toHaveBeenCalledWith({
        error: 'release_lookup_failed',
        detail: 'github 503',
      });
    });

    it('returns 500 on an unmapped FlashOrchestratorError reason', async () => {
      orchestrator.start.mockRejectedValueOnce(
        new FlashOrchestratorError('controllers_lookup_failed', 'sqlite locked'),
      );

      const req: any = { body: validGithubBody };
      const res = mockRes();

      await startFlashJob(orchestrator as unknown as FlashJobOrchestrator, req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'controllers_lookup_failed',
        detail: 'sqlite locked',
      });
    });

    it('returns 500 on a non-FlashOrchestratorError throw', async () => {
      orchestrator.start.mockRejectedValueOnce(new Error('boom'));

      const req: any = { body: validGithubBody };
      const res = mockRes();

      await startFlashJob(orchestrator as unknown as FlashJobOrchestrator, req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'internal_server_error' });
    });

    it('returns 400 with invalid_body when body is missing', async () => {
      const req: any = { body: undefined };
      const res = mockRes();

      await startFlashJob(orchestrator as unknown as FlashJobOrchestrator, req, res, vi.fn());

      expect(orchestrator.start).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      const payload = res.json.mock.calls[0][0];
      expect(payload.error).toBe('invalid_body');
      expect(typeof payload.detail).toBe('string');
    });

    it('returns 400 with invalid_body when controllers is missing', async () => {
      const req: any = { body: { source: { kind: 'github', version: '1.4.0' } } };
      const res = mockRes();

      await startFlashJob(orchestrator as unknown as FlashJobOrchestrator, req, res, vi.fn());

      expect(orchestrator.start).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      const payload = res.json.mock.calls[0][0];
      expect(payload.error).toBe('invalid_body');
      expect(payload.detail).toMatch(/controllers/);
    });

    it('returns 400 with invalid_body when controllers is empty', async () => {
      const req: any = {
        body: { source: { kind: 'github', version: '1.4.0' }, controllers: [] },
      };
      const res = mockRes();

      await startFlashJob(orchestrator as unknown as FlashJobOrchestrator, req, res, vi.fn());

      expect(orchestrator.start).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      const payload = res.json.mock.calls[0][0];
      expect(payload.error).toBe('invalid_body');
      expect(payload.detail).toMatch(/non-empty/);
    });

    it('returns 400 with invalid_body when controllers contains non-string entries', async () => {
      const req: any = {
        body: {
          source: { kind: 'github', version: '1.4.0' },
          controllers: ['valid-mac', 42],
        },
      };
      const res = mockRes();

      await startFlashJob(orchestrator as unknown as FlashJobOrchestrator, req, res, vi.fn());

      expect(orchestrator.start).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      const payload = res.json.mock.calls[0][0];
      expect(payload.error).toBe('invalid_body');
    });

    it('returns 400 with invalid_body when source.kind is unknown', async () => {
      const req: any = { body: { source: { kind: 'magic' }, controllers: ['ctrl-a'] } };
      const res = mockRes();

      await startFlashJob(orchestrator as unknown as FlashJobOrchestrator, req, res, vi.fn());

      expect(orchestrator.start).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      const payload = res.json.mock.calls[0][0];
      expect(payload.error).toBe('invalid_body');
    });

    it('returns 400 with invalid_body when github source.version is empty', async () => {
      const req: any = {
        body: { source: { kind: 'github', version: '' }, controllers: ['ctrl-a'] },
      };
      const res = mockRes();

      await startFlashJob(orchestrator as unknown as FlashJobOrchestrator, req, res, vi.fn());

      expect(orchestrator.start).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      const payload = res.json.mock.calls[0][0];
      expect(payload.error).toBe('invalid_body');
    });
  });

  describe('DELETE /api/firmware/flash', () => {
    it('returns 200 with cancelled:true when an active job is cancelled', async () => {
      orchestrator.cancel.mockResolvedValueOnce({ jobId: 'job-1' });

      const req: any = { body: { reason: 'user' } };
      const res = mockRes();

      await cancelFlashJob(orchestrator as unknown as FlashJobOrchestrator, req, res, vi.fn());

      expect(orchestrator.cancel).toHaveBeenCalledWith('user');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ jobId: 'job-1', cancelled: true });
    });

    it("defaults the cancel reason to 'http' when none is supplied", async () => {
      orchestrator.cancel.mockResolvedValueOnce({ jobId: 'job-1' });

      const req: any = { body: undefined };
      const res = mockRes();

      await cancelFlashJob(orchestrator as unknown as FlashJobOrchestrator, req, res, vi.fn());

      expect(orchestrator.cancel).toHaveBeenCalledWith('http');
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('returns 404 when no active job is in flight', async () => {
      orchestrator.cancel.mockResolvedValueOnce(null);

      const req: any = { body: {} };
      const res = mockRes();

      await cancelFlashJob(orchestrator as unknown as FlashJobOrchestrator, req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'no_active_job' });
    });

    it('surfaces FlashOrchestratorError reason+detail when cancel throws a typed error', async () => {
      // Symmetric with startFlashJob's error handling. The cancel path
      // is unlikely to throw a typed error today, but the test pins the
      // contract so a future regression to "everything is 500" is
      // caught.
      orchestrator.cancel.mockRejectedValueOnce(
        new FlashOrchestratorError('protocol_violation', 'invalid stage during cancel'),
      );

      const req: any = { body: { reason: 'user' } };
      const res = mockRes();

      await cancelFlashJob(orchestrator as unknown as FlashJobOrchestrator, req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'protocol_violation',
        detail: 'invalid stage during cancel',
      });
    });

    it('falls back to internal_server_error for non-typed cancel throws', async () => {
      orchestrator.cancel.mockRejectedValueOnce(new Error('worker channel closed'));

      const req: any = { body: { reason: 'user' } };
      const res = mockRes();

      await cancelFlashJob(orchestrator as unknown as FlashJobOrchestrator, req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'internal_server_error' });
    });
  });

  describe('GET /api/firmware/flash', () => {
    it('returns 200 with the FlashJobState when a job is active', async () => {
      const state: FlashJobState = {
        jobId: 'job-1',
        source: {
          kind: 'github',
          version: '1.4.0',
          sha256: 'a'.repeat(64),
          sizeBytes: 1024,
          displayName: 'astros-esp 1.4.0 (lolin_d32_pro)',
        },
        controllers: [
          {
            controllerId: 'ctrl-a',
            stage: FwStage.UploadingToMaster,
            bytesSent: 256,
            totalBytes: 1024,
            detail: '',
          },
        ],
        startedAt: '2026-05-03T10:00:00.000Z',
      };
      orchestrator.getCurrentJob.mockReturnValueOnce(state);

      const req: any = {};
      const res = mockRes();

      getFlashJob(orchestrator as unknown as FlashJobOrchestrator, req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(state);
    });

    it('returns 200 with null when no job is active', () => {
      orchestrator.getCurrentJob.mockReturnValueOnce(null);

      const req: any = {};
      const res = mockRes();

      getFlashJob(orchestrator as unknown as FlashJobOrchestrator, req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(null);
    });
  });
});
