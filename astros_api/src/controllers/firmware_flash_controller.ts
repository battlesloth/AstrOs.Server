import { Router } from 'express';
import { logger } from '../logger.js';
import {
  FlashJobOrchestrator,
  FlashOrchestratorError,
  type FlashOrchestratorErrorReason,
} from '../firmware/flash_orchestrator.js';
import type { FlashRequest } from '../models/firmware/flash_orchestrator.js';

const route = '/firmware/flash';

const BAD_REQUEST_REASONS: ReadonlySet<FlashOrchestratorErrorReason> =
  new Set<FlashOrchestratorErrorReason>([
    'no_controllers',
    'variant_mismatch',
    'variant_unknown',
    'release_not_found',
    'asset_not_found',
    'no_upload',
  ]);

const BAD_GATEWAY_REASONS: ReadonlySet<FlashOrchestratorErrorReason> =
  new Set<FlashOrchestratorErrorReason>(['release_lookup_failed', 'source_resolution_failed']);

export function registerFirmwareFlashRoutes(
  router: Router,
  auth: any,
  orchestrator: FlashJobOrchestrator,
) {
  router.post(route, auth, (req: any, res: any, next: any) =>
    startFlashJob(orchestrator, req, res, next),
  );
  router.delete(route, auth, (req: any, res: any, next: any) =>
    cancelFlashJob(orchestrator, req, res, next),
  );
  router.get(route, auth, (req: any, res: any, next: any) =>
    getFlashJob(orchestrator, req, res, next),
  );
}

export async function startFlashJob(
  orchestrator: FlashJobOrchestrator,
  req: any,
  res: any,
  _next: any,
) {
  const validation = validateFlashRequest(req.body);
  if (!validation.ok) {
    res.status(400);
    res.json({ error: 'invalid_body', detail: validation.detail });
    return;
  }

  try {
    const result = await orchestrator.start(validation.request);
    res.status(200);
    res.json(result);
  } catch (error) {
    // Pre-streamer failures (controllers / source resolve / lock-acquire
    // race) surface synchronously here as typed FlashOrchestratorError.
    // Post-`flashJobStarted` failures (mid-deploy bus_send_failed,
    // protocol_violation, the 12 c.6b TransferErrorCodes,
    // streamer_unknown_error) are routed through the orchestrator's
    // failJob path and broadcast on WS as `flashJobFailed`; HTTP returns
    // 500 here only as a generic "synchronous failure" marker — the WS
    // surface is the operator's truth source for those cases.
    if (error instanceof FlashOrchestratorError) {
      if (error.reason === 'job_already_running') {
        res.status(409);
        res.json({ error: 'job_already_running', currentJobId: error.currentJobId });
        return;
      }
      if (BAD_REQUEST_REASONS.has(error.reason)) {
        res.status(400);
        res.json({ error: error.reason, detail: error.detail });
        return;
      }
      if (BAD_GATEWAY_REASONS.has(error.reason)) {
        res.status(502);
        res.json({ error: error.reason, detail: error.detail });
        return;
      }
      logger.error(error);
      res.status(500);
      res.json({ error: error.reason, detail: error.detail });
      return;
    }
    logger.error(error);
    res.status(500);
    res.json({ error: 'internal_server_error' });
  }
}

export async function cancelFlashJob(
  orchestrator: FlashJobOrchestrator,
  req: any,
  res: any,
  _next: any,
) {
  try {
    const reason =
      typeof req.body?.reason === 'string' && req.body.reason.length > 0 ? req.body.reason : 'http';
    const result = await orchestrator.cancel(reason);
    if (result === null) {
      res.status(404);
      res.json({ error: 'no_active_job' });
      return;
    }
    res.status(200);
    res.json({ jobId: result.jobId, cancelled: true });
  } catch (error) {
    // Symmetric with startFlashJob: surface FlashOrchestratorError
    // reason+detail when the orchestrator throws a typed error rather
    // than collapsing every failure to a generic 500. Today the cancel
    // path is unlikely to throw a typed error, but the symmetry keeps
    // operator-facing failure shapes consistent across the route.
    if (error instanceof FlashOrchestratorError) {
      logger.error(error);
      res.status(500);
      res.json({ error: error.reason, detail: error.detail });
      return;
    }
    logger.error(error);
    res.status(500);
    res.json({ error: 'internal_server_error' });
  }
}

export function getFlashJob(orchestrator: FlashJobOrchestrator, _req: any, res: any, _next: any) {
  // `getCurrentJob()` is a synchronous field read that can't throw.
  const job = orchestrator.getCurrentJob();
  res.status(200);
  res.json(job);
}

type ValidationResult = { ok: true; request: FlashRequest } | { ok: false; detail: string };

function validateFlashRequest(body: unknown): ValidationResult {
  if (body === null || typeof body !== 'object') {
    return { ok: false, detail: 'request body must be an object' };
  }
  const source = (body as { source?: unknown }).source;
  if (source === null || typeof source !== 'object') {
    return { ok: false, detail: 'source must be an object' };
  }
  const kind = (source as { kind?: unknown }).kind;
  if (kind === 'github') {
    const version = (source as { version?: unknown }).version;
    if (typeof version !== 'string' || version.length === 0) {
      return { ok: false, detail: 'source.version must be a non-empty string' };
    }
    return { ok: true, request: { source: { kind: 'github', version } } };
  }
  if (kind === 'upload') {
    return { ok: true, request: { source: { kind: 'upload' } } };
  }
  return { ok: false, detail: "source.kind must be 'github' or 'upload'" };
}
