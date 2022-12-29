import { DataAccess } from "src/dal/data_access";
import { ScriptRepository } from "src/dal/repositories/script_repository";

export class ScriptsController {

    public static getRoute = '/scripts/'
    public static putRoute = '/scripts/'
    public static getAllRoute = '/scripts/all'
    public static upload = '/scripts/upload'
    public static run = '/scripts/run'

    public static async getAllScripts(req: any, res: any, next: any){
        try {
            const dao = new DataAccess();
            const repo = new ScriptRepository(dao);

            const scripts = await repo.getScripts();

            res.status(200);
            res.json(scripts);

        } catch (error) {
            console.log(error);

            res.status(500);
            res.json({
                message: 'Internal server error'
            });
        }
    }

    public static async getScript(req: any, res: any, next: any){
        try {
            const dao = new DataAccess();
            const repo = new ScriptRepository(dao);

            const scripts = await repo.getScript(req.query.id);

            res.status(200);
            res.json(scripts);

        } catch (error) {
            console.log(error);

            res.status(500);
            res.json({
                message: 'Internal server error'
            });
        }
    }
    
    public static async saveScript(req: any, res: any, next: any) {
        try {
            const dao = new DataAccess();
            const repo = new ScriptRepository(dao);

            if (await repo.saveScript(req.body)) {
                res.status(200);
                res.json({ message: 'success' });
            } else {
                res.status(500);
                res.json({
                    message: 'failed'
                });
            }
        } catch (error) {
            console.log(error);

            res.status(500);
            res.json({
                message: 'Internal server error'
            });
        }
    }

    public static async deleteScript(req: any, res: any, next: any) {
        try {
            const dao = new DataAccess();
            const repo = new ScriptRepository(dao);

            await repo.deleteScript(req.query.id);

            res.status(200);
            res.json({ message: 'success' });

        } catch (error) {
            console.log(error);

            res.status(500);
            res.json({
                message: 'Internal server error'
            });
        }
    }
}