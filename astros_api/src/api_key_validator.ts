import { RequestHandler } from "express";
import { DataAccess } from "./dal/data_access";
import { SettingsRepository } from "./dal/repositories/settings_repository";
import { logger } from "./logger";

export function ApiKeyValidator() : RequestHandler {
    
    return (async (req, res, next) => {

        logger.info('Validating API key', req);

        const dao = new DataAccess();
        const settings = new SettingsRepository(dao);

        const token = await settings.getSetting('apikey');
        
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
    })
}