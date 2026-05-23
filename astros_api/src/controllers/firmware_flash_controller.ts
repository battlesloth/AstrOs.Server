import { Router } from 'express';
import { logger } from '../logger.js';
import {
  FlashJobOrchestrator,
  FlashOrchestratorError,
  type FlashOrchestratorErrorReason,
} from '../firmware/flash_orchestrator.js';
import type { FlashRequest } from '../models/firmware/flash_orchestrator.js';

const route = '/firmware/flash';

type HttpStatus = 400 | 409 | 500 | 502;

// Exhaustive map from every FlashOrchestratorErrorReason to its HTTP
// status. The Record type makes this exhaustive at compile time —
// adding a new reason without updating the map is a TS error, so the
// silent fall-through-to-500 hazard is closed. Statuses:
//   * 409 — concurrent flash (operator should wait)
//   * 400 — pre-streamer validation the operator can fix
//   * 502 — upstream-dependency failure (cache fetch, github fetch)
//   * 500 — post-`flashJobStarted` failures whose truth source is the
//     WS broadcast; HTTP just signals "synchronous failure" to the
//     operator-side caller.
const REASON_HTTP_STATUS: Record<FlashOrchestratorErrorReason, HttpStatus> = {
  job_already_running: 409,

  no_controllers: 400,
  controllers_unknown: 400,
  variant_mismatch: 400,
  variant_unknown: 400,
  release_not_found: 400,
  asset_not_found: 400,
  no_upload: 400,

  release_lookup_failed: 502,
  source_resolution_failed: 502,

  controllers_lookup_failed: 500,
  subscriber_attach_failed: 500,
  protocol_violation: 500,
  streamer_unknown_error: 500,

  source_read_failed: 500,
  source_size_mismatch: 500,
  source_sha_mismatch: 500,
  begin_timeout: 500,
  begin_rejected: 500,
  chunk_retry_exhausted: 500,
  flash_full: 500,
  transfer_timeout: 500,
  aborted: 500,
  end_timeout: 500,
  hash_mismatch: 500,
  master_io_error: 500,
  bus_send_failed: 500,
};

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
    // Only pre-spawn failures reach this catch — controllers validation,
    // source resolution, `controllers_lookup_failed`, and
    // `job_already_running`. Post-`flashJobStarted` failures fire inside
    // the orchestrator's background IIFE, after `start()` resolved and
    // HTTP returned 200; the operator-facing truth source for them is
    // the `flashJobFailed` WS event. Those entries remain in
    // `REASON_HTTP_STATUS` only for type exhaustiveness.
    if (error instanceof FlashOrchestratorError) {
      const status = REASON_HTTP_STATUS[error.reason];
      if (status === 409) {
        res.status(409);
        res.json({ error: 'job_already_running', currentJobId: error.currentJobId });
        return;
      }
      if (status === 500) {
        logger.error(error);
      } else if (status === 502) {
        // Upstream-dependency failures (GitHub release lookup, cache fetch IO).
        // The operator sees a 502 with `detail`; without this log, server-side
        // has no breadcrumb to correlate against the user-visible failure.
        logger.warn(error, 'flash request: upstream dependency failed');
      }
      res.status(status);
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
  const controllers = (body as { controllers?: unknown }).controllers;
  if (!Array.isArray(controllers)) {
    return { ok: false, detail: 'controllers must be an array' };
  }
  if (controllers.length === 0) {
    return { ok: false, detail: 'controllers must be non-empty' };
  }
  if (!controllers.every((c) => typeof c === 'string' && c.length > 0)) {
    return { ok: false, detail: 'controllers must be an array of non-empty strings' };
  }
  const kind = (source as { kind?: unknown }).kind;
  if (kind === 'github') {
    const version = (source as { version?: unknown }).version;
    if (typeof version !== 'string' || version.length === 0) {
      return { ok: false, detail: 'source.version must be a non-empty string' };
    }
    return { ok: true, request: { source: { kind: 'github', version }, controllers } };
  }
  if (kind === 'upload') {
    return { ok: true, request: { source: { kind: 'upload' }, controllers } };
  }
  return { ok: false, detail: "source.kind must be 'github' or 'upload'" };
}
