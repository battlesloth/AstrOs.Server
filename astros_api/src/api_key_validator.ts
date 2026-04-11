import { RequestHandler } from 'express';
import { SettingsRepository } from './dal/repositories/settings_repository.js';
import { logger } from './logger.js';
import { Kysely } from 'kysely';
import { Database } from './dal/types.js';

const API_KEY_CACHE_TTL_MS = 60_000;

export function ApiKeyValidator(db: Kysely<Database>): RequestHandler {
  let cachedKey: string | null = null;
  let cachedAt = 0;

  return async (req, res, next) => {
    logger.info('Validating API key', req);

    let token: string | null = cachedKey;
    const now = Date.now();

    if (token === null || now - cachedAt >= API_KEY_CACHE_TTL_MS) {
      try {
        token = await new SettingsRepository(db).getSetting('apikey');
        cachedKey = token;
        cachedAt = now;
      } catch (error) {
        cachedKey = null;
        cachedAt = 0;
        logger.error('Error retrieving API key from settings', error);
        res.sendStatus(500);
        return;
      }
    }

    if (req.headers['x-token'] === undefined) {
      logger.warn('API key missing');
      res.sendStatus(401);
      return;
    }

    if (req.headers['x-token'] !== token) {
      logger.warn('Invalid API key');
      res.sendStatus(401);
      return;
    }
    next();
  };
}
