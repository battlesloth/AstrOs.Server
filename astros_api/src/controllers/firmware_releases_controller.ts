import { Router } from 'express';
import { logger } from '../logger.js';
import type { GitHubReleaseService } from '../firmware/github_release_service.js';

const route = '/firmware/releases';

export function registerFirmwareReleasesRoutes(
  router: Router,
  auth: any,
  service: GitHubReleaseService,
) {
  router.get(route, auth, (req: any, res: any, next: any) => getReleases(service, req, res, next));
}

export async function getReleases(service: GitHubReleaseService, _req: any, res: any, _next: any) {
  try {
    const result = await service.getReleases();
    res.status(200).json(result);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    logger.error(`firmware releases fetch failed: ${detail}`);
    res.status(502).json({ error: 'release_lookup_failed' });
  }
}
