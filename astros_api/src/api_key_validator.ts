import { RequestHandler } from "express";
import { DataAccess } from "./dal/data_access";
import { SettingsRepository } from "./dal/repositories/settings_repository";

export function ApiKeyValidator() : RequestHandler {
    
    return (async (req, res, next) => {
        const dao = new DataAccess();
        const settings = new SettingsRepository(dao);

        const token = await settings.getSetting('apikey');
        
        if (req.headers['x-token'] !== token) {
            res.sendStatus(401);
            return;
        }
        next();
    })
}