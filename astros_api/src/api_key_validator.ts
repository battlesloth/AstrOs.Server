import { RequestHandler } from 'express';
import { SettingsRepository } from './dal/repositories/settings_repository.js';
import { logger } from './logger.js';
import { db } from './dal/database.js';

export function ApiKeyValidator(): RequestHandler {
  return async (req, res, next) => {
    logger.info('Validating API key', req);

    const settings = new SettingsRepository(db);

    let token: string | null = null;

    try {
      token = await settings.getSetting('apikey');
    } catch (error) {
      logger.error('Error retrieving API key from settings', error);
      res.sendStatus(500);
      return;
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
